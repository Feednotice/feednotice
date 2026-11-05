#!/bin/sh
# Prints the whole mail log kept (rotated days first, oldest first), e.g.:
#   docker compose exec mta maillog | grep bounce-to-app
set -eu
for f in $(find /var/log/postfix -name 'mail.log.*' -type f | sort); do
  case "$f" in
    *.gz) zcat "$f" ;;
    *) cat "$f" ;;
  esac
done
[ -f /var/log/postfix/mail.log ] && cat /var/log/postfix/mail.log
