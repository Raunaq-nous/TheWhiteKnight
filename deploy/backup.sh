#!/usr/bin/env bash
# deploy/backup.sh — nightly SQLite backup with retention.
#
# Uses sqlite3's own `.backup` command (an online, consistent snapshot —
# safe to run while the app has the database open, including in WAL mode),
# not a raw `cp`, which could copy a torn/inconsistent file mid-write.
#
# Installed as a cron job by deploy/setup.sh (see "Automated nightly
# backups" step); safe to run manually too — that's how you verify it
# works, and how you'd force an out-of-band backup before a risky change.
#
# Env vars (all optional, sensible defaults for the setup.sh-provisioned
# layout):
#   CAREEROS_DB_PATH      path to the live database (default: matches
#                         setup.sh's REPO_DIR/private/careeros.db)
#   BACKUP_DIR            where dated backups are written (default: /root/backups)
#   BACKUP_RETENTION_DAYS how many days of backups to keep (default: 7)
set -euo pipefail

DB_PATH="${CAREEROS_DB_PATH:-/home/careeros/app/private/careeros.db}"
BACKUP_DIR="${BACKUP_DIR:-/root/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"

mkdir -p "$BACKUP_DIR"

if [[ ! -f "$DB_PATH" ]]; then
  echo "[backup] No database found at $DB_PATH — nothing to back up." >&2
  exit 0
fi

STAMP="$(date -u +%Y%m%d-%H%M%S)"
DEST="$BACKUP_DIR/careeros-$STAMP.db"

sqlite3 "$DB_PATH" ".backup '$DEST'"
echo "[backup] Wrote $DEST ($(du -h "$DEST" | cut -f1))"

# Retention: delete backups older than RETENTION_DAYS, keep the rest.
# -maxdepth 1 so this never touches anything outside BACKUP_DIR itself.
find "$BACKUP_DIR" -maxdepth 1 -name 'careeros-*.db' -mtime "+$RETENTION_DAYS" -print -delete
