#!/bin/sh
# Sends the latest local copy of the database, and the DKIM key, to the restic repository, then
# applies the retention policy. The outcome goes to status/backup.json.
set -u
# shellcheck source=lib.sh
. /usr/local/lib/backup-lib.sh

latest=$(find "$DATA/backups" -name 'feednotice-*.sqlite' -type f 2>/dev/null | sort | tail -n 1)
if [ -z "$latest" ]; then
  echo "backup: no local copy in $DATA/backups yet"
  status backup false "no local copy yet"
  exit 1
fi
set -- "$latest"
[ -d "$DATA/dkim" ] && set -- "$@" "$DATA/dkim"

if ! out=$(restic backup --host "$HOST_TAG" --tag feednotice "$@" 2>&1); then
  echo "$out"
  status backup false "restic backup failed: $(echo "$out" | tail -n 1)"
  exit 1
fi
echo "$out" | tail -n 2
restic forget --host "$HOST_TAG" --prune \
  --keep-daily "${BACKUP_KEEP_DAILY:-14}" --keep-weekly "${BACKUP_KEEP_WEEKLY:-4}" >/dev/null 2>&1 \
  || echo "backup: retention (forget --prune) failed; the snapshot itself is safe"
status backup true "$(basename "$latest")"
