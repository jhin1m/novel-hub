#!/bin/sh
# Dump the compose Postgres database, keep the newest BACKUP_KEEP copies on
# this host and copy every local dump missing offsite to the rclone remote.
#
# Usage: pg-backup.sh [--local-only] [--keep N]
#   --local-only  skip the offsite copy on purpose
#   --keep N      keep N local dumps for this run, overriding BACKUP_KEEP
#                 (an emergency snapshot uses a large N to prune nothing)
# BACKUP_ACCEPT_SHRINK=1 accepts a dump that failed the shrink check (see
# below) once: that run prunes as usual and the new dump becomes the
# reference for later runs.
# Config: environment variables, or the file named by BACKUP_ENV_FILE
# (default /etc/novel-hub/backup.env). See backup.env.example.
set -eu

usage() {
  echo "usage: $0 [--local-only] [--keep N]" >&2
  exit 2
}

LOCAL_ONLY=0
KEEP_ARG=''
while [ $# -gt 0 ]; do
  case "$1" in
    --local-only) LOCAL_ONLY=1 ;;
    --keep)
      [ $# -ge 2 ] || usage
      KEEP_ARG=$2
      shift
      ;;
    *) usage ;;
  esac
  shift
done

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)

BACKUP_ENV_FILE="${BACKUP_ENV_FILE:-/etc/novel-hub/backup.env}"
if [ -f "$BACKUP_ENV_FILE" ]; then
  set -a
  # shellcheck source=/dev/null
  . "$BACKUP_ENV_FILE"
  set +a
fi

COMPOSE_FILE="${COMPOSE_FILE:-$REPO_ROOT/docker-compose.yml}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/novel-hub/postgres}"
BACKUP_KEEP="${BACKUP_KEEP:-14}"
[ -z "$KEEP_ARG" ] || BACKUP_KEEP=$KEEP_ARG
BACKUP_MIN_RATIO="${BACKUP_MIN_RATIO:-0.5}"
BACKUP_ACCEPT_SHRINK="${BACKUP_ACCEPT_SHRINK:-0}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-}"

# Joining "remote:" and "/daily" would give "remote:/daily", which some
# backends read as an absolute path.
case "$RCLONE_REMOTE" in
  *:) REMOTE_DAILY="${RCLONE_REMOTE}daily" ;;
  *) REMOTE_DAILY="${RCLONE_REMOTE%/}/daily" ;;
esac

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

die() {
  log "error: $*" >&2
  exit 1
}

# The URL carries the check's secret id: it goes to curl on stdin, so it never
# shows up in the process list or in the log.
ping_healthcheck() {
  [ -n "$HEALTHCHECK_URL" ] || return 0
  printf 'url = "%s%s"\n' "$HEALTHCHECK_URL" "$1" |
    curl -fsS -m 10 --retry 3 -o /dev/null -K - ||
    log "warning: healthcheck ping failed" >&2
}

compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

# Bounded network waits, so a stalled remote fails the run instead of hanging it.
rc() {
  rclone --contimeout 30s --timeout 5m "$@"
}

# require_free DIR BYTES: die unless the filesystem of DIR has BYTES free.
require_free() {
  avail_kb=$(df -Pk "$1" 2>/dev/null | awk 'NR == 2 { print $4 }')
  [ -n "$avail_kb" ] || die "cannot read free space of $1"
  need_kb=$(($2 / 1024 + 1))
  [ "$avail_kb" -ge "$need_kb" ] ||
    die "not enough free space in $1: ${avail_kb} KiB free, about ${need_kb} KiB needed"
}

LOCK_DIR="$BACKUP_DIR/.lock"
LOCK_HELD=0
PARTIAL=''

on_exit() {
  status=$?
  if [ -n "$PARTIAL" ]; then
    rm -f "$PARTIAL" "$FILE.sha256"
  fi
  if [ "$LOCK_HELD" -eq 1 ]; then
    rm -rf "$LOCK_DIR"
  fi
  if [ "$status" -ne 0 ]; then
    log "backup FAILED (exit $status)" >&2
    ping_healthcheck /fail
  fi
  exit "$status"
}
trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

# A leading zero would be read as octal by some shells.
case "$BACKUP_KEEP" in
  '' | *[!0-9]* | 0*) die "BACKUP_KEEP must be a positive integer without a leading zero" ;;
