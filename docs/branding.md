# Branding

Out of the box the service is neutral: its name (`SERVICE_NAME`) as text in the header, a
sober palette, no icon. The FeedNotice logo is not part of this repository
([TRADEMARKS.md](../TRADEMARKS.md)).

To give the service your own look, put your files in a folder and point `BRAND_PATH` to it.

## The brand folder

Every file is optional. The pages link only to the files present.

| File | Used for |
|---|---|
| `mark.svg` | your mark, before the name in the page header (shown at 1.75 rem, square) |
| `mark-dark.svg` | the same for dark mode; without it, `mark.svg` is used in both |
| `favicon.svg` | browser tab icon; it may switch colours itself with `@media (prefers-color-scheme: dark)` |
| `favicon.ico` | browser tab icon for older browsers and tools (16, 32 and 48 px inside) |
| `apple-touch-icon.png` | 180 × 180 px, home screen icon on phones; keep a margin, the corners are rounded |
| `brand.css` | added after the site's stylesheet: your colours |

The files are read once at start-up: restart the app after changing them
(`docker compose up -d --force-recreate app`).

## Colours

The stylesheet uses a handful of CSS variables. Override them in `brand.css`, for both light and
dark mode:

```css
:root { --accent: #1e5f74; }
@media (prefers-color-scheme: dark) { :root { --accent: #7fc3d8; } }
```

| Variable | Role | Default light / dark |
|---|---|---|
| `--accent` | links and buttons (button text uses `--bg`) | `#3d5570` / `#9db4cc` |
| `--bg` | page background | `#fdfcf8` / `#17191a` |
| `--text` | body text | `#1d1d1b` / `#ecebe6` |
| `--muted` | secondary text | `#5b5b57` / `#a9a8a2` |
| `--border` | lines and fields | `#d9d6cc` / `#3a3d3f` |

Keep text contrast at 4.5:1 or more against `--bg`. Pages have no scripts and load nothing from
other sites: use your own files, not web fonts or images hosted elsewhere (the content security
policy blocks them, and they would tell third parties who visits).

## With Docker

`compose.yaml` mounts `BRAND_PATH` (a path relative to `compose.yaml`) read-only into the app.
In `.env`:

```sh
BRAND_PATH=../brand          # a folder next to your checkout
```

Without `BRAND_PATH`, an empty folder (`docker/no-brand`) is mounted and the service stays
neutral. Outside Docker, set `BRAND_DIR` to the folder instead.

## Emails

Emails carry no image, logo included: a remote image works like a tracking pixel and is blocked
by default in many mail apps, and the emails must read the same without images. Your service's
name appears in the sender ("Feed title via Your Service") and in the text.
