#!/bin/sh
# Nightly (crond): starts a new mail log, then deletes rotated logs older than $1 days. A quiet
# day may leave nothing to rotate: old logs are deleted all the same.
set -u
DAYS="${1:-14}"
[ -s /var/log/postfix/mail.log ] && postfix logrotate
find /var/log/postfix -name 'mail.log.*' -type f -mtime +"$((DAYS - 1))" -delete
