#!/bin/sh
# Restore a dump into a throwaway Postgres container and check that it is
# usable: migrations match the repo and the main tables are not empty.
#
# Usage: restore-test.sh [--no-live] [FILE]
#   (no FILE)    newest dump in BACKUP_DIR: its .sha256 is required and it
#                fails when the dump is older than MAX_AGE_H hours (default
#                36; ALLOW_STALE=1 skips this on purpose)
#   FILE         a specific dump file (checksum used when present, no age check)
#   --no-live    do not compare with the live database (when it is down, or on
#                a machine that only holds pulled copies)
# Config: same variables and BACKUP_ENV_FILE as pg-backup.sh. The postgres image
# is RESTORE_IMAGE when set, else the `image: postgres:...` line of COMPOSE_FILE
# (read as text, so no production .env is needed). COMPOSE_FILE is also used to
# reach the live database unless --no-live. ALLOW_EMPTY=1 accepts a restore
# whose users or stories table is empty (a fresh install).
set -eu

usage() {
  echo "usage: $0 [--no-live] [FILE]" >&2
  exit 2
}

NO_LIVE=0
SOURCE=''
for arg do
  case "$arg" in
    --no-live) NO_LIVE=1 ;;
    [!-]*)
      [ -z "$SOURCE" ] || usage
      SOURCE=$arg
      ;;
    *) usage ;;
  esac
done

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
JOURNAL="$REPO_ROOT/packages/db/drizzle/meta/_journal.json"
CHECK_TABLES='users stories chapters chapter_contents reports'

BACKUP_ENV_FILE="${BACKUP_ENV_FILE:-/etc/novel-hub/backup.env}"
if [ -f "$BACKUP_ENV_FILE" ]; then
  set -a
  # shellcheck source=/dev/null
  . "$BACKUP_ENV_FILE"
  set +a
fi

COMPOSE_FILE="${COMPOSE_FILE:-$REPO_ROOT/docker-compose.yml}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/novel-hub/postgres}"
MAX_AGE_H="${MAX_AGE_H:-36}"
ALLOW_EMPTY="${ALLOW_EMPTY:-0}"
ALLOW_STALE="${ALLOW_STALE:-0}"
RESTORE_COMPOSE_FILE="$SCRIPT_DIR/restore-test.compose.yml"

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

die() {
  log "error: $*" >&2
  exit 1
}

compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

# require_free DIR BYTES: die unless the filesystem of DIR has BYTES free.
require_free() {
  avail_kb=$(df -Pk "$1" 2>/dev/null | awk 'NR == 2 { print $4 }')
  [ -n "$avail_kb" ] || die "cannot read free space of $1"
  need_kb=$(($2 / 1024 + 1))
  [ "$avail_kb" -ge "$need_kb" ] ||
    die "not enough free space in $1: ${avail_kb} KiB free, about ${need_kb} KiB needed"
}

# utc_stamp EPOCH: the same UTC stamp as in dump names (GNU date, then BSD).
utc_stamp() {
  date -u -d "@$1" +%Y%m%dT%H%M%SZ 2>/dev/null || date -u -r "$1" +%Y%m%dT%H%M%SZ
}

RESTORE_PROJECT="novel-hub-restore-test-$$"
RESTORE_STARTED=0
TMP_DIR=''

# Only ever the throwaway project; the real stack is never addressed here.
restore_compose() {
  RESTORE_IMAGE="$IMAGE" RESTORE_PASSWORD="$RESTORE_PASSWORD" \
    docker compose --progress quiet -p "$RESTORE_PROJECT" -f "$RESTORE_COMPOSE_FILE" "$@"
}

on_exit() {
  status=$?
  # -v also drops the anonymous data volume holding the restored database.
  if [ "$RESTORE_STARTED" -eq 1 ]; then
    restore_compose down -v --timeout 5 >/dev/null 2>&1 || true
  fi
  if [ -n "$TMP_DIR" ]; then
    rm -rf "$TMP_DIR"
  fi
  if [ "$status" -eq 0 ]; then
    log "restore test PASSED"
  else
    log "restore test FAILED (exit $status)" >&2
  fi
  exit "$status"
}
trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

case "$MAX_AGE_H" in
  '' | *[!0-9]* | 0?*) die "MAX_AGE_H must be a whole number of hours without a leading zero" ;;
esac

command -v docker >/dev/null 2>&1 || die "docker not found"
if [ -z "${RESTORE_IMAGE:-}" ] || [ "$NO_LIVE" -eq 0 ]; then
  [ -f "$COMPOSE_FILE" ] || die "compose file not found: $COMPOSE_FILE"
fi
[ -f "$RESTORE_COMPOSE_FILE" ] || die "compose file not found: $RESTORE_COMPOSE_FILE"
[ -f "$JOURNAL" ] || die "migration journal not found: $JOURNAL"
if command -v sha256sum >/dev/null 2>&1; then
  SHA256='sha256sum'
elif command -v shasum >/dev/null 2>&1; then
  SHA256='shasum -a 256'
else
  die "neither sha256sum nor shasum found"
fi

umask 077
TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/novel-hub-restore.XXXXXX")

# verify_sha256 FILE REQUIRED: check FILE against FILE.sha256.
verify_sha256() {
  if [ ! -f "$1.sha256" ]; then
    [ "$2" = required ] && die "checksum file missing: $1.sha256"
    log "warning: no checksum file for $1, skipping checksum"
    return 0
  fi
  # shellcheck disable=SC2086
  (cd "$(dirname "$1")" && $SHA256 -c "$(basename "$1").sha256" >/dev/null) ||
    die "checksum mismatch for $1"
  log "checksum ok"
}

