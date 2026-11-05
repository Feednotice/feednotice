#!/bin/sh
# Creates the restic repository on first start, then runs the schedule (or the given command).
set -eu
# shellcheck source=lib.sh
. /usr/local/lib/backup-lib.sh

if ! restic cat config >/dev/null 2>&1; then
  echo "backup: creating the restic repository $RESTIC_REPOSITORY"
  restic init
fi

# Every night after the app's local copy (BACKUP_HOUR, default 3:00), and a restore test every
# Sunday. Times are the container's (TZ).
MINUTE="${BACKUP_MINUTE:-30}"
HOUR="${BACKUP_HOUR:-3}"
{
  printf '%s %s * * * /usr/local/bin/backup-now\n' "$MINUTE" "$HOUR"
  printf '%s %s * * 0 /usr/local/bin/restore-test\n' "$MINUTE" "$(( (HOUR + 1) % 24 ))"
} > /etc/crontabs/root

exec "$@"
