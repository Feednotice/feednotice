# Off-site backups with restic: encrypted, deduplicated, sent to any restic repository (S3-
# compatible storage, SFTP, a REST server…). Reads the copies the app makes every night.
FROM alpine:3.24

RUN apk add --no-cache restic sqlite ca-certificates tzdata

COPY entrypoint.sh /usr/local/bin/entrypoint
COPY backup-now.sh /usr/local/bin/backup-now
COPY restore-test.sh /usr/local/bin/restore-test
COPY lib.sh /usr/local/lib/backup-lib.sh
RUN chmod 755 /usr/local/bin/entrypoint /usr/local/bin/backup-now /usr/local/bin/restore-test

ENTRYPOINT ["/usr/local/bin/entrypoint"]
CMD ["crond", "-f", "-l", "8"]
