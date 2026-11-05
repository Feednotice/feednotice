# Contributing

Thank you for helping. Bug reports, fixes, translations and documentation are all welcome.

## Before you start

- **A bug**: open an issue with what happened, what you expected, and the feed or steps to
  reproduce it. For a security problem, see [SECURITY.md](SECURITY.md) instead.
- **A feature**: open an issue first to discuss it. The service stays deliberately simple:
  no JavaScript in its pages, no tracking, no account for readers.

## Working on the code

Node.js 22.18 or later; no build step (TypeScript runs directly).

```sh
npm install
npm test            # must pass
npm run typecheck   # must pass
npm start           # http://localhost:8080; emails go to data/outbox/
```

- Code, comments and documentation in English; user-facing text lives in `src/i18n/`, in every
  language (TypeScript reports a missing message).
- Add or update tests with each change (`test/`). Feeds from the wild that break something make
  good fixtures (`test/fixtures/`).
- Keep the style of the surrounding code: small modules, plain functions, comments that say why.
- A change to the database schema is a new entry in `MIGRATIONS` (`src/db.ts`), never an edit of
  an existing one.
- Run `npm run bench` if your change touches sending, digests or the purge.

## Licence

FeedNotice is licensed under the AGPL-3.0-or-later. By contributing, you agree that your
contribution is licensed under the same terms. The FeedNotice name and logo are not part of the
licence: see [TRADEMARKS.md](TRADEMARKS.md).
