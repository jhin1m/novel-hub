#!/bin/sh
# Run on the backup machine (not the VPS): pull new Postgres dumps from the VPS
# over SSH (Tailscale) with rsync, check them, keep the newest PULL_KEEP.
#
# The VPS only exposes its dump folder read-only (forced command
# `rrsync -ro`), and holds no credential for this machine, so taking over the
# VPS cannot delete these copies. A taken-over VPS can still serve fake files,
# so every run refuses to: overwrite a dump already held, accept more than
# PULL_MAX_NEW new dumps, accept a dump named in the future, accept a bad
# checksum (the .sha256 file must name exactly that dump), or prune after a
# sharp size drop. The first dump pulled in each calendar month is also kept
# under PULL_DEST/monthly (PULL_MONTHLY_KEEP months, default 12; 0 turns this
# off) and is never touched by the daily pruning, so a taken-over VPS that
# rotates good dumps out of the daily window still leaves an older good copy.
#
# Usage: pull-offsite-backup.sh [--dry-run]
#   --dry-run  list the dumps that would be pulled and change nothing
# PULL_ACCEPT_SHRINK=1 (command line only) accepts a shrunk newest dump once:
# it prunes as usual and becomes the reference for later runs.
# Config: variables, or the file named by PULL_ENV_FILE (default
# $HOME/.config/novel-hub/pull.env, mode 600). See pull.env.example.
set -eu

DRY_RUN=0
case "${1:-}" in
  '') ;;
  --dry-run) DRY_RUN=1 ;;
  *)
    echo "usage: $0 [--dry-run]" >&2
    exit 2
    ;;
esac

PULL_ENV_FILE="${PULL_ENV_FILE:-$HOME/.config/novel-hub/pull.env}"
if [ -f "$PULL_ENV_FILE" ]; then
  set -a
  # shellcheck source=/dev/null
  . "$PULL_ENV_FILE"
  set +a
fi

PULL_SOURCE="${PULL_SOURCE:-}"
PULL_DEST="${PULL_DEST:-}"
PULL_SSH_KEY="${PULL_SSH_KEY:-}"
PULL_KEEP="${PULL_KEEP:-30}"
PULL_MAX_NEW="${PULL_MAX_NEW:-1}"
PULL_MONTHLY_KEEP="${PULL_MONTHLY_KEEP:-12}"
PULL_MIN_RATIO="${PULL_MIN_RATIO:-0.5}"
PULL_ACCEPT_SHRINK="${PULL_ACCEPT_SHRINK:-0}"
MAX_AGE_H="${MAX_AGE_H:-36}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-}"
# PULL_RSH replaces the ssh transport; only for trying the script without sshd.
PULL_RSH="${PULL_RSH:-}"

NAME_RE='^novel_hub-[0-9]{8}T[0-9]{6}Z\.dump$'

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

LISTING=''

on_exit() {
  status=$?
  if [ -n "$LISTING" ]; then
    rm -f "$LISTING" "$LISTING.new"
  fi
  if [ "$DRY_RUN" -eq 0 ] && [ "$status" -ne 0 ]; then
    log "pull FAILED (exit $status)" >&2
    ping_healthcheck /fail
  fi
  exit "$status"
}
trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

case "$PULL_MONTHLY_KEEP" in
  0) ;; # monthly copies off
  '' | *[!0-9]* | 0*) die "PULL_MONTHLY_KEEP must be 0 or a positive integer without a leading zero" ;;
esac
for var in PULL_KEEP PULL_MAX_NEW MAX_AGE_H; do
  eval "val=\$$var"
  case "$val" in
    '' | *[!0-9]* | 0*) die "$var must be a positive integer without a leading zero" ;;
  esac
done
case "$PULL_MIN_RATIO" in
  '' | . | *[!0-9.]* | *.*.*) die "PULL_MIN_RATIO must be a decimal number such as 0.5" ;;
esac
case "$PULL_ACCEPT_SHRINK" in
  0 | 1) ;;
  *) die "PULL_ACCEPT_SHRINK must be 0 or 1" ;;
