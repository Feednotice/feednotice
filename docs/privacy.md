# Privacy — what is stored, for how long

What the software collects, why and for how long, written as entries for the register of
processing activities (GDPR article 30). If you run the service, you are the controller: adapt
these entries to your deployment and complete the bracketed items. This is technical
documentation, not legal advice.

## 1. Register entries (article 30)

### Processing 1 — Emailing feed updates to subscribers

| Item | Content |
|---|---|
| Controller | [you: name, address, registration, contact address] |
| Data protection officer | [if any] |
| Purpose | Emailing, at their request, the new entries of the Atom/RSS feeds people chose; service emails (confirmation, access link to their subscriptions) |
| Legal basis | Consent (article 6(1)(a)), collected by double opt-in; withdrawn at any time by unsubscribing |
| Data subjects | People who ask to receive a feed's updates |
| Data | Email address. Attached to it: feeds followed, cadence, digest time and day, language, dates of request, confirmation and last digest, status (active / suspended) |
| Not collected | Name, password, cleartext IP address, cookies, opens, clicks, device, location |
| Recipients | The operator; its processor [hosting provider], which hosts the server that runs the service and sends the emails. Mailbox providers receive the emails addressed to their users. Feed publishers only receive subscriber counts |
| Transfers outside the EU | None by the operator, provided the server is in the EU. Delivering an email to an address hosted outside the EU (e.g. Gmail) is done at the recipient's request |
| Retention | See section 3 |
| Security | See section 4 |

### Processing 2 — Abuse prevention

| Item | Content |
|---|---|
| Purpose | Preventing the service from being used to flood an address with confirmations, or to fetch feeds en masse |
| Legal basis | Legitimate interest (article 6(1)(f)) |
| Data | HMAC fingerprints (irreversible without the service's key) of the IP address and email address, with a counter per one-hour or one-day window |
| Retention | 2 days |

### Processing 3 — Suppression list

| Item | Content |
|---|---|
| Purpose | Never writing again to an address that reported an email as spam |
| Legal basis | Respecting the objection; legitimate interest |
| Data | HMAC fingerprint of the address, reason, date |
| Retention | As long as the service exists. Erased on request, in which case the address can be reached again if it resubscribes |

### Processing 4 — Publisher space

| Item | Content |
|---|---|
| Purpose | Letting a publisher prove they control a domain, customize the subscribe page of its feeds, and see subscriber numbers |
| Legal basis | Performance of a contract: the terms of use, served at `/terms`, accepted on the sign-in form [review them for your deployment] |
| Data subjects | People who open a publisher space |
| Data | Contact email address; the name and welcome text they write; their domains, verification tokens and dates; language; plan; the version of the terms accepted, and when |
| Not shown to them | Any subscriber address; any count below 5, nor a split per cadence that would reveal one |
| Recipients | The operator and its processor [hosting provider] |
| Retention | Until the publisher deletes the space (button in the space); accounts that never verify a domain are erased 30 days after creation (`src/publishers.ts`). The sign-in link request stores nothing: the account is created only when the link is opened |

### Technical logs

| Log | Content | Retention |
|---|---|---|
| `app` container | feed reads, counts of sent emails, errors: **no email or IP address** | rotated by size (3 × 10 MB) |
| `backup` container | snapshot ids and file names, no address | rotated by size |
| `mta` container (Postfix) | every delivery, bounce and deferral: **recipient addresses** and remote server names | a file in the `mta-logs` volume, started anew every night; days older than `MTA_LOG_DAYS` (14) are deleted |
| `caddy` container | errors only; access logging is off | rotated by size |

Legal basis: legitimate interest (security, delivery troubleshooting).

## 2. Information notice (article 13)

The text shown to subscribers is in the message catalogs (`privacySections` in
`src/i18n/en.ts` and `src/i18n/fr.ts`), served at `/privacy`. It covers:

- the controller and how to reach them;
- the data, purposes and legal basis;
- recipients and processors;
- the absence of transfers and tracking;
- retention;
- rights: access, rectification, erasure, objection, withdrawal of consent, and a complaint to
  the supervisory authority.

The confirmation email reminds, in one sentence, that nothing else will be sent without a click
and that the address will be erased without confirmation.

To set at deployment in `.env`:

- `OPERATOR_NAME`: the controller;
- `CONTACT_EMAIL`: the contact address;
- `PROCESSORS`: the named processors, e.g. "Example Hosting GmbH (server hosting and email
  sending, Germany)".

## 3. Retention

| Data | Retention | Where |
|---|---|---|
| Address never confirmed | 7 days after the request (`PENDING_TTL_DAYS`) | `src/purge.ts`, hourly |
| Subscribed address | While at least one subscription is active | — |
| Address unsubscribed from its last feed | Erased immediately | `unsubscribe()` |
| Address suspended after a hard bounce | 90 days (`SUSPENDED_TTL_DAYS`) | `src/purge.ts` |
| Address that complained | Erased immediately; fingerprint kept | `handleMailEvent()` |
| Delivery records (which subscription got which entry) | 30 days | `src/purge.ts` |
| Rate-limit and sending-cap counters | 2 days | `src/purge.ts` |
| Operator counters (`stats_daily`: numbers per day, no address, not personal data) | 400 days | `src/purge.ts` |
| Subscriptions to a dead feed | Ended 30 days after the feed is declared dead (subscribers are told); a lone address is then erased | `src/purge.ts` |
| Feeds and entries (public data, not personal) | While a subscription exists | `src/purge.ts` |
| Mail queue (messages waiting to be delivered) | At most 2 days (`maximal_queue_lifetime`) | `docker/mta/entrypoint.sh` |
| Backups | On the server: 14 nightly copies (`BACKUP_KEEP`). Off the server (optional `backup` container): encrypted, 14 daily then 4 weekly snapshots. An erased address leaves the backups within about five weeks | `src/backup.ts`, `docker/backup/` |

## 4. Security (article 32)

- **Links**, all signed with HMAC-SHA256:
  - confirmation: valid 7 days;
  - account: valid 24 hours;
  - unsubscribe, for one feed or a whole digest: no expiry, so it always works.
  - Identifiers are never reused, so an old link cannot touch someone else's subscription.
- **Pages**: no script, no cookie, strict content security policy, `Referrer-Policy: no-referrer`
  so tokens do not leak to linked sites.
- **Answers**: the same whether or not an address is subscribed, in content and in time (emails
  are sent in the background).
- **Operator's report and alerts** (`OPS_EMAIL`): counts only, never an address.
- **Containers**: the app runs as an unprivileged user; the SQLite database lives in a Docker
  volume; `.env` (secrets) is readable by root only.
- **Mail server**: not an open relay; the submission port is reachable only on the internal
  Docker network; outgoing TLS whenever the recipient offers it.
- **Feed fetching**: protected against requests to the internal network (SSRF).

## 5. Impact assessment

A priori **not required**: one low-sensitivity data item, no profiling, no matching, no
monitoring, and no large-scale processing of sensitive data. The controller should confirm this
against their supervisory authority's list of processing operations that require a DPIA.

## 6. Processors: what to obtain

- **Hosting provider**: the data processing agreement (article 28), and the server's location
  in the EU, in writing.
- **If an email provider is added later**: the same agreement, open and click tracking
  **turned off** for the account, and their log retention (their logs contain addresses).
