# Translations

| Language | Catalog | State |
|---|---|---|
| English | [src/i18n/en.ts](../src/i18n/en.ts) | reference |
| French | [src/i18n/fr.ts](../src/i18n/fr.ts) | reviewed |
| German | [src/i18n/de.ts](../src/i18n/de.ts) | **draft: needs a native speaker's review** |
| Spanish | [src/i18n/es.ts](../src/i18n/es.ts) | **draft: needs a native speaker's review** |

A catalog holds every text of the pages and emails. TypeScript refuses a catalog that misses a
message of the English one, and `test/i18n.test.ts` checks that none is left in English and that
pages and emails render in every language.

To run a service in fewer languages before a review is done, remove the language from `LOCALES`
in [src/i18n/index.ts](../src/i18n/index.ts): its readers then get the service's default
language.

## Adding a language

1. Copy `fr.ts` to `<code>.ts` and translate every message from `en.ts`. Functions build
   sentences from numbers, names and dates: keep their parameters and handle plurals.
2. Add the language to `LOCALES`, `CATALOGS` and `INTL_TAGS` (date and number formats) in
   `src/i18n/index.ts`.
3. `npm run typecheck && npm test`.
4. Ask a native speaker to read the pages (`/?lang=<code>`, `/privacy`, `/terms`, `/legal`,
   `/publishers`) and the emails (`npm start`, subscribe, read `data/outbox/*.eml`).

Plain, calm, short sentences; the formal register; no marketing words. The privacy page, the
terms and the legal notice are legal texts: translate them faithfully, adding or removing nothing.

## What the German and Spanish reviews should look at first

Both drafts use the formal register (Sie, usted) and local date formats.

**German**

- Legal notice: "vereinfachte Aktiengesellschaft (SAS)" and "Grundkapital" (some keep the French
  form untranslated, or say "Stammkapital"); "Verantwortlich für die Veröffentlichung" for the
  French *directeur de la publication*; "Registereintrag", "USt-IdNr."; the page is called
  "Impressum", so the applicable-law sentence reads "Dieses Impressum unterliegt französischem
  Recht".
- Terms: "so bereitgestellt, wie er ist" for "as is" (avoiding "ohne Gewähr" on purpose); the
  sentence on domain proofs ("whoever proves a domain last holds it").
- Privacy: consent withdrawn by unsubscribing; "Auftragsverarbeiter"; "verschlüsselter
  Fingerabdruck" (a keyed hash).
- Words: "Herausgeber" for publisher (or "Website-Betreiber"); "Der Roboter" (or "Crawler");
  "Beitrag" for an item; "Button" vs "Schaltfläche"; the DNS proof sentence, split around a code
  element.

**Spanish**

- "fuente" for feed everywhere, next to "Código fuente" (source code); "feed" is the other choice.
- "Editores" and "espacio de editor" for publishers.
- Legal notice: "sociedad por acciones simplificada (SAS)", "capital social", "domicilio social",
  "Director de la publicación"; "los tribunales franceses serán los únicos competentes".
- Privacy: "base jurídica" (GDPR wording) vs "base legal"; "encargados del tratamiento";
  "huella cifrada".
- Terms: "se ofrece tal cual"; a sentence turned into the future ("se avisará"): check it promises
  no more than the English.
- Emails open with "Hola:"; "Cancelar el resumen" vs "Darse de baja"; "los lunes", "7:00" in the
  schedule menus.