esac
[ -n "$PULL_SOURCE" ] || die "PULL_SOURCE is not set"
case "$PULL_DEST" in
  /*) ;;
  *) die "PULL_DEST must be an absolute path" ;;
esac
if [ -z "$PULL_RSH" ]; then
  [ -f "$PULL_SSH_KEY" ] || die "PULL_SSH_KEY not found: ${PULL_SSH_KEY:-unset}"
  PULL_RSH="ssh -i $PULL_SSH_KEY -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=30 -o ServerAliveInterval=30"
fi
for cmd in rsync sha256sum awk; do
  command -v "$cmd" >/dev/null 2>&1 || die "$cmd not found"
done
if [ -n "$HEALTHCHECK_URL" ]; then
  command -v curl >/dev/null 2>&1 || die "curl not found"
fi

# Dumps hold email addresses and password hashes: owner-only from the start.
umask 077
INCOMING="$PULL_DEST/.incoming"
if [ "$DRY_RUN" -eq 0 ]; then
  mkdir -p "$PULL_DEST"
  chmod 700 "$PULL_DEST"
  command -v flock >/dev/null 2>&1 || die "flock not found"
  exec 9>"$PULL_DEST/.flock"
  flock -n 9 || die "another pull is running (lock $PULL_DEST/.flock)"
  # Left over from a run that stopped halfway.
  rm -rf "$INCOMING"
  mkdir "$INCOMING"
fi

list_dumps() {
  [ -d "$PULL_DEST" ] || return 0
  find "$PULL_DEST" -maxdepth 1 -name 'novel_hub-*.dump' -exec basename {} \; |
    grep -E "$NAME_RE" |
    sort || true
}

# utc_stamp EPOCH: the same UTC stamp as in dump names (GNU date, then BSD).
utc_stamp() {
  date -u -d "@$1" +%Y%m%dT%H%M%SZ 2>/dev/null || date -u -r "$1" +%Y%m%dT%H%M%SZ
}

file_size() {
  wc -c <"$1" | tr -d ' '
}

# --- 1. list what the VPS offers -------------------------------------------
LISTING=$(mktemp "${TMPDIR:-/tmp}/novel-hub-pull.XXXXXX")
log "listing $PULL_SOURCE"
rsync --list-only -e "$PULL_RSH" \
  --include='novel_hub-*.dump' --exclude='*' "$PULL_SOURCE" >"$LISTING" ||
  die "cannot list the source"
# Last column is the file name (dump names hold no spaces); drop everything else.
awk '{ print $NF }' "$LISTING" | grep -E "$NAME_RE" | sort >"$LISTING.new" || true

# --- 2. decide which dumps are new -----------------------------------------
HELD=$(list_dumps)
HELD_COUNT=$(printf '%s' "$HELD" | grep -c . || true)
# A dump is new only when it is named later than the newest one held: held
# names are never fetched again whatever the source serves under them, and
# dumps pruned here (the source may keep more) do not come back.
NEWEST_HELD=$(printf '%s\n' "$HELD" | tail -n 1)
NEW=$(awk -v newest="$NEWEST_HELD" '($0 "") > (newest "")' "$LISTING.new")
NEW_COUNT=$(printf '%s' "$NEW" | grep -c . || true)
log "source offers $(grep -c . "$LISTING.new" || true) dump(s), $NEW_COUNT new, $HELD_COUNT held"

# A fresh destination may take a full history once; later runs stay small.
LIMIT=$PULL_MAX_NEW
[ "$HELD_COUNT" -gt 0 ] || LIMIT=$PULL_KEEP
[ "$NEW_COUNT" -le "$LIMIT" ] ||
  die "too many new dumps ($NEW_COUNT, limit $LIMIT); inspect the source, then raise PULL_MAX_NEW for one run"

# Names carry the UTC dump time, and fixed-width stamps compare as strings.
future=$(utc_stamp $(($(date -u +%s) + 3600)))
for name in $NEW; do
  stamp=${name#novel_hub-}
  stamp=${stamp%.dump}
  if awk -v a="$stamp" -v b="$future" 'BEGIN { exit !(a > b) }'; then
    die "$name is dated in the future"
  fi
done

if [ "$DRY_RUN" -eq 1 ]; then
  for name in $NEW; do log "would pull $name"; done
  exit 0
fi

# --- 3. fetch into .incoming and verify ------------------------------------
for name in $NEW; do
  for file in "$name" "$name.sha256"; do
    rsync -t --ignore-existing --chmod=F600 -e "$PULL_RSH" "$PULL_SOURCE$file" "$INCOMING/" ||
      die "cannot fetch $file"
  done
  [ -s "$INCOMING/$name" ] || die "$name is empty"
  # The checksum file must be one line naming exactly this dump; otherwise a
  # source could pair the dump with the checksum of some other file.
  [ "$(grep -c . "$INCOMING/$name.sha256")" -eq 1 ] &&
    [ "$(awk '{ sub(/^\*/, "", $2); print $2 }' "$INCOMING/$name.sha256")" = "$name" ] ||
    die "$name.sha256 does not reference $name"
  (cd "$INCOMING" && sha256sum -c "$name.sha256" >/dev/null 2>&1) ||
    die "checksum mismatch for $name; left in $INCOMING"
  log "fetched and verified $name ($(file_size "$INCOMING/$name") bytes)"
