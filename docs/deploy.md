# Deploying

One server runs three containers: `app`, `mta` (send-only Postfix) and `caddy`. See
[design.md §3](design.md#3-architecture) for why.

The examples use these names; replace them with yours:

| Name | Example |
|---|---|
| website | `example.org` |
| sending domain | `mail.example.org` (`updates@` sends, `feedback@` gets bounces) |
| this server | `s1.example.org` |
| human mailbox | `contact@example.org` (your usual mail server, not this one) |

## 1. Server

A small VPS is enough: the containers need about 300 MB of memory. 1 vCPU, 1 GB of RAM and
20 GB of disk will do; more gives room for growth and snapshots.

1. **Location**: if you serve people in the EU, pick a data centre in the EU (see
   [privacy.md](privacy.md)). Debian or Ubuntu LTS.
2. **Port 25 outbound**. Many providers block it by default; some open it on request, from the
   control panel, or after some time as a customer. Check your provider's documentation, then:
   `nc -vz gmail-smtp-in.l.google.com 25` must connect.
3. **Reverse DNS (PTR)**. In your provider's control panel, set the reverse DNS of the server's
   IPv4 to `s1.example.org`. Do the same for IPv6 only if you enable IPv6 in Postfix
   (`MTA_INET_PROTOCOLS`, IPv4 only by default).
4. **Blocklists**. Check the IP on the Spamhaus lookup and on a multi-list checker (for example
   MXToolbox's). If it is listed, ask for another IP before going further.
5. **System**:
   ```sh
   apt update && apt upgrade -y
   apt install -y docker.io docker-compose-v2 git   # or Docker's own packages
   ```
   Open only ports 22, 25, 80 and 443 (443/udp too for HTTP/3).
6. **Terms**: read your provider's terms on sending email. Opted-in, low-volume sending is
   usually fine, but check.

## 2. DNS

In the `example.org` zone:

```
; website
example.org.                     A      <server IPv4>
; sending server
s1.example.org.                  A      <server IPv4>
s1.example.org.                  TXT    "v=spf1 a -all"
; sending domain
mail.example.org.                MX 10  s1.example.org.
mail.example.org.                TXT    "v=spf1 a:s1.example.org -all"
_dmarc.mail.example.org.         TXT    "v=DMARC1; p=none; rua=mailto:contact@example.org"
fn1._domainkey.mail.example.org. TXT    "v=DKIM1; k=rsa; p=…"   ; printed by dkim-keygen, step 3
```

- The PTR of the IP is `s1.example.org` (step 1.3). A, PTR and HELO then match.
- The MX of `mail.example.org` points to this server: bounces come back here.
- The mail of `example.org` itself (`contact@`) stays on your usual mail server.
- **Why a sending subdomain**: reputation builds on it, separately from your main domain, so a
  bad week for the service cannot hurt your own mail.
- A second sending server later means `s2.example.org` (A, PTR, SPF), `a:s2.example.org`
  added to the SPF of `mail.example.org`, and a second MX.
- DMARC starts at `p=none`. Once the reports show only passes for a few weeks, move to
  `p=quarantine`.

## 3. Install

```sh
git clone --branch v0.2.0 https://github.com/Feednotice/feednotice.git /opt/feednotice
cd /opt/feednotice
cp .env.example .env && chmod 600 .env
openssl rand -base64 32 | tr '+/' '-_' | tr -d '='    # run twice: SECRET, WEBHOOK_SECRET
nano .env                                              # name, secrets, domains, legal notice
echo FEEDNOTICE_VERSION=0.2.0 >> .env                  # the images of this release
docker compose pull
docker compose run --rm app node src/cli.ts dkim-keygen
```

Each release publishes ready-built images (`ghcr.io/feednotice/feednotice`, `-mta`,
`-backup`) for amd64 and arm64; `docker compose pull` fetches those of `FEEDNOTICE_VERSION`.
To run code that is not released, or changed, use `docker compose build` instead.

`dkim-keygen` writes the private key to the data volume and prints the `fn1._domainkey` record
to publish (step 2). Then:

```sh
docker compose up -d
docker compose ps                  # app should become "healthy"
curl -s https://example.org/health
```

Your logo and colours: [branding.md](branding.md).

### Keeping your files outside the checkout

To keep your settings and brand files in a repository of your own, with this one included as a
Git submodule (say `app/`), write a `compose.yaml` next to it:

```yaml
name: feednotice
include:
  - path: app/compose.yaml
    env_file: .env
```

and, in your `.env` (paths relative to `app/`):

```sh
ENV_FILE=../.env
BRAND_PATH=../brand
```

`docker compose` then runs from your folder. Volume names come from `name:`, so keep it the
same across moves to keep your data.

## 4. Check before sending to real people

0. **The setup checker** goes through the settings, DNS (A, PTR, MX, SPF, DKIM, DMARC),
   outbound port 25, HTTPS and the Spamhaus blocklist, and says what to fix:
   ```sh
   docker compose exec app node src/cli.ts doctor
   ```
   Run it again after every DNS change; everything should read `OK` before going further.
1. **Relay test from outside**: an open-relay checker (MXToolbox "SMTP test") on
   `s1.example.org` must report no open relay. Only `feedback@`, `postmaster@` and `abuse@` of
   `mail.example.org` are accepted.
2. **Full journey**: subscribe to a feed you know with a Gmail address and an address at another
   provider. In Gmail, "Show original" must show `SPF: PASS`, `DKIM: PASS` and `DMARC: PASS`.
3. **Score**: send one confirmation to the address given by mail-tester.com and aim for 10/10.
4. **Bounces**: subscribe an address at a domain that does not exist. Within a minute the `mta`
   log shows `status=bounced`, then `relay=bounce-to-app ... status=sent`, and the address is
   suspended:
   ```sh
   docker compose exec mta maillog | grep bounce-to-app
   ```
5. **Language**: `https://example.org/?lang=fr` shows French; a French browser gets it by
   default.

## Keeping an eye on it

Set `OPS_EMAIL` in `.env` to receive, every day at `OPS_REPORT_HOUR` (8:00 by default), a
report with yesterday's and the week's numbers (emails sent, bounces, complaints, subscriptions,
dead feeds) and what needs attention. Alerts come as soon as the day's hard bounces pass 5%,
complaints 0.3%, or submissions start failing (the mail container may be down). The same
numbers, any time:

```sh
docker compose exec app node src/cli.ts stats 30
```

An external uptime check on `https://example.org/health` covers the case where the whole server
is down, which no email from it can report.

## Warm-up

A new IP has no reputation. Large mailbox providers slow down or junk a sender whose volume
jumps. Their exact thresholds are not published; common practice:

| Period | `MAIL_MAX_PER_DAY` |
|---|---|
| days 1–3 | 200 |
| days 4–7 | 500 |
| week 2 | 1,000 |
| week 3 | 2,500 |
| week 4 | 5,000 |
| then | double every few days while indicators stay clean; 0 removes the cap |

- Change the value in `.env`, then run `docker compose up -d app`. Mail over the cap is not
  lost: it waits for the next hour or day, with 10% of the cap kept for confirmation emails.
- Subscribers arrive gradually, so the warm-up mostly happens by itself. The cap is the safety
  net for a sudden big publisher.
- Indicators to watch:
  - hard bounces under 2% (`docker compose exec mta maillog | grep -c status=bounced`);
  - no deferral wave from one provider (`grep deferred`);
  - Google Postmaster Tools reputation, once volume allows.
- To register:
  - [Google Postmaster Tools](https://postmaster.google.com/) for the sending domain;
  - [Microsoft SNDS](https://sendersupport.olc.protection.outlook.com/snds/) and JMRP for the IP.

## Backups

**On the server**, every night at `BACKUP_HOUR` (3:00), the app writes a consistent copy of the
database to `data/backups/` and keeps the last `BACKUP_KEEP` (14). Nothing to set up. A copy
now: `docker compose exec app node src/cli.ts backup`.

**Off the server**, the optional `backup` container sends the latest copy and the DKIM key to a
[restic](https://restic.net) repository, encrypted on the server before it leaves: any
S3-compatible storage, an SFTP server, or a restic REST server. Pick storage at another provider,
or at least in another data centre. In `.env`:

```sh
COMPOSE_PROFILES=backup
RESTIC_REPOSITORY=s3:https://s3.example-provider.eu/my-bucket/feednotice
RESTIC_PASSWORD=…                 # openssl rand -base64 32; store it OUTSIDE this server
AWS_ACCESS_KEY_ID=…               # the storage's access key (S3 only)
AWS_SECRET_ACCESS_KEY=…
```

then `docker compose up -d`. The repository is created on first start. Every night, half an hour
after the local copy, the latest copy goes out; snapshots are kept 14 days, then one a week for
4 weeks, so an erased address leaves the backups within about five weeks. Every Sunday a restore
test restores the latest snapshot, checks the database's integrity, and verifies 5% of the
repository's data.

Both report to the app: the daily report shows the last backup and restore test, and an alert
goes out if no backup succeeded for 36 hours or a restore test fails. By hand:

```sh
docker compose run --rm backup backup-now      # send the latest copy now
docker compose run --rm backup restore-test    # prove a restore works
docker compose run --rm backup restic snapshots
```

**Restoring** onto a new server: install as above with the same `.env`, then

```sh
docker compose run --rm -v "$PWD/restore:/restore" backup restic restore latest --target /restore
docker compose stop app
docker compose cp restore/data/backups/<latest>.sqlite app:/app/data/feednotice.sqlite
docker compose cp restore/data/dkim app:/app/data/
docker compose start app
```

- **Keep `.env` safe, outside the server too** (a password manager): without `SECRET`, restored
  subscribers' unsubscribe links stop working, and without `RESTIC_PASSWORD` the backups cannot
  be read at all.
- Snapshots of the whole server, if your provider offers them, are a further layer.

## Updating

Read the release's notes ([CHANGELOG.md](../CHANGELOG.md)) for anything marked **Upgrading**, then:

```sh
cd /opt/feednotice
git fetch --tags && git checkout v0.3.0                 # the new version
sed -i 's/^FEEDNOTICE_VERSION=.*/FEEDNOTICE_VERSION=0.3.0/' .env
docker compose pull && docker compose up -d
```

- The database schema is migrated at start-up; a database newer than the code is refused, so
  going back to an older version means restoring a backup.
- Postfix's queue lives in the `mta-spool` volume. Mail waiting to go out survives restarts and
  updates.

## Useful commands

| Command | Effect |
|---|---|
| `docker compose logs -f app` | feed reads, sends, errors (no email or IP address in the logs) |
| `docker compose exec mta tail -f /var/log/postfix/mail.log` | Postfix: every delivery, bounce and deferral, live |
| `docker compose exec mta maillog` | the whole mail log kept (14 days, `MTA_LOG_DAYS`) |
| `docker compose exec mta postqueue -p` | mail waiting to go out |
| `docker compose exec app node src/cli.ts poll` | one round now (the built-in scheduler already runs every minute) |
| `docker compose exec app node src/cli.ts purge` | GDPR erasure now (runs hourly anyway) |
| `docker compose exec app node src/cli.ts doctor` | checks DNS, mail and HTTPS against the settings |
| `docker compose exec app node src/cli.ts stats [days]` | counters per day (default 14), and the current state |