esac
# A decimal like 0.5; 0 turns the shrink check off.
case "$BACKUP_MIN_RATIO" in
  '' | . | *[!0-9.]* | *.*.*) die "BACKUP_MIN_RATIO must be a decimal number such as 0.5" ;;
esac
case "$BACKUP_ACCEPT_SHRINK" in
  0 | 1) ;;
  *) die "BACKUP_ACCEPT_SHRINK must be 0 or 1" ;;
esac
if [ "$LOCAL_ONLY" -eq 0 ] && [ -z "$RCLONE_REMOTE" ]; then
  die "RCLONE_REMOTE is not set; pass --local-only to skip the offsite copy on purpose"
fi
[ -f "$COMPOSE_FILE" ] || die "compose file not found: $COMPOSE_FILE"

command -v docker >/dev/null 2>&1 || die "docker not found"
if [ "$LOCAL_ONLY" -eq 0 ]; then
  command -v rclone >/dev/null 2>&1 || die "rclone not found"
fi
if [ -n "$HEALTHCHECK_URL" ]; then
  command -v curl >/dev/null 2>&1 || die "curl not found"
fi
if command -v sha256sum >/dev/null 2>&1; then
  SHA256='sha256sum'
elif command -v shasum >/dev/null 2>&1; then
  SHA256='shasum -a 256'
else
  die "neither sha256sum nor shasum found"
fi

# Dumps hold password hashes and session tokens: owner-only from the start.
umask 077
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# flock (util-linux) is released by the kernel when the process dies, so it can
# never go stale. macOS has no flock: fall back to an atomic mkdir holding the
# owner's pid.
if command -v flock >/dev/null 2>&1; then
  exec 9>"$BACKUP_DIR/.flock"
  flock -n 9 || die "another backup is running (lock $BACKUP_DIR/.flock)"
elif mkdir "$LOCK_DIR" 2>/dev/null; then
  LOCK_HELD=1
else
  old_pid=$(cat "$LOCK_DIR/pid" 2>/dev/null || true)
  if [ -n "$old_pid" ]; then
    if kill -0 "$old_pid" 2>/dev/null; then
      die "another backup is running (pid $old_pid)"
    fi
  elif [ -z "$(find "$LOCK_DIR" -maxdepth 0 -mmin +360 2>/dev/null)" ]; then
    # Its owner may be between mkdir and writing the pid.
    die "lock $LOCK_DIR is held (no pid yet); remove it by hand if no backup is running"
  fi
  log "removing stale lock left by pid ${old_pid:-unknown}"
  rm -rf "$LOCK_DIR"
  mkdir "$LOCK_DIR" || die "cannot take lock $LOCK_DIR"
  LOCK_HELD=1
fi
if [ "$LOCK_HELD" -eq 1 ]; then
  echo "$$" >"$LOCK_DIR/pid"
fi

# Under the lock, partial files and checksums without a dump come from a
# killed run.
find "$BACKUP_DIR" -maxdepth 1 -name 'novel_hub-*.dump.partial' -exec rm -f {} +
for sum in "$BACKUP_DIR"/novel_hub-*.dump.sha256; do
  [ -e "$sum" ] || continue
  [ -e "${sum%.sha256}" ] || rm -f "$sum"
done

list_dumps() {
  find "$BACKUP_DIR" -maxdepth 1 -name 'novel_hub-*.dump' -exec basename {} \; |
    grep -E '^novel_hub-[0-9]{8}T[0-9]{6}Z\.dump$' |
    sort
}

PREV_NAME=$(list_dumps | tail -n 1)
PREV_SIZE=''
if [ -n "$PREV_NAME" ]; then
  PREV_SIZE=$(wc -c <"$BACKUP_DIR/$PREV_NAME" | tr -d ' ')
  # The dump, a verification pass reading it back and headroom for growth.
  require_free "$BACKUP_DIR" $((PREV_SIZE * 3))
else
  log "warning: no previous dump, skipping the free space check"
fi

