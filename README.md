# FeedNotice

Email updates for any Atom or RSS feed. A reader follows a plain link next to the feed, sees
what they are about to follow, enters an address and confirms. From then on they get each new
entry, or a daily or weekly digest. No account, no password, no JavaScript, no tracking.
English and French.

FeedNotice is self-hosted: one small server runs the web app, a send-only mail server and an
HTTPS proxy, all in Docker.

- **[Deploy](docs/deploy.md)**: server, DNS, install, checks, warm-up, backups
- [Design](docs/design.md): journey, architecture, data model, deduplication, deliverability
- [Branding](docs/branding.md): your service's name, logo, favicons and colours
- [Privacy](docs/privacy.md): what is stored, for how long; a starting point for your GDPR register
- [For publishers](docs/for-publishers.md): the link to add next to a feed, WebSub, the publisher space
- [Name and logo](TRADEMARKS.md): run the code under your own name

## What it does

- **Subscribe by link**: `https://your.site/s?feed=<feed URL>` shows the feed's title and three
  latest entries, then asks for an address and a cadence. A website's address works too: the
  feeds it announces are found.
- **Double opt-in** for everyone; a button (POST) behind every emailed link, so mail scanners
  cannot confirm or unsubscribe by following links.
- **Each entry, or a digest**: daily or weekly, at the hour and day each subscriber picks.
- **Never twice**: deduplication survives identifier changes, http/https moves and feeds that
  drop and re-add entries; sending is "at most once".
- **One-click unsubscribe** in every email (body link and RFC 8058 headers); the address is
  erased with its last subscription.
- **Polite reading**: one read per feed whatever the number of subscribers, conditional
  requests, backoff, WebSub when the feed has a hub, and a `/robot` page for publishers.
- **Deliverability**: DKIM signing, bounce handling through the bundled MTA, warm-up caps.
- **Publisher space**: a publisher proves a domain and gets their name and welcome text on
  their feeds' subscribe pages, and subscriber counts (never below 5).

## How it runs

```
             HTTPS                        SMTP :2525 (internal)            SMTP :25
Reader ─────────────▶ caddy ──▶ app ─────────────────────────▶ mta ─────────────────▶ mailboxes
                                 ▲  Node.js 24 + SQLite            send-only Postfix        │
                                 └──────── POST /hooks/bounce ◀──── bounce address ◀────────┘
```

- `app`: pages, feed reading, deduplication, sending, scheduler (every minute), DKIM signing.
- `mta`: queues, retries and delivers; accepts from the Internet only the bounce, postmaster and
  abuse addresses of the sending domain.
- `caddy`: HTTPS with automatic certificates.

```sh
cp .env.example .env    # then fill in the name, secrets and domains
docker compose build
docker compose run --rm app node src/cli.ts dkim-keygen    # prints the DKIM DNS record
docker compose up -d
```

## Develop

Node.js 22.18 or later: TypeScript runs directly (type stripping), with Node's built-in SQLite.

```sh
npm install
npm test              # feed parsing, deduplication, sending, i18n, bounces, full HTTP journey
npm run typecheck
npm start             # http://localhost:8080 — emails are written to data/outbox/*.eml
```

To subscribe locally, open `http://localhost:8080/s?feed=<feed address>`, then follow the link
in the email dropped into `data/outbox/`. Add `&lang=fr` for French.

## Commands

| Command | Effect |
|---|---|
| `node src/cli.ts serve` | web server + built-in scheduler (feeds, sending, hourly purge) |
| `node src/cli.ts poll` | one full round, then exit |
| `node src/cli.ts purge` | GDPR erasure only |
| `node src/cli.ts backup [keep]` | consistent copy of the database into `data/backups/`, keeping the last `keep` (14) |
| `node src/cli.ts dkim-keygen` | creates the DKIM key (unless it exists) and prints the DNS record |
| `node src/cli.ts bounce < message` | reads one bounce from standard input (manual use) |

In Docker: `docker compose exec app node src/cli.ts <command>`.

## Configuration

All settings are environment variables, read from `.env` by Docker Compose. `.env.example`
lists them with example values.