newest_dump() {
  grep -E '^novel_hub-[0-9]{8}T[0-9]{6}Z\.dump$' | sort | tail -n 1
}

case "$SOURCE" in
  '')
    name=$(find "$BACKUP_DIR" -maxdepth 1 -name 'novel_hub-*.dump' -exec basename {} \; |
      newest_dump)
    [ -n "$name" ] || die "no dump found in $BACKUP_DIR"
    if [ "$ALLOW_STALE" != 1 ]; then
      # Names carry the UTC dump time, and fixed-width stamps compare as strings.
      stamp=${name#novel_hub-}
      stamp=${stamp%.dump}
      cutoff=$(utc_stamp $(($(date -u +%s) - MAX_AGE_H * 3600)))
      if awk -v a="$stamp" -v b="$cutoff" 'BEGIN { exit !(a < b) }'; then
        die "newest dump $name is older than $MAX_AGE_H hours; are backups arriving? (ALLOW_STALE=1 to test it anyway)"
      fi
    fi
    DUMP="$BACKUP_DIR/$name"
    verify_sha256 "$DUMP" required
    ;;
  *)
    [ -f "$SOURCE" ] || die "file not found: $SOURCE"
    DUMP="$SOURCE"
    verify_sha256 "$DUMP" optional
    ;;
esac

# The restored database lives in Docker's storage. Under Docker Desktop that is
# inside a VM, where the host cannot measure it.
dump_size=$(wc -c <"$DUMP" | tr -d ' ')
docker_root=$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || true)
if [ -n "$docker_root" ] && [ -d "$docker_root" ]; then
  require_free "$docker_root" $((dump_size * 3))
else
  log "warning: cannot measure free space of Docker storage, skipping the check"
fi

# Same image as the running stack, so the restore uses the production major.
# `compose config` would need the production .env (required variables), which a
# backup machine does not have, so the image line is read from the file.
IMAGE="${RESTORE_IMAGE:-}"
if [ -z "$IMAGE" ]; then
  IMAGE=$(sed -n "s/^[[:space:]]*image:[[:space:]]*['\"]\{0,1\}\(postgres:[^[:space:]'\"]*\).*/\1/p" \
    "$COMPOSE_FILE" | head -n 1)
fi
[ -n "$IMAGE" ] || die "cannot read the postgres image from $COMPOSE_FILE; set RESTORE_IMAGE"

started=$(date -u +%s)
log "starting $IMAGE as project $RESTORE_PROJECT"
RESTORE_PASSWORD=$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')
RESTORE_STARTED=1
restore_compose up -d --quiet-pull >/dev/null

# Probe over TCP: during initdb the temporary server only listens on the unix
# socket and is restarted afterwards, which would cut a restore in half.
tries=0
until restore_compose exec -T restore pg_isready -q -h 127.0.0.1 -U postgres -d restore_test; do
  tries=$((tries + 1))
  [ "$tries" -lt 60 ] || die "temporary postgres not ready after 60s"
  sleep 1
done

log "restoring $(basename "$DUMP")"
restore_compose exec -T restore pg_restore -U postgres -d restore_test \
  --no-owner --no-privileges --exit-on-error <"$DUMP" ||
  die "pg_restore failed"
log "restore took $(($(date -u +%s) - started))s"

restored_count() {
  restore_compose exec -T restore psql -U postgres -d restore_test -At -v ON_ERROR_STOP=1 -c "$1"
}

# shellcheck disable=SC2016
live_count() {
  compose exec -T postgres sh -c \
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -v ON_ERROR_STOP=1 -c "$1"' sh "$1" \
    2>/dev/null
}

expected=$(grep -c '"tag"' "$JOURNAL")
migrations=$(restored_count 'SELECT count(*) FROM drizzle.__drizzle_migrations') ||
  die "cannot read drizzle.__drizzle_migrations"
log "migrations: restored=$migrations expected=$expected"
[ "$migrations" = "$expected" ] ||
  die "restored migration count does not match the repo journal"

# The dump is a snapshot and the live database keeps changing, so counts are
# printed for a human. Fails: users or stories empty in the restore (unless
# ALLOW_EMPTY=1), any table empty in the restore but not live, and a live
# database that cannot be read (unless --no-live).
failed=0
printf '%-18s %10s %10s\n' table restored live
for table in $CHECK_TABLES; do
  restored=$(restored_count "SELECT count(*) FROM public.$table") ||
    die "cannot count $table in the restored database"
  if [ "$NO_LIVE" -eq 1 ]; then
    live='n/a'
  else
    live=$(live_count "SELECT count(*) FROM public.$table") ||
      die "cannot count $table in the live database; pass --no-live if it is down"
  fi
  printf '%-18s %10s %10s\n' "$table" "$restored" "$live"
  if [ "$restored" = 0 ]; then
    case "$table" in
      users | stories)
        if [ "$ALLOW_EMPTY" != 1 ]; then
          log "error: $table is empty in the restore (set ALLOW_EMPTY=1 for a fresh install)" >&2
          failed=1
        fi
        ;;
    esac
    if [ "$live" != 'n/a' ] && [ "$live" != 0 ]; then
      log "error: $table is empty in the restore but has rows live" >&2
      failed=1
    fi
  fi
done
[ "$failed" -eq 0 ] || exit 1
