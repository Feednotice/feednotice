# Changelog

Versions follow [semantic versioning](https://semver.org): a database schema change or a
setting that must be changed is called out under **Upgrading**. Images:
`ghcr.io/feednotice/feednotice`, `-mta`, `-backup`, tagged with the version.

## 0.2.0 (2026-11-05)

**Upgrading**: the database schema goes from 2 to 4 at start-up (indexes and three columns; a
few seconds on a large database). The `mta` container now keeps its mail log in a volume
(`mta-logs`) instead of the container log: read it with `docker compose exec mta maillog`. New
optional settings: `OPS_EMAIL`, `CONFIRM_MAX_PER_HOUR`, `BACKUP_*`, `RESTIC_*`, `MTA_LOG_DAYS`.

- **Security**: fixes from a review of the web layer, the handling of remote feeds, and the
  mail and Docker setup. Notably a crash on an invalid redirect, a regular expression with
  exponential time, fetches that could hang forever, and confirmation emails whose subject a
  feed's owner could choose.
- **Dead feeds**: subscribers are told when a feed stops answering; it is retried daily and
  resumes by itself; subscriptions end after 30 days. A feed answering "410 Gone" is dead at once.
- **Feeds that move**: after permanent redirects (301, 308) to a valid feed, the new address is
  kept; a feed already followed there absorbs the subscriptions.
- **One digest per reader**: digests due at the same time arrive as one email.
- **Operator**: `doctor` (setup checker), `stats`, a daily report and alerts by email.
- **Backups**: a nightly local copy, and an optional container for encrypted off-site backups
  (restic) with a weekly restore test. Mail log kept 14 days.
- **Pages**: a home page that explains the service, terms of use, a button generator for
  publishers.
- **Performance**: measured at 100,000 subscribers (`npm run bench`); purge, sending and the
  per-minute round made much faster (docs/design.md §13).
- **Releases**: images built for amd64 and arm64 on each version tag; Dependabot.

## 0.1.0 (2026-09-27)

First public version.
