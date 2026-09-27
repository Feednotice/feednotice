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
git clone https://github.com/Feednotice/feednotice.git /opt/feednotice
cd /opt/feednotice
cp .env.example .env && chmod 600 .env
openssl rand -base64 32 | tr '+/' '-_' | tr -d '='    # run twice: SECRET, WEBHOOK_SECRET
nano .env                                              # name, secrets, domains, legal notice
docker compose build
docker compose run --rm app node src/cli.ts dkim-keygen
```

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
   docker compose logs mta | grep bounce-to-app
   ```
5. **Language**: `https://example.org/?lang=fr` shows French; a French browser gets it by
   default.

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
  - hard bounces under 2% (`docker compose logs mta | grep -c status=bounced`);
  - no deferral wave from one provider (`grep deferred`);
  - Google Postmaster Tools reputation, once volume allows.
- To register:
  - [Google Postmaster Tools](https://postmaster.google.com/) for the sending domain;
  - [Microsoft SNDS](https://sendersupport.olc.protection.outlook.com/snds/) and JMRP for the IP.

## Backups

```sh
docker compose exec app node src/cli.ts backup 14     # keeps the 14 latest copies
```

- **Host cron**, daily:
  ```
  15 3 * * * cd /opt/feednotice && docker compose exec -T app node src/cli.ts backup 14 >/dev/null
  ```
- **Off-site copy**: a second cron job takes the latest copy off the server:
  ```sh
  docker compose cp app:/app/data/backups ./backups-latest && rsync -a ./backups-latest/ backup@<other server>:feednotice/
  ```
- **Keep `.env`** safe: without `SECRET`, restored subscribers' unsubscribe links stop working.
- **The DKIM key** lives in the same volume, so the backups carry it.
- Snapshots of the whole server, if your provider offers them, are a further layer.

## Updating

```sh
cd /opt/feednotice && git pull && docker compose build && docker compose up -d
```

- The database schema is migrated at start-up; a database newer than the code is refused.
- Postfix's queue lives in the `mta-spool` volume. Mail waiting to go out survives restarts and
  updates.

## Useful commands

| Command | Effect |
|---|---|
| `docker compose logs -f app` | feed reads, sends, errors (no email or IP address in the logs) |
| `docker compose logs -f mta` | Postfix: every delivery, bounce and deferral |
| `docker compose exec mta postqueue -p` | mail waiting to go out |
| `docker compose exec app node src/cli.ts poll` | one round now (the built-in scheduler already runs every minute) |
| `docker compose exec app node src/cli.ts purge` | GDPR erasure now (runs hourly anyway) |