# Reference for the shrink check: the largest kept dump, ignoring dumps older
# than the last accepted shrink. Comparing with the previous dump only would
# let a second bad night pass against the first one and prune the good dumps.
BASELINE_FILE="$BACKUP_DIR/.shrink-baseline"
baseline=$(cat "$BASELINE_FILE" 2>/dev/null || true)
REF=$(list_dumps |
  awk -v base="$baseline" '($0 "") >= (base "")' |
  while read -r dump; do
    printf '%s %s\n' "$(wc -c <"$BACKUP_DIR/$dump" | tr -d ' ')" "$dump"
  done |
  sort -n |
  tail -n 1)
REF_SIZE=${REF%% *}
REF_NAME=${REF#* }

started=$(date -u +%s)
NAME="novel_hub-$(date -u +%Y%m%dT%H%M%SZ).dump"
FILE="$BACKUP_DIR/$NAME"
[ ! -e "$FILE" ] || die "$NAME already exists"
PARTIAL="$FILE.partial"

log "dumping database to $FILE"
# pg_dump runs inside the container so the client matches the server major
# version; POSTGRES_* come from the container environment, not from here.
# shellcheck disable=SC2016
compose exec -T postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >"$PARTIAL" ||
  die "pg_dump failed"
[ -s "$PARTIAL" ] || die "pg_dump produced an empty file"

# Converting the whole archive to SQL reads every data block, so a truncated
# or corrupt dump fails here instead of during a real restore.
compose exec -T postgres pg_restore --file=/dev/null <"$PARTIAL" ||
  die "dump failed verification"

# The checksum is written first, so a dump under its final name always has one.
# shellcheck disable=SC2086
sum=$($SHA256 <"$PARTIAL" | awk '{ print $1 }')
printf '%s  %s\n' "$sum" "$NAME" >"$FILE.sha256"
mv "$PARTIAL" "$FILE"
PARTIAL=''

size=$(wc -c <"$FILE" | tr -d ' ')
log "dump ok: $NAME ($size bytes)"

# A dump far smaller than the reference may come from a wiped or broken
# database: keep every older dump and fail loudly, every night, until an
# operator accepts the new size.
SHRUNK=0
if [ -n "$REF" ] &&
  awk -v n="$size" -v p="$REF_SIZE" -v r="$BACKUP_MIN_RATIO" 'BEGIN { exit !(n < p * r) }'; then
  if [ "$BACKUP_ACCEPT_SHRINK" -eq 1 ]; then
    log "accepting $NAME ($size bytes) although below $BACKUP_MIN_RATIO x" \
      "$REF_NAME ($REF_SIZE bytes); it is the new reference"
    printf '%s\n' "$NAME" >"$BASELINE_FILE"
  else
    SHRUNK=1
    log "error: $NAME is $size bytes, below $BACKUP_MIN_RATIO x the largest kept dump" \
      "($REF_NAME, $REF_SIZE bytes); not pruning" >&2
  fi
fi
if [ "$SHRUNK" -eq 0 ]; then
  # Names sort by UTC timestamp, so the oldest come last after a reverse sort.
  list_dumps |
    sort -r |
    tail -n +"$((BACKUP_KEEP + 1))" |
    while read -r old; do
      rm -f "$BACKUP_DIR/$old" "$BACKUP_DIR/$old.sha256"
      log "pruned $old"
    done
fi

if [ "$LOCAL_ONLY" -eq 0 ]; then
  # Copying the whole folder also uploads dumps from days whose upload failed;
  # files already offsite are never rewritten (the bucket lock would refuse).
  log "uploading to offsite remote"
  rc copy "$BACKUP_DIR" "$REMOTE_DAILY" --ignore-existing \
    --include 'novel_hub-*.dump' --include 'novel_hub-*.dump.sha256' ||
    die "upload to the offsite remote failed"
  remote_size=$(rc lsjson "$REMOTE_DAILY/$NAME" | tr -d ' \n' |
    sed -n 's/.*"Size":\([0-9]*\).*/\1/p')
  [ "$remote_size" = "$size" ] ||
    die "remote size '${remote_size:-missing}' does not match local size $size"
  log "offsite copy ok"
else
  log "skipping offsite copy (--local-only)"
fi

[ "$SHRUNK" -eq 0 ] ||
  die "dump shrank below BACKUP_MIN_RATIO; check the database, then run once with" \
    "BACKUP_ACCEPT_SHRINK=1 if the new size is expected"

log "backup done in $(($(date -u +%s) - started))s"
ping_healthcheck ''
