# Your own pages

Besides the pages the software provides (home, subscribe, publishers, privacy, terms, legal
notice), a service usually needs its own: pricing, use cases, help, news. Put them in a folder
and point `PAGES_PATH` (Docker; relative to `compose.yaml`) or `PAGES_DIR` (outside Docker) to
it. The files are read at start-up: restart the app after changing them
(`docker compose up -d --force-recreate app`).

## One file per page and language

```
pages/
  pricing.en.html               → /pricing (English)
  pricing.fr.html               → /pricing (French)
  help/find-a-feed.en.html      → /help/find-a-feed
  news/2026-11-20-open.en.html  → /news/2026-11-20-open, listed at /news and in /news.xml
  assets/screenshot.png         → /assets/screenshot.png (png, jpg, webp, svg, pdf)
```

- Names: lower case letters, digits and hyphens; the language is one the service speaks.
- A visitor gets the page in their language, else in `DEFAULT_LOCALE`, else in English, else in
  whichever exists.
- A page cannot take a path the application uses (`/account`, `/terms`, `/s`, …): it is skipped
  with a warning in the log.

## Inside a file

A few comment lines, then the HTML of the page's body:

```html
<!-- title: Pricing -->
<!-- description: Free for readers. Publishers: from €0. -->
<!-- nav: footer -->
<h1>Pricing</h1>
<p>…</p>
```

| Line | Effect |
|---|---|
| `title` | the page's title (browser tab, search results, footer link) |
| `description` | the summary search engines and link previews show |
| `nav: footer` | a link to the page in the footer of every page |
| `date: 2026-11-20` | for news items: the publication date |

The HTML is yours and is inserted as it is. Pages run under the same content security policy as
the rest of the site: no script, no inline `style` attribute, nothing loaded from another site.
Use the stylesheet's classes (`muted`, `notice`, `cta`, and for pricing `plans`, `plan`, `price`,
`note`), or add your own to `brand.css` ([branding.md](branding.md)).

## News

Pages under `news/` with a `date` are news items. The service then offers:

- `/news`: the list, newest first, with links to follow it;
- `/news.xml`: an Atom feed of it (`?lang=` per language), announced in every page's head, so
  that pasting your site's address into the service finds it: readers can follow your news by
  email with your own service.

## For search engines

Every page carries a canonical link and its other languages (`hreflang`). `/sitemap.xml` lists
the public pages with their languages, and `/robots.txt` keeps crawlers away from the links that
carry tokens (`/c/`, `/u/`, `/m/`, `/p/`).