| Variable | Default | Role |
|---|---|---|
| `SITE_DOMAIN`, `BASE_URL` | —, `http://localhost:8080` | public address (Caddy certificate, links in emails) |
| `SERVICE_NAME` | `Example Feeds` | **required in production**: your service's name on pages and in emails ([TRADEMARKS.md](TRADEMARKS.md)) |
| `SECRET` | development key | **required in production** (32+ characters): signs links. Never change it afterwards |
| `WEBHOOK_SECRET` | — | shared by `mta` and `app` for `/hooks/bounce` (and `/hooks/mail-events`) |
| `DEFAULT_LOCALE` | `en` | language when neither `?lang=` nor the browser decides |
| `MAIL_FROM`, `BOUNCE_ADDRESS`, `REPLY_TO` | —, —, `CONTACT_EMAIL` | sender, envelope sender (bounces), human reply address |
| `MTA_HOSTNAME`, `POSTMASTER_FORWARD` | — | this sending server's name (PTR/HELO); where postmaster@/abuse@ go |
| `DKIM_SELECTOR`, `DKIM_KEY_FILE`, `DKIM_DOMAIN` | `fn1`, —, domain of `MAIL_FROM` | DKIM signing by the app |
| `MAIL_MAX_PER_DAY`, `MAIL_MAX_PER_HOUR` | `0` (no cap) | warm-up caps; 10% kept for confirmation emails |
| `OPERATOR_NAME`, `CONTACT_EMAIL`, `PROCESSORS` | — | shown on the privacy page and in emails |
| `LEGAL_*`, `HOST_*` | — | legal notice at `/legal`: publisher, registration, publication director, host |
| `SOURCE_URL` | this repository | "Source code" link in every page footer (AGPL): point it to your copy if you change the code |
| `BRAND_PATH` | none (neutral) | folder with your logo, favicons and colours ([docs/branding.md](docs/branding.md)) |
| `POLL_INTERVAL_MINUTES` | `30` | bounded to 15–60 |
| `PENDING_TTL_DAYS`, `SUSPENDED_TTL_DAYS` | `7`, `90` | erasure of unconfirmed requests and suspended addresses |
| `DIGEST_HOUR`, `DIGEST_WEEKDAY`, `TIME_ZONE` | `7`, `1` (Monday), `Europe/Paris` | default digest schedule; subscribers can choose their own |
| `BURST_LIMIT` | `5` | above this, new entries from one read go out as one email |
| `MAIL_TRANSPORT`, `SMTP_HOST`, `SMTP_PORT` | `outbox`, —, `25` | set by `compose.yaml` to the `mta` container |
| `TRUST_PROXY` | `0` | `1` behind Caddy (set by `compose.yaml`) |
| `RUN_SCHEDULER` | `1` | `0` to run rounds from outside (`poll`) |
| `ALLOW_PRIVATE_FEEDS` | `0` | `1` only for local tests |

## Code

```
src/
  feed/fetch.ts      polite and safe fetching (conditional requests, SSRF, size, timeout)
  feed/parse.ts      Atom, RSS 2.0, RSS 1.0 → plain-text entries
  feed/dates.ts      lenient dates (ISO 8601, RFC 822, variants)
  feed/text.ts       HTML → text
  feed/discover.ts   finds the feeds a web page announces
  ingest.ts          deduplication
  feeds.ts           preview, registration, periodic polling
  subscriptions.ts   request, confirmation, unsubscribe, account, bounces
  delivery.ts        immediate sends and digests, "at most once"
  cycle.ts           one round (read, then send), under a database lock
  purge.ts           GDPR erasure
  publishers.ts      publisher space: sign-in, domain proofs, counts
  websub.ts          WebSub: hub subscription, verification, signed notifications
  i18n/              en (reference) and fr message catalogs
  mail/              templates, SMTP sending with DKIM, sending caps, bounce parsing
  web/               HTTP server, pages without JavaScript, branding
  db.ts              SQLite schema and migrations
docker/mta/          send-only Postfix image
docker/caddy/        Caddyfile
test/                tests, including a real civic feed (anonymised) with its quirks as a reference case
```

## Licence

Code: [AGPL-3.0-or-later](LICENSE). If you run a modified copy as a service, offer its source to
your users (`SOURCE_URL`). The name and logo are not covered: see [TRADEMARKS.md](TRADEMARKS.md).
