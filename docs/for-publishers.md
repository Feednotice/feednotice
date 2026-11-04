# For publishers

How a website offers its readers email updates through a FeedNotice-based service. The
examples use `https://service.example`; replace it with the service's address.

## The link to add

Next to your feed link, add a plain link to the service with your feed's address:

```html
<a href="https://service.example/s?feed=https%3A%2F%2Fexample.org%2Ffeed.xml">Get updates by email</a>
```

- No script, no form, no data passes through your site: it can stay static.
- Encode the feed address (`encodeURIComponent` in JavaScript, `urlencode` in PHP).
- Add `&lang=fr` for a French page; otherwise the reader's browser decides.
- The link can also carry your website's address instead of the feed's: the service finds the
  feeds your page announces (`<link rel="alternate" type="application/atom+xml">`) and offers a
  choice when there are several.

Or let the service prepare it: `https://service.example/publishers?feed=<your feed>` gives the
link and a button in your colour and your readers' language, ready to paste. The button is a
plain link with an inline style and an inline icon: no script, nothing loaded from elsewhere.

In a template, for example with Astro:

```astro
---
const feed = new URL('/feed.xml', Astro.site).href;
const byEmail = `https://service.example/s?feed=${encodeURIComponent(feed)}`;
---
<a href="/feed.xml">RSS feed</a> · <a href={byEmail}>Get updates by email</a>
```

## A feed that works well by email

| Do | Why |
|---|---|
| Give every entry a **unique, stable identifier** (`<id>` in Atom, `<guid>` in RSS) | It is how new entries are told from old ones. Two entries sharing an identifier are taken for one, and the second is never sent |
| Give every entry its own **link** | The email's "Read" link goes there; without it, readers land on the feed's site |
| Put a **summary** in each entry | It is the body of the email (as plain text) |
| Answer `304 Not Modified` to conditional requests (`If-None-Match`, `If-Modified-Since`) | Your feed is then downloaded only when it changes |
| Keep dates honest (`published`, `updated`) | They are displayed; they are never used to decide what is new |

The service's `/robot` page says what it reads, how often and whom to contact.

## WebSub: updates within a minute

By default the service reads a feed every 15 to 60 minutes. If your feed announces a WebSub hub,
new entries go out within about a minute of publication, and the service reads your feed only
every 6 hours as a safety net:

```xml
<link rel="hub" href="https://pubsubhubbub.appspot.com/"/>
<link rel="self" href="https://example.org/feed.xml"/>
```

Then ping the hub after each publication (`hub.mode=publish`, `hub.url=<your feed>`). Any
WebSub hub works, including one you run yourself. Notifications are only a signal to read the
feed: the content always comes from your feed itself.

## The publisher space

At `/publishers`, a publisher signs in with an emailed link, adds their domain and proves they
control it, with either:

- a file `https://<domain>/.well-known/feednotice.txt` containing the line
  `feednotice-verification=<token>`;
- or a DNS record `TXT _feednotice.<domain>` with the same value.

Once verified (and checked again every 30 days):

- the publisher's name and welcome text appear on the subscribe page of every feed of that
  domain and its subdomains;
- the space shows confirmed subscriptions per feed and cadence, never an address and never a
  number below 5.

Opening a space means accepting the service's terms of use (`/terms`), which include a part for
publishers. The split per cadence is hidden when a column would hold a small number. Nothing in
the publisher space is needed for the link to work.
