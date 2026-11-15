// Deutsche Texte.

import type { FeedErrorCode, Messages } from './en.ts';

const feedErrors: Record<FeedErrorCode, string> = {
  'invalid-url': 'Diese Adresse ist ungültig.',
  'bad-scheme': 'Nur http- und https-Adressen werden akzeptiert.',
  credentials: 'Adressen mit Benutzername oder Passwort werden nicht akzeptiert.',
  'private-address': 'Diese Adresse verweist auf ein privates Netzwerk.',
  'too-many-redirects': 'Der Server leitet zu oft weiter.',
  'no-location': 'Der Server hat eine unvollständige Weiterleitung gesendet.',
  'http-status': 'Der Server hat mit einem Fehler geantwortet.',
  'too-large': 'Der Feed ist zu groß (mehr als 5 MB).',
  interrupted: 'Die Übertragung wurde unterbrochen.',
  timeout: 'Der Server hat zu lange nicht geantwortet.',
  connect: 'Der Server ist nicht erreichbar.',
  entities: 'Das Dokument deklariert XML-Entitäten, die aus Sicherheitsgründen abgelehnt werden.',
  malformed: 'Das Dokument ist kein wohlgeformtes XML.',
  'not-a-feed': 'Dieses Dokument ist weder ein Atom- noch ein RSS-Feed.',
  unexpected: 'Der Server hat unerwartet geantwortet.',
  'no-feed-found': 'Diese Seite verweist auf keinen Atom- oder RSS-Feed.',
  'several-feeds': 'Diese Seite verweist auf mehrere Feeds.',
  blocked: 'Er ist auf diesem Dienst nicht verfügbar.',
};

const posts = (n: number) => (n === 1 ? '1 neuer Beitrag' : `${n} neue Beiträge`);
const feedCount = (n: number) => (n === 1 ? '1 Feed' : `${n} Feeds`);
const digestAdj = (kind: 'daily' | 'weekly') => (kind === 'daily' ? 'tägliche' : 'wöchentliche');

