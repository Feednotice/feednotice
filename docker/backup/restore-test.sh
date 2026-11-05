#!/bin/sh
# Proves the backups can be restored: restores the latest snapshot into a temporary folder,
# checks the database's integrity and that it holds the expected tables, and verifies a sample
# of the repository's data. The outcome goes to status/restore.json.
set -u
# shellcheck source=lib.sh
. /usr/local/lib/backup-lib.sh

dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT
fail() { echo "restore test: $1"; status restore false "$1"; exit 1; }

restic restore latest --host "$HOST_TAG" --target "$dir" >/dev/null 2>&1 || fail "restore failed"
db=$(find "$dir" -name 'feednotice-*.sqlite' -type f | head -n 1)
[ -n "$db" ] || fail "no database in the latest snapshot"
[ "$(sqlite3 "$db" 'PRAGMA integrity_check;')" = ok ] || fail "integrity check failed"
tables=$(sqlite3 "$db" "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('feeds', 'subscribers', 'subscriptions');")
[ "$tables" = 3 ] || fail "tables missing"
subscribers=$(sqlite3 "$db" 'SELECT COUNT(*) FROM subscribers;')
restic check --read-data-subset=5% >/dev/null 2>&1 || fail "repository check failed"
echo "restore test: ok ($(basename "$db"), $subscribers subscribers)"
status restore true "$(basename "$db"), $subscribers subscribers"