done

# Checksum first, then the dump: a dump under its final name always has one.
for name in $NEW; do
  mv "$INCOMING/$name.sha256" "$PULL_DEST/$name.sha256"
  mv "$INCOMING/$name" "$PULL_DEST/$name"
done
rm -rf "$INCOMING"

# --- 4. sanity of what is held now -----------------------------------------
NEWEST=$(list_dumps | tail -n 1)
[ -n "$NEWEST" ] || die "no dump held after the pull"
newest_size=$(file_size "$PULL_DEST/$NEWEST")

# Reference: the largest held dump at or after the last accepted shrink.
BASELINE_FILE="$PULL_DEST/.shrink-baseline"
baseline=$(cat "$BASELINE_FILE" 2>/dev/null || true)
REF=$(list_dumps |
  awk -v base="$baseline" '($0 "") >= (base "")' |
  while read -r dump; do
    printf '%s %s\n' "$(file_size "$PULL_DEST/$dump")" "$dump"
  done |
  sort -n |
  tail -n 1)
REF_SIZE=${REF%% *}
REF_NAME=${REF#* }
if awk -v n="$newest_size" -v p="$REF_SIZE" -v r="$PULL_MIN_RATIO" 'BEGIN { exit !(n < p * r) }'; then
  if [ "$PULL_ACCEPT_SHRINK" -eq 1 ]; then
    log "accepting $NEWEST ($newest_size bytes) below $PULL_MIN_RATIO x $REF_NAME ($REF_SIZE bytes)"
    printf '%s\n' "$NEWEST" >"$BASELINE_FILE"
  else
    die "$NEWEST is $newest_size bytes, below $PULL_MIN_RATIO x the largest held dump ($REF_NAME, $REF_SIZE bytes); not pruning. Check the VPS database, then run once with PULL_ACCEPT_SHRINK=1 if expected"
  fi
fi

stamp=${NEWEST#novel_hub-}
stamp=${stamp%.dump}
cutoff=$(utc_stamp $(($(date -u +%s) - MAX_AGE_H * 3600)))
if awk -v a="$stamp" -v b="$cutoff" 'BEGIN { exit !(a < b) }'; then
  die "newest dump $NEWEST is older than $MAX_AGE_H hours; is the VPS backup running?"
fi

# --- 5. monthly copies ------------------------------------------------------
# Only reached when the checks above passed, so a suspicious dump is never
# promoted. Dumps are never rewritten in place, so a hard link is a safe copy.
if [ "$PULL_MONTHLY_KEEP" -gt 0 ]; then
  MONTHLY="$PULL_DEST/monthly"
  mkdir -p "$MONTHLY"
  for name in $NEW; do
    month=${name#novel_hub-}
    month=${month%"${month#??????}"}
    if ! ls "$MONTHLY"/novel_hub-"$month"*.dump >/dev/null 2>&1; then
      for file in "$name.sha256" "$name"; do
        ln "$PULL_DEST/$file" "$MONTHLY/$file" 2>/dev/null || cp -p "$PULL_DEST/$file" "$MONTHLY/$file"
      done
      log "kept $name as the monthly copy for $month"
    fi
  done
  find "$MONTHLY" -maxdepth 1 -name 'novel_hub-*.dump' -exec basename {} \; |
    grep -E "$NAME_RE" |
    sort -r |
    tail -n +"$((PULL_MONTHLY_KEEP + 1))" |
    while read -r old; do
      rm -f "$MONTHLY/$old" "$MONTHLY/$old.sha256"
      log "pruned monthly $old"
    done
fi

# --- 6. prune ---------------------------------------------------------------
list_dumps |
  sort -r |
  tail -n +"$((PULL_KEEP + 1))" |
  while read -r old; do
    rm -f "$PULL_DEST/$old" "$PULL_DEST/$old.sha256"
    log "pruned $old"
  done

log "pull done: newest $NEWEST"
ping_healthcheck ''