export const de: Messages = {
  langName: 'Deutsch',
  label: (label) => `${label}:`,

  nav: { privacy: 'Ihre Daten', account: 'Meine Abonnements', publishers: 'Herausgeber', robot: 'Der Roboter', legal: 'Impressum', terms: 'Nutzungsbedingungen', source: 'Quellcode' },
  languageSwitch: 'Sprache',

  cadence: {
    immediate: 'eine E-Mail pro neuem Beitrag',
    daily: 'eine tägliche Zusammenfassung',
    weekly: 'eine wöchentliche Zusammenfassung',
  },
  weekdays: ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'],
  onWeekday: (day) => `am ${day}`,
  atHour: (h) => `${h} Uhr`,

  homeTitle: 'Einen Feed per E-Mail erhalten',
  homeHeading: 'Neues von einer Website, in Ihrem Postfach',
  homeIntro: (service) =>
    `Viele Websites veröffentlichen einen Atom- oder RSS-Feed: die Liste ihrer neuesten Beiträge. ${service} schickt sie Ihnen per E-Mail, so oft Sie möchten. Kein Konto, kein Passwort, keine Werbung, kein Tracking.`,
  feedUrlLabel: 'Adresse des Feeds oder der Website',
  feedUrlButton: 'Feed anzeigen',
  home: {
    stepsHeading: 'So funktioniert es',
    steps: [
      'Fügen Sie die Adresse eines Feeds ein oder einfach die einer Website: Deren Feeds werden für Sie gefunden. Viele Websites bieten auch einen Link „Neue Beiträge per E-Mail erhalten“ an.',
      'Geben Sie Ihre E-Mail-Adresse ein und wählen Sie die Häufigkeit: eine E-Mail pro neuem Beitrag oder eine tägliche oder wöchentliche Zusammenfassung, zur Uhrzeit Ihrer Wahl.',
      'Bestätigen Sie über die E-Mail, die Sie erhalten. Danach enthält jede E-Mail einen Link zum Abbestellen mit einem Klick.',
    ],
    promisesHeading: 'Worauf Sie sich verlassen können',
    promises: [
      'Kostenlos für Leserinnen und Leser, ohne Werbung in den E-Mails.',
      'Kein Tracking: kein Zählpixel, keine umgeschriebenen Links, keine Cookies. Die E-Mails lesen sich ohne Bilder genauso.',
      'Ihre Adresse wird nur für diese E-Mails verwendet, nie weitergegeben und gelöscht, sobald Sie Ihr letztes Abonnement beenden.',
      'Mehrere Zusammenfassungen zur selben Uhrzeit kommen als eine E-Mail an, mit einem Abschnitt pro Website.',
      'Wenn eine Website ihren Feed einstellt, werden Sie benachrichtigt, statt vergeblich zu warten.',
    ],
    publishersHeading: 'Sie betreiben eine Website?',
    publishersText: (service) =>
      `Lassen Sie Ihre Leserinnen und Leser Ihnen per E-Mail folgen, mit einem Link neben Ihrem Feed: kein Skript, kein Konto, keine Liste zu verwalten. ${service} ruft Ihren Feed schonend ab: einmal, unabhängig von der Zahl der Abonnenten, und innerhalb einer Minute, wenn er einen WebSub-Hub angibt.`,
    publishersCta: 'Link oder Button holen',
    faqHeading: 'Fragen',
    faq: [
      { q: 'Was ist ein Feed?', a: 'Eine Liste der neuesten Beiträge einer Website, veröffentlicht unter einer Adresse, die Programme lesen können (Atom oder RSS). Die meisten Blogs und Nachrichtenseiten und viele öffentliche Stellen haben einen, oft mit einem orangefarbenen Symbol verlinkt.' },
      { q: 'Ich finde die Adresse des Feeds nicht.', a: 'Fügen Sie stattdessen die Adresse der Website ein: Wenn die Website einen Feed angibt, wird er für Sie gefunden.' },
      { q: 'Brauche ich ein Konto?', a: 'Nein. Ihre Abonnements erreichen Sie über einen Link, der an Ihre Adresse geschickt wird, 24 Stunden gültig ist und den Sie jederzeit anfordern können.' },
      { q: 'Wie beende ich ein Abonnement?', a: 'Mit einem Klick über den Link am Ende jeder E-Mail oder unter „Meine Abonnements“, wo Sie auch Ihre Adresse löschen können.' },
    ],
  },

  subscribeTitle: (feed) => `${feed} abonnieren`,
  feedLabel: 'Feed',
  siteLabel: 'Website',
  latestHeading: 'Neueste Beiträge',
  noEntries: 'Dieser Feed enthält noch keine Beiträge.',
  untitled: 'Ohne Titel',
  receiveHeading: 'Die nächsten Beiträge per E-Mail erhalten',
  emailLabel: 'Ihre E-Mail-Adresse',
  cadenceLegend: 'Häufigkeit',
  subscribeButton: 'Neue Beiträge erhalten',
  subscribeNotice: (days) =>
    `Wir senden Ihnen eine E-Mail mit einem Bestätigungslink. Bis Sie darauf klicken, erhalten Sie nichts weiter, und Ihre Adresse wird nach ${days === 1 ? '1 Tag' : `${days} Tagen`} gelöscht. Ihre Adresse wird nur für diese E-Mails verwendet:`,
  privacyLink: 'was wir damit tun',
  subscribeTerms: 'Mit dem Abonnieren akzeptieren Sie die',
  termsLink: 'Nutzungsbedingungen',

  feedErrorTitle: 'Feed nicht lesbar',
  feedErrorHeading: 'Dieser Feed kann nicht gelesen werden',
  feedError: (code) => `Dieser Feed kann nicht gelesen werden: ${feedErrors[code] ?? feedErrors.unexpected}`,
  chooseTitle: 'Feed auswählen',
  chooseHeading: 'Diese Seite bietet mehrere Feeds an',
  chooseText: 'Welchen möchten Sie per E-Mail erhalten?',
  chooseUntitled: 'Feed ohne Titel',
  feedErrorHelp: (service) =>
    `${service} akzeptiert Atom- und RSS-Feeds. Prüfen Sie die Adresse: Oft endet sie auf .xml, /feed, /rss oder /atom.`,
  invalidFeedUrl: 'Die Adresse des Feeds ist ungültig.',
  invalidEmail: 'Diese E-Mail-Adresse scheint ungültig zu sein.',
  chooseCadence: 'Wählen Sie die Häufigkeit.',
  tooManyTitle: 'Zu viele Anfragen',
  tooManyText: 'Bitte versuchen Sie es in einer Stunde erneut.',
  errorTitle: 'Fehler',
  errorText: 'Etwas ist schiefgelaufen. Bitte versuchen Sie es gleich noch einmal.',
  notFoundTitle: 'Seite nicht gefunden',
  notFoundText: 'Diese Seite existiert nicht.',
  expiredTitle: 'Link abgelaufen',
  confirmExpiredText: 'Dieser Link ist nicht mehr gültig. Starten Sie das Abonnement erneut von der Website, über die Sie hierhergekommen sind.',
  invalidUnsubscribeTitle: 'Ungültiger Link',
  invalidUnsubscribeText: 'Dieser Link zum Abbestellen ist ungültig.',
  manageExpiredText: 'Dieser Link ist nicht mehr gültig. Fordern Sie unter „Meine Abonnements“ einen neuen an.',

  checkMailboxTitle: 'Prüfen Sie Ihr Postfach',
  checkMailboxHeading: 'Prüfen Sie Ihr Postfach',
  checkMailboxText: 'Wenn die Adresse gültig ist, ist eine Bestätigungs-E-Mail unterwegs. Öffnen Sie den Link darin, um das Abonnement zu bestätigen. Sehen Sie auch im Spam-Ordner nach.',
  checkMailboxNote: 'Bis Sie bestätigen, erhalten Sie nichts.',

  confirmTitle: 'Bestätigen',
  confirmHeading: 'Bestätigen Sie Ihr Abonnement',
  confirmText: (feed, cadence) => `Sie erhalten die neuen Beiträge von „${feed}“: ${cadence}.`,
  confirmButton: 'Bestätigen',
  confirmNote: 'Diese Schaltfläche verhindert, dass Software, die die Links in Ihren E-Mails öffnet (zum Beispiel ein Virenscanner), an Ihrer Stelle bestätigt.',
  confirmedTitle: 'Abonnement bestätigt',
  confirmedHeading: 'Erledigt',
  confirmedText: (feed) => `Sie erhalten die nächsten neuen Beiträge von „${feed}“. Jede E-Mail enthält einen Link zum Abbestellen mit einem Klick.`,
  confirmedManage: 'Um die Häufigkeit zu ändern oder das Abonnement zu beenden:',
  confirmedUnsubscribe: 'abbestellen',

  unsubscribeTitle: 'Abbestellen',
  unsubscribeHeading: 'Abbestellen',
  unsubscribeText: (feed) => `Keine neuen Beiträge von „${feed}“ mehr erhalten?`,
  unsubscribeButton: 'Abbestellen',
  unsubscribedTitle: 'Abbestellt',
  unsubscribedHeading: 'Sie haben abbestellt',
  unsubscribedText: 'Sie erhalten für diesen Feed nichts mehr. Wenn es Ihr letztes Abonnement war, wurde Ihre Adresse gelöscht.',
  unsubscribedNote: 'Ein Versehen? Abonnieren Sie einfach erneut über die ursprüngliche Website.',

  stopDigestTitle: (kind) => (kind === 'daily' ? 'Tägliche Zusammenfassung abbestellen' : 'Wöchentliche Zusammenfassung abbestellen'),
  stopDigestText: (kind, n) =>
    `Die ${digestAdj(kind)} Zusammenfassung abbestellen? Sie umfasst ${feedCount(n)}:`,
  stopDigestButton: 'Diese Zusammenfassung abbestellen',
  stopDigestOther: 'Ihre anderen Abonnements bleiben unverändert. Um nur einen Feed abzubestellen, verwenden Sie den Link unter diesem Feed in der E-Mail oder:',
  stoppedDigestText: 'Sie erhalten diese Zusammenfassung nicht mehr. Wenn sie Ihre letzten Abonnements enthielt, wurde Ihre Adresse gelöscht.',

  accountTitle: 'Meine Abonnements',
  accountRequestText: 'Kein Passwort: Geben Sie Ihre Adresse ein, und Sie erhalten einen 24 Stunden gültigen Link, der Ihre Abonnements öffnet.',
  accountRequestButton: 'Link senden',
  accountSentTitle: 'Link gesendet',
  accountSentText: 'Wenn diese Adresse mindestens einen Feed abonniert hat, wurde soeben ein Link zu Ihren Abonnements an sie gesendet.',
  accountAddress: (email) => `Adresse: ${email}`,
  accountNone: 'Keine Abonnements.',
  accountColFeed: 'Feed',
  accountColCadence: 'Häufigkeit',
  accountColWhen: 'Wann',
  accountPending: 'Bestätigung ausstehend',
  accountAsPublished: 'sofort nach Erscheinen',
  accountChange: 'Ändern',
  accountStop: 'Beenden',
  accountCadenceAria: (feed) => `Häufigkeit für ${feed}`,
  accountHourAria: (feed) => `Uhrzeit der Zusammenfassung für ${feed}`,
  accountDayAria: (feed) => `Wochentag der Zusammenfassung für ${feed}`,
  watchPlanName: 'Watch',
  accountPlan: (plan) => `Tarif ${plan}`,
  accountWatchHeading: 'Filter und Pausen',
  accountWatchHint: (plan) => `Mit dem Tarif ${plan}: Stichwortfilter für jeden Feed und Pausen.`,
  accountWatchIntro: 'Erhalten Sie für jeden Feed nur die Beiträge, die eines der einzuschließenden Wörter und keines der auszuschließenden Wörter enthalten. Trennen Sie Wörter oder Wendungen mit Kommas; Groß- und Kleinschreibung sowie Akzente spielen keine Rolle.',
  accountIncludeLabel: 'Nur Beiträge mit einem dieser Wörter',
  accountExcludeLabel: 'Nie Beiträge mit diesen Wörtern',
  accountFiltersSave: 'Filter speichern',
  accountPauseLabel: 'Pause',
  accountPauseDays: (days) => `für ${days} Tage`,
  accountPauseOpen: 'bis ich fortsetze',
  accountPauseNone: 'keine Pause',
  accountPauseSave: 'Anwenden',
  accountPauseNote: 'Was während einer Pause erscheint, wird auch danach nicht gesendet.',
  accountPausedUntil: (date) => `pausiert bis ${date}`,
  accountPausedOpen: 'pausiert',
  accountFiltered: 'gefiltert',
  accountResult: {
    saved: 'Gespeichert.',
    limit: 'Filter sind für höchstens 50 Feeds möglich.',
  },
  accountDeleteHeading: 'Alles beenden',
  accountDeleteText: 'Löscht alle Ihre Abonnements und Ihre Adresse. Sofort und endgültig.',
  accountDeleteButton: 'Alles beenden und meine Adresse löschen',
  accountErasedTitle: 'Adresse gelöscht',
  accountErasedText: 'Alle Ihre Abonnements sind beendet und Ihre Adresse ist gelöscht.',

  publishersTitle: 'Herausgeber',
  publishersHeading: 'Bieten Sie Ihre neuen Beiträge per E-Mail an',
  publishersIntro: (service) =>
    `Nicht alle Ihre Leserinnen und Leser nutzen einen Feedreader, aber alle haben ein Postfach. Setzen Sie neben Ihren Feed einen Link zu ${service}: kein Skript, kein Konto, nichts zu installieren. Keine Adresse läuft über Ihre Website.`,
  publishersFeedLabel: 'Adresse Ihres Feeds',
  publishersButton: 'Link erstellen',
  publishersLinkHeading: 'Ein Link',
  publishersButtonHeading: 'Oder ein Button',
  publishersLinkText: 'Neue Beiträge per E-Mail erhalten',
  publishersTry: 'Ausprobieren:',
  publishersReadersLabel: 'Sprache Ihrer Leserinnen und Leser',
  publishersReadersAuto: 'nach Browsereinstellung',
  publishersColorLabel: 'Farbe des Buttons',
  publishersPreview: 'Vorschau:',
  publishersCopy: 'Kopieren Sie diesen Code in Ihre Seite. Er enthält kein Skript und lädt nichts nach: Ihre Leserinnen und Leser werden nicht verfolgt, weder von Ihnen noch von uns.',
  publishersButtonCode: 'Code des Buttons',
  publishersTipsHeading: 'Was Ihr Feed enthalten sollte',
  publishersTips: (service, minutes) => [
    'eine stabile Kennung pro Beitrag (<id> in Atom, <guid> in RSS): Das verhindert doppelte E-Mails;',
    'einen Link pro Beitrag, zur zugehörigen Seite;',
    'eine Zusammenfassung als reiner Text: Diese wird in der E-Mail gelesen;',
    `Unterstützung für ETag- oder Last-Modified-Header: ${service} ruft Ihren Feed etwa alle ${minutes} Minuten ab, einmal, unabhängig von der Zahl der Abonnenten.`,
  ],

  cadenceShort: { immediate: 'Pro Beitrag', daily: 'Täglich', weekly: 'Wöchentlich' },
  planNames: { free: 'Kostenlos', pro: 'Pro', business: 'Business' },
  publisherSignInHeading: 'Bereich für Herausgeber',
  publisherSignInText: 'Verifizieren Sie Ihre Domain, um Ihren Namen und einen Begrüßungstext auf der Abo-Seite Ihrer Feeds anzuzeigen und zu sehen, wie viele Personen ihnen folgen. Kein Passwort: Wir senden Ihnen einen Link per E-Mail.',
  publisherSignInButton: 'Anmeldelink per E-Mail senden',
  publisherTermsLabel: 'Ich habe die Nutzungsbedingungen, einschließlich des Teils für Herausgeber, gelesen und akzeptiere sie',
  publisherTermsRequired: 'Bitte akzeptieren Sie die Nutzungsbedingungen, um einen Bereich für Herausgeber zu eröffnen.',
  publisherSentText: 'Ein 24 Stunden gültiger Anmeldelink wurde soeben an diese Adresse gesendet.',
  publisherTitle: 'Bereich für Herausgeber',
  publisherSignedIn: (email, plan) => `Angemeldet als ${email} · Tarif: ${plan}`,
  publisherProfileHeading: 'Ihr Profil',
  publisherNameLabel: 'Name, der Leserinnen und Lesern angezeigt wird',
  publisherWelcomeLabel: 'Begrüßungstext',
  publisherProfileHint: 'Wird auf der Abo-Seite Ihrer Feeds angezeigt, sobald eine Ihrer Domains verifiziert ist.',
  publisherSave: 'Speichern',
  publisherDomainsHeading: 'Ihre Domains',
  publisherDomainLabel: 'Domain (zum Beispiel blog.example.org)',
  publisherAddDomain: 'Hinzufügen',
  publisherNoDomain: 'Noch keine Domain.',
  publisherVerified: (method, date) => `Per ${method === 'dns' ? 'DNS' : 'Datei'} verifiziert am ${date}`,
  publisherNotVerified: 'Noch nicht verifiziert',
  publisherCheck: 'Jetzt prüfen',
  publisherRemove: 'Entfernen',
  publisherProofIntro: (domain) => `Weisen Sie auf eine von zwei Arten nach, dass Sie ${domain} kontrollieren, und klicken Sie dann auf „Jetzt prüfen“:`,
  publisherProofFile: 'Veröffentlichen Sie unter dieser Adresse eine Datei mit dieser Zeile als Inhalt:',
  publisherProofDns: 'oder legen Sie einen DNS-TXT-Eintrag an, mit dem Namen',
  publisherProofDnsValue: 'und dem Wert:',
  publisherResult: {
    verified: 'Die Domain ist verifiziert.',
    failed: 'Der Nachweis wurde noch nicht gefunden. Änderungen im DNS können eine Weile brauchen, bis sie sichtbar sind.',
    invalid: 'Das sieht nicht wie ein Domainname aus.',
    limit: 'Sie haben die maximale Anzahl an Domains erreicht.',
    'logo-saved': 'Das Logo ist gespeichert.',
    'logo-removed': 'Das Logo ist entfernt.',
    'logo-domain': 'Das Logo muss auf einer Ihrer verifizierten Domains liegen.',
    'logo-invalid': 'Unter dieser Adresse liegt kein PNG-, JPEG- oder WebP-Bild von höchstens 100 KB.',
    saved: 'Gespeichert.',
  },
  publisherFeedsHeading: 'Ihre Feeds',
  publisherNoFeeds: 'Noch wird kein Feed Ihrer verifizierten Domains abonniert.',
  publisherColFeed: 'Feed',
  publisherColTotal: 'Gesamt',
  publisherFewer: (n) => `weniger als ${n}`,
  publisherCountsNote: (n) => `Nur bestätigte Abonnements werden gezählt. Zahlen unter ${n} werden nicht angezeigt, damit niemand herausfinden kann, wer abonniert hat.`,
  publisherDeleteHeading: 'Bereich für Herausgeber löschen',
  publisherDeleteText: 'Löscht Ihre Adresse, Ihr Profil und Ihre Domains. Ihre Leserinnen und Leser behalten ihre Abonnements.',
  publisherDeleteButton: 'Meinen Bereich für Herausgeber löschen',
  publisherDeletedTitle: 'Bereich für Herausgeber gelöscht',
  publisherDeletedText: 'Ihre Adresse, Ihr Profil und Ihre Domains sind gelöscht. Ihre Leserinnen und Leser behalten ihre Abonnements.',
  publisherExpiredText: 'Dieser Link ist nicht mehr gültig. Fordern Sie auf der Seite „Herausgeber“ einen neuen an.',
  publisherPlanUntil: (date) => `bis ${date}`,
  publisherProHint: (plan) => `Mit dem Tarif ${plan}: Ihr Logo auf der Abonnementseite, Ihr Begrüßungstext in der Bestätigungs-E-Mail sowie Bestätigungen und Abmeldungen Woche für Woche.`,
  publisherLogoHeading: 'Logo',
  publisherLogoLabel: 'Adresse Ihres Logos',
  publisherLogoHint: (kb) => `Ein PNG-, JPEG- oder WebP-Bild von höchstens ${kb} KB auf einer Ihrer verifizierten Domains. Es wird hierher kopiert: Die Browser der Leser laden es nie von Ihrer Website. Leeren Sie das Feld, um es zu entfernen.`,
  publisherLogoSave: 'Logo speichern',
  publisherGrowthHeading: 'Woche für Woche',
  publisherGrowthIntro: (n) => `Bestätigte Abonnements und abgemeldete Leser pro Woche, für jeden Feed mit mindestens ${n} Abonnenten.`,
  publisherGrowthNone: (n) => `Noch nichts zu zeigen: Ein Feed erscheint hier, sobald ihm mindestens ${n} Personen folgen.`,
  publisherColWeek: 'Woche ab',
  publisherColConfirmed: 'Bestätigt',
  publisherColStopped: 'Abgemeldet',
  logoAlt: (name) => `Logo von ${name}`,
  publishedBy: (name) => `Veröffentlicht von ${name}`,
  verifiedDomain: (domain) => `verifizierte Domain ${domain}`,

  newsTitle: 'Neuigkeiten',
  newsFollow: 'Diesen Neuigkeiten folgen:',
  newsByEmail: 'per E-Mail',
  newsFeed: 'Atom-Feed',
  robotTitle: 'Der Roboter',
  robotHeading: 'Der Roboter, der Ihre Feeds liest',
  robotIntro: (service) =>
    `${service} liest Atom- und RSS-Feeds, um ihre neuen Beiträge per E-Mail an die Personen zu senden, die sie angefordert haben. Er gibt sich mit diesem Header zu erkennen:`,
  robotPoints: (min, max) => [
    `Jeder Feed wird pro Durchgang einmal gelesen, unabhängig von der Zahl der Abonnenten, alle ${min} bis ${max} Minuten.`,
    'Er sendet If-None-Match und If-Modified-Since, beachtet Cache-Control: max-age und Retry-After und fragt seltener an, wenn der Server fehlerhaft antwortet.',
    'Er liest nur Feeds, die jemand abonniert hat, und vergisst die, denen niemand mehr folgt.',
    'Wenn Ihr Feed einen WebSub-Hub angibt (<link rel="hub">), abonniert er diesen und liest Ihren Feed innerhalb einer Minute nach einer Benachrichtigung, andernfalls nur alle 6 Stunden.',
  ],
  robotContact: 'Bei Fragen oder um ihn anzuhalten:',

  legalTitle: 'Impressum',
  legalSections: (p) => [
    {
      heading: 'Anbieter',
      items: [
        p.company ? `${p.company}, vereinfachte Aktiengesellschaft (SAS)${p.capital ? ` mit einem Grundkapital von ${p.capital}` : ''}` : '',
        p.address ? `Sitz: ${p.address}` : '',
        p.registration ? `Registereintrag: ${p.registration}` : '',
        p.siret ? `SIRET: ${p.siret}` : '',
        p.vat ? `USt-IdNr.: ${p.vat}` : '',
        `Kontakt: ${p.contact}`,
        p.director ? `Verantwortlich für die Veröffentlichung: ${p.director}` : '',
      ].filter(Boolean),
    },
    {
      heading: 'Hosting',
      items: [p.hostName, p.hostAddress, p.hostPhone ? `Telefon: ${p.hostPhone}` : ''].filter(Boolean),
    },
    {
      heading: 'Personenbezogene Daten',
      paragraphs: ['Was der Dienst erhebt, warum, wie lange, und Ihre Rechte: siehe „Ihre Daten“.'],
    },
    {
      heading: 'Quellcode',
      paragraphs: [`${p.service} ist freie Software unter der GNU Affero General Public License, Version 3 oder später. Der Quellcode ist unter ${p.sourceUrl} verfügbar.`],
    },
    {
      heading: 'Anwendbares Recht',
      paragraphs: ['Dieses Impressum unterliegt französischem Recht. Im Streitfall und nach einem Versuch der gütlichen Einigung sind ausschließlich die französischen Gerichte zuständig.'],
    },
  ],

  termsTitle: 'Nutzungsbedingungen',
  termsUpdated: (date) => `Zuletzt aktualisiert: ${date}.`,
  termsSections: (p) => [
    {
      heading: 'Der Dienst',
      paragraphs: [
        `${p.service} sendet die neuen Beiträge von Atom- und RSS-Feeds per E-Mail an die Personen, die sie anfordern. Er wird von ${p.operator} betrieben (siehe Impressum). Der Empfang neuer Beiträge ist kostenlos.`,
        'Mit der Nutzung des Dienstes akzeptieren Sie diese Bedingungen. Wenn Sie sie nicht akzeptieren, nutzen Sie den Dienst nicht.',
      ],
    },
    {
      heading: 'Abonnieren',
      items: [
        'Tragen Sie nur Adressen ein, die Ihnen gehören oder die Sie verwenden dürfen. Jedes Abonnement muss von der Adresse selbst aus bestätigt werden.',
        'Sie können jederzeit die Häufigkeit eines Feeds ändern, einen Feed abbestellen oder Ihre Adresse löschen: aus jeder E-Mail heraus oder unter „Meine Abonnements“.',
        'Verwenden Sie den Dienst nicht, um massenhaft Anfragen zu senden, eine Adresse zu überfluten oder seine Beschränkungen zu umgehen. Anfragen, die nach Missbrauch aussehen, können abgelehnt und ihr Urheber gesperrt werden.',
      ],
    },
    {
      heading: 'Inhalte',
      paragraphs: [
        `Die Feeds gehören ihren Herausgebern. ${p.service} übernimmt deren Titel, Zusammenfassungen und Links unverändert, ohne sie zu prüfen oder zu bearbeiten, und ist weder für sie noch für die Websites, auf die sie verlinken, verantwortlich.`,
        `Um rechtswidrige Inhalte zu melden, schreiben Sie an ${p.contact}: Der Feed kann für alle gesperrt werden.`,
      ],
    },
    {
      heading: 'Herausgeber',
      paragraphs: ['Diese Punkte gelten für alle, die einen Bereich für Herausgeber eröffnen.'],
      items: [
        'Verifizieren Sie nur Domains, die Sie kontrollieren oder vertreten dürfen. Eine Domain ist dem zugeordnet, der sie zuletzt nachgewiesen hat; verschwindet ein Nachweis, geht die Domain verloren.',
        'Der Name und der Begrüßungstext, die Sie Leserinnen und Lesern zeigen, müssen zutreffend und rechtmäßig sein und dürfen sich weder als jemand anderes ausgeben noch für Dritte werben. Andernfalls können sie entfernt werden.',
        'Abonnentenzahlen werden zur Information angegeben, so wie sie sind; Zahlen unter fünf werden nicht angezeigt. Sie sehen nie die Adressen der Abonnenten und dürfen nicht versuchen, sie zu identifizieren.',
        'Sie können Ihren Bereich für Herausgeber jederzeit löschen. Ein Bereich, in dem nie eine Domain verifiziert wird, wird nach 30 Tagen gelöscht.',
        'Falls kostenpflichtige Tarife angeboten werden, werden deren Preis und Bedingungen angezeigt, bevor Sie einen abschließen.',
      ],
    },
    {
      heading: 'Verfügbarkeit',
      paragraphs: [
        'Der Dienst wird so bereitgestellt, wie er ist. Er bemüht sich, jeden neuen Beitrag einmal und rechtzeitig zuzustellen, kann dies aber nicht garantieren: Feeds können nicht erreichbar sein, und E-Mails können von E-Mail-Anbietern verzögert oder gefiltert werden.',
        'Der Dienst kann sich ändern oder eingestellt werden. Wird er eingestellt, werden Abonnenten und Herausgeber nach Möglichkeit vorher per E-Mail informiert.',
      ],
    },
    {
      heading: 'Personenbezogene Daten',
      paragraphs: ['Was erhoben wird, warum, wie lange, und Ihre Rechte: siehe „Ihre Daten“.'],
    },
    {
      heading: 'Änderungen dieser Bedingungen',
      paragraphs: ['Diese Bedingungen können sich ändern. Das Datum oben zeigt die neueste Fassung. Herausgeber akzeptieren die jeweils geltende Fassung, wenn sie einen Anmeldelink anfordern; wichtige Änderungen werden per E-Mail angekündigt.'],
    },
    {
      heading: 'Anwendbares Recht',
      paragraphs: [`Diese Bedingungen unterliegen dem Recht des Landes, in dem ${p.operator} niedergelassen ist (siehe Impressum). Fragen: ${p.contact}.`],
    },
  ],

  privacyTitle: 'Ihre Daten',
  privacySections: (p) => [
    { heading: 'Wer verantwortlich ist', paragraphs: [`${p.operator}, erreichbar unter ${p.contact}.`] },
    {
      heading: 'Was erhoben wird',
      paragraphs: [
        'Ihre E-Mail-Adresse und sonst nichts: kein Name, kein Passwort, keine Cookies, keine Erfassung von Öffnungen oder Klicks.',
        'Außerdem speichern wir die Liste der Feeds, denen Sie folgen, die gewünschte Häufigkeit, Ihre Sprache und das Datum Ihres Abonnements und Ihrer Bestätigung.',
      ],
    },
    {
      heading: 'Warum',
      paragraphs: [
        'Nur um Ihnen die neuen Beiträge der Feeds zu senden, die Sie angefordert haben, sowie die E-Mails, die der Dienst dafür benötigt (Bestätigung, Link zu Ihren Abonnements).',
        'Rechtsgrundlage: Ihre Einwilligung, erteilt durch die doppelte Bestätigung, die Sie jederzeit durch Abbestellen widerrufen können.',
      ],
    },
    {
      heading: 'Wer sie sieht',
      paragraphs: [
        `Niemand außer dem Betreiber und seinen Auftragsverarbeitern (${p.processors}), die ausschließlich in seinem Auftrag handeln.`,
        'Die Herausgeber der Feeds sehen nur, wie viele Abonnenten sie haben, nie deren Adressen. Keine Adresse wird verkauft, vermietet oder weitergegeben. Keine Werbung in den E-Mails.',
      ],
    },
    {
      heading: 'Wie lange',
      items: [
        `Ohne Bestätigung wird die Adresse nach ${p.pendingDays === 1 ? '1 Tag' : `${p.pendingDays} Tagen`} gelöscht.`,
        'Wenn Sie Ihren letzten Feed abbestellen, wird sie sofort gelöscht.',
        `Wenn E-Mails nicht mehr zugestellt werden können (die Adresse existiert nicht), wird der Versand eingestellt und die Adresse nach ${p.suspendedDays === 1 ? '1 Tag' : `${p.suspendedDays} Tagen`} gelöscht.`,
        'Wenn Sie eine E-Mail als Spam melden, wird die Adresse gelöscht; nur ein verschlüsselter Fingerabdruck wird aufbewahrt, damit wir Ihnen nie wieder schreiben.',
      ],
    },
    {
      heading: 'Ihre Rechte',
      paragraphs: [
        `Sie können Ihre Abonnements jederzeit unter „Meine Abonnements“ einsehen, ihre Häufigkeit ändern, sie beenden und Ihre Adresse löschen, oder für jedes andere Recht (Auskunft, Berichtigung, Widerspruch) an ${p.contact} schreiben.`,
        'Sie können außerdem Beschwerde bei Ihrer Datenschutzaufsichtsbehörde einlegen (in Frankreich bei der CNIL: cnil.fr).',
      ],
    },
    {
      heading: 'Technische Protokolle',
      paragraphs: ['Um Missbrauch einzuschränken, wird die Zahl der Anfragen pro IP-Adresse und pro E-Mail-Adresse in Form von Fingerabdrücken gezählt, die nach zwei Tagen gelöscht werden.'],
    },
  ],

  mail: {
    via: (feed, service) => `${feed} über ${service}`,
    read: 'Lesen',
    readOn: (host) => `Auf ${host} lesen`,
    footerWhy: (feed, url) => `Sie erhalten diese E-Mail, weil diese Adresse die neuen Beiträge von „${feed}“ (${url}) abonniert hat.`,
    footerWhyShort: (feed) => `Sie erhalten diese E-Mail, weil diese Adresse die neuen Beiträge von „${feed}“ abonniert hat.`,
    footerUnsubscribe: 'Mit einem Klick abbestellen',
    footerManage: 'Ihre Abonnements verwalten',
    footerNoTracking: (service) => `${service} erfasst weder das Öffnen seiner E-Mails noch Klicks auf deren Links.`,
    digestHeading: { daily: 'Neu von heute', weekly: 'Neu in dieser Woche', burst: (n) => `${posts(n)} auf einmal` },
    count: (n) => posts(n),
    mergedSubject: (kind, n, feeds) =>
      `Ihre ${digestAdj(kind)} Zusammenfassung: ${posts(n)} aus ${feedCount(feeds)}`,
    mergedUnsubscribeFeed: 'Diesen Feed abbestellen',
    mergedWhy: (feeds, kind) => `Sie erhalten diese ${digestAdj(kind)} Zusammenfassung, weil diese Adresse ${feeds === 1 ? 'diesen Feed' : `diese ${feeds} Feeds`} abonniert hat.`,
    mergedStop: (kind) => `Diese ${digestAdj(kind)} Zusammenfassung abbestellen`,
    removedSubject: (feed) => `„${feed}“ ist nicht mehr verfügbar`,
    removedBody: (p) => `Guten Tag,

der Feed „${p.feed}“ (${p.url}) wurde von ${p.service} entfernt.
Ihr Abonnement dieses Feeds ist beendet. Wenn es Ihr einziges Abonnement war, wurde Ihre
Adresse gelöscht. Sie müssen nichts tun.

Fragen: ${p.contact}

--
${p.service}`,
    deadSubject: (feed) => `„${feed}“ antwortet nicht mehr`,
    deadBody: (p) => [
      `Guten Tag,`,
      `der Feed „${p.feed}“ (${p.url}) antwortet seit dem ${p.since} nicht mehr: Die Website hat ihn vielleicht verschoben oder eingestellt. Solange er nicht antwortet, erhalten Sie keine neuen Beiträge.`,
      `Er wird weiterhin einmal täglich geprüft. Wenn er wieder erreichbar ist, wird der Versand automatisch fortgesetzt. Andernfalls endet dieses Abonnement am ${p.until}, und wenn es Ihr letztes ist, wird Ihre Adresse gelöscht. Sie müssen nichts tun.`,
      `Wenn die Website ihren Feed jetzt unter einer anderen Adresse veröffentlicht, abonnieren Sie den neuen über die Website.`,
    ],
    welcomeFrom: (name) => `Ein Wort von ${name}:`,
    confirmSubject: (host) => `Bestätigen Sie Ihr Abonnement für neue Beiträge von ${host}`,
    confirmBody: (p) => `Guten Tag,

jemand (vermutlich Sie) hat darum gebeten, die neuen Beiträge dieses Feeds per E-Mail zu erhalten:

  ${p.feed}
  ${p.url}${p.welcome}

Häufigkeit: ${p.cadence}.

Um zu bestätigen, öffnen Sie diesen Link und klicken Sie auf „Bestätigen“:

  ${p.link}

Wenn Sie nichts angefordert haben, tun Sie nichts: Sie erhalten keine weitere E-Mail,
und Ihre Adresse wird in ${p.days === 1 ? '1 Tag' : `${p.days} Tagen`} gelöscht.

--
${p.service} — ${p.baseUrl}
Kontakt: ${p.contact}`,
    alreadySubject: (host) => `Sie haben die neuen Beiträge von ${host} bereits abonniert`,
    alreadyBody: (p) => `Guten Tag,

für diese Adresse, die bereits abonniert ist, wurde erneut ein Abonnement der neuen
Beiträge von „${p.feed}“ angefordert. Es hat sich nichts geändert.

Um die Häufigkeit zu ändern oder abzubestellen: ${p.manage}

--
${p.service} — ${p.baseUrl}`,
    publisherSubject: (service) => `Ihr Bereich für Herausgeber — ${service}`,
    publisherBody: (p) => `Guten Tag,

hier ist der Link zu Ihrem Bereich für Herausgeber auf ${p.service}. Er ist 24 Stunden gültig:

  ${p.link}

Wenn Sie nichts angefordert haben, ignorieren Sie diese E-Mail: Es wurde nichts angelegt.

--
${p.service} — ${p.baseUrl}`,
    manageSubject: (service) => `Ihr Zugangslink — ${service}`,
    manageBody: (p) => `Guten Tag,

hier ist der Link zu Ihren Abonnements. Er ist 24 Stunden gültig:

  ${p.link}

Dort können Sie Ihre Abonnements einsehen, ihre Häufigkeit ändern oder alles beenden.
Wenn Sie nichts angefordert haben, ignorieren Sie diese E-Mail.

--
${p.service} — ${p.baseUrl}`,
  },
};
