// Messages en français.

import type { FeedErrorCode, Messages } from './en.ts';

const feedErrors: Record<FeedErrorCode, string> = {
  'invalid-url': "cette adresse n'est pas valide.",
  'bad-scheme': 'seules les adresses http et https sont acceptées.',
  credentials: 'les adresses contenant un identifiant ou un mot de passe ne sont pas acceptées.',
  'private-address': 'cette adresse désigne un réseau privé.',
  'too-many-redirects': 'le serveur redirige trop de fois.',
  'no-location': 'le serveur a envoyé une redirection incomplète.',
  'http-status': 'le serveur a répondu par une erreur.',
  'too-large': 'le flux est trop volumineux (plus de 5 Mo).',
  interrupted: 'le transfert a été interrompu.',
  timeout: 'le serveur a mis trop de temps à répondre.',
  connect: 'le serveur est injoignable.',
  entities: 'le document déclare des entités XML, refusées par prudence.',
  malformed: "le document n'est pas du XML bien formé.",
  'not-a-feed': "ce document n'est ni un flux Atom ni un flux RSS.",
  unexpected: 'le serveur a donné une réponse inattendue.',
  'no-feed-found': "cette page n'annonce aucun flux Atom ou RSS.",
  'several-feeds': 'cette page annonce plusieurs flux.',
};

export const fr: Messages = {
  langName: 'Français',
  label: (label) => `${label} :`,

  nav: { privacy: 'Vos données', account: 'Mes abonnements', publishers: 'Éditeurs', robot: 'Le robot', legal: 'Mentions légales', terms: "Conditions d'utilisation", source: 'Code source' },
  languageSwitch: 'Langue',

  cadence: {
    immediate: 'un courriel par nouveauté',
    daily: 'un récapitulatif par jour',
    weekly: 'un récapitulatif par semaine',
  },
  weekdays: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'],
  onWeekday: (day) => `le ${day}`,
  atHour: (h) => `${h} h`,

  homeTitle: 'Recevoir un flux par courriel',
  homeHeading: "Les nouveautés d'un site, dans votre boîte aux lettres",
  homeIntro: (service) =>
    `Beaucoup de sites publient un flux Atom ou RSS : la liste de leurs dernières publications. ${service} vous les envoie par courriel, au rythme que vous choisissez. Pas de compte, pas de mot de passe, pas de publicité, pas de pistage.`,
  feedUrlLabel: 'Adresse du flux ou du site',
  feedUrlButton: 'Voir ce flux',
  home: {
    stepsHeading: 'Comment ça marche',
    steps: [
      "Collez l'adresse d'un flux, ou simplement d'un site : ses flux sont trouvés pour vous. Beaucoup de sites proposent aussi un lien « Recevoir les nouveautés par courriel ».",
      "Donnez votre adresse et choisissez le rythme : un courriel par nouveauté, ou un récapitulatif quotidien ou hebdomadaire, à l'heure qui vous convient.",
      'Confirmez depuis le courriel reçu. Ensuite, chaque courriel contient un lien de désabonnement en un clic.',
    ],
    promisesHeading: 'Ce sur quoi vous pouvez compter',
    promises: [
      'Gratuit pour les lecteurs, sans publicité dans les courriels.',
      'Aucun pistage : ni pixel, ni lien réécrit, ni cookie. Les courriels se lisent pareil sans images.',
      "Votre adresse ne sert qu'à ces envois, n'est jamais partagée et est effacée dès que vous arrêtez votre dernier abonnement.",
      'Plusieurs récapitulatifs à la même heure arrivent en un seul courriel, une partie par site.',
      "Si un site arrête son flux, vous êtes prévenu au lieu d'attendre pour rien.",
    ],
    publishersHeading: 'Vous publiez un site ?',
    publishersText: (service) =>
      `Permettez à vos lecteurs de vous suivre par courriel avec un simple lien à côté de votre flux : pas de script, pas de compte, pas de liste à gérer. ${service} lit votre flux poliment, une fois quel que soit le nombre d'abonnés, et dans la minute s'il annonce un hub WebSub.`,
    publishersCta: 'Obtenir le lien ou un bouton',
    faqHeading: 'Questions',
    faq: [
      { q: "Qu'est-ce qu'un flux ?", a: "La liste des dernières publications d'un site, publiée à une adresse lisible par des programmes (Atom ou RSS). La plupart des blogs, des sites d'information et beaucoup d'organismes publics en ont un, souvent signalé par une icône orange." },
      { q: "Je ne trouve pas l'adresse du flux.", a: "Collez plutôt l'adresse du site : s'il annonce un flux, il est trouvé pour vous." },
      { q: 'Faut-il un compte ?', a: 'Non. Vos abonnements sont accessibles par un lien envoyé à votre adresse, valable 24 heures, chaque fois que vous le demandez.' },
      { q: 'Comment arrêter ?', a: "Avec le lien en bas de n'importe quel courriel, en un clic, ou depuis « Mes abonnements », où vous pouvez aussi effacer votre adresse." },
    ],
  },

  subscribeTitle: (feed) => `S'abonner à ${feed}`,
  feedLabel: 'Flux',
  siteLabel: 'Site',
  latestHeading: 'Ses dernières publications',
  noEntries: 'Ce flux ne contient aucune entrée pour le moment.',
  untitled: 'Sans titre',
  receiveHeading: 'Recevoir les prochaines par courriel',
  emailLabel: 'Votre adresse de courriel',
  cadenceLegend: 'Rythme',
  subscribeButton: 'Recevoir les nouveautés',
  subscribeNotice: (days) =>
    `Vous allez recevoir un courriel avec un lien de confirmation. Tant que vous n'aurez pas cliqué dessus, rien d'autre ne vous sera envoyé, et votre adresse sera effacée au bout de ${days} jours. Votre adresse ne sert qu'à ces envois :`,
  privacyLink: 'ce que nous en faisons',
  subscribeTerms: "En vous abonnant, vous acceptez les",
  termsLink: "conditions d'utilisation",

  feedErrorTitle: 'Flux illisible',
  feedErrorHeading: 'Ce flux ne peut pas être lu',
  feedError: (code) => `Ce flux ne peut pas être lu : ${feedErrors[code] ?? feedErrors.unexpected}`,
  chooseTitle: 'Choisir un flux',
  chooseHeading: 'Cette page propose plusieurs flux',
  chooseText: 'Lequel voulez-vous recevoir par courriel ?',
  chooseUntitled: 'Flux sans titre',
  feedErrorHelp: (service) =>
    `${service} accepte les flux Atom et RSS. Vérifiez l'adresse : elle se termine souvent par .xml, /feed, /rss ou /atom.`,
  invalidFeedUrl: "L'adresse du flux n'est pas valide.",
  invalidEmail: "Cette adresse de courriel n'a pas l'air valide.",
  chooseCadence: 'Choisissez un rythme.',
  tooManyTitle: 'Trop de demandes',
  tooManyText: 'Réessayez dans une heure.',
  errorTitle: 'Erreur',
  errorText: "Quelque chose s'est mal passé. Réessayez dans un instant.",
  notFoundTitle: 'Page introuvable',
  notFoundText: "Cette page n'existe pas.",
  expiredTitle: 'Lien expiré',
  confirmExpiredText: "Ce lien n'est plus valable. Recommencez l'abonnement depuis le site qui vous a amené ici.",
  invalidUnsubscribeTitle: 'Lien invalide',
  invalidUnsubscribeText: "Ce lien de désinscription n'est pas valable.",
  manageExpiredText: "Ce lien n'est plus valable. Demandez-en un nouveau depuis « Mes abonnements ».",

  checkMailboxTitle: 'Vérifiez votre boîte',
  checkMailboxHeading: 'Vérifiez votre boîte aux lettres',
  checkMailboxText: "Si l'adresse est valide, un courriel de confirmation vient de partir. Ouvrez le lien qu'il contient pour confirmer l'abonnement. Pensez à regarder dans les indésirables.",
  checkMailboxNote: "Rien ne vous sera envoyé tant que vous n'aurez pas confirmé.",

  confirmTitle: 'Confirmer',
  confirmHeading: "Confirmer l'abonnement",
  confirmText: (feed, cadence) => `Vous allez recevoir les nouveautés de « ${feed} » : ${cadence}.`,
  confirmButton: 'Confirmer',
  confirmNote: "Ce bouton évite qu'un logiciel qui ouvre les liens de vos courriels (un antivirus, par exemple) ne confirme à votre place.",
  confirmedTitle: 'Abonnement confirmé',
  confirmedHeading: "C'est fait",
  confirmedText: (feed) => `Vous recevrez les prochaines nouveautés de « ${feed} ». Chaque courriel contient un lien pour se désabonner en un clic.`,
  confirmedManage: 'Pour changer de rythme ou arrêter :',
  confirmedUnsubscribe: 'se désabonner',

  unsubscribeTitle: 'Se désabonner',
  unsubscribeHeading: 'Se désabonner',
  unsubscribeText: (feed) => `Ne plus recevoir les nouveautés de « ${feed} » ?`,
  unsubscribeButton: 'Me désabonner',
  unsubscribedTitle: 'Désabonné',
  unsubscribedHeading: 'Vous êtes désabonné',
  unsubscribedText: "Vous ne recevrez plus rien pour ce flux. Si c'était votre dernier abonnement, votre adresse a été effacée.",
  unsubscribedNote: "Une erreur ? Il suffit de vous abonner à nouveau depuis le site d'origine.",

  stopDigestTitle: (kind) => (kind === 'daily' ? 'Arrêter le récapitulatif quotidien' : 'Arrêter le récapitulatif hebdomadaire'),
  stopDigestText: (kind, n) =>
    `Arrêter le récapitulatif ${kind === 'daily' ? 'quotidien' : 'hebdomadaire'} ? Il regroupe ${n === 1 ? '1 flux' : `${n} flux`} :`,
  stopDigestButton: 'Arrêter ce récapitulatif',
  stopDigestOther: "Vos autres abonnements ne changent pas. Pour n'arrêter qu'un flux, utilisez le lien sous ce flux dans le courriel, ou :",
  stoppedDigestText: "Vous ne recevrez plus ce récapitulatif. S'il contenait vos derniers abonnements, votre adresse a été effacée.",

  accountTitle: 'Mes abonnements',
  accountRequestText: 'Pas de mot de passe : donnez votre adresse, vous recevrez un lien valable 24 heures qui ouvre votre espace.',
  accountRequestButton: 'Recevoir le lien',
  accountSentTitle: 'Lien envoyé',
  accountSentText: 'Si cette adresse est abonnée à au moins un flux, un lien vers votre espace vient de lui être envoyé.',
  accountAddress: (email) => `Adresse : ${email}`,
  accountNone: 'Aucun abonnement.',
  accountColFeed: 'Flux',
  accountColCadence: 'Rythme',
  accountColWhen: 'Quand',
  accountPending: 'en attente de confirmation',
  accountAsPublished: 'dès la parution',
  accountChange: 'Changer',
  accountStop: 'Arrêter',
  accountCadenceAria: (feed) => `Rythme pour ${feed}`,
  accountHourAria: (feed) => `Heure du récapitulatif pour ${feed}`,
  accountDayAria: (feed) => `Jour du récapitulatif pour ${feed}`,
  accountDeleteHeading: 'Tout arrêter',
  accountDeleteText: 'Supprime tous vos abonnements et efface votre adresse. Immédiat et définitif.',
  accountDeleteButton: 'Tout arrêter et effacer mon adresse',
  accountErasedTitle: 'Adresse effacée',
  accountErasedText: 'Tous vos abonnements sont arrêtés et votre adresse est effacée.',

  publishersTitle: 'Éditeurs',
  publishersHeading: 'Proposer vos nouveautés par courriel',
  publishersIntro: (service) =>
    `Vos lecteurs n'ont pas tous un lecteur de flux, mais ils ont tous une boîte aux lettres. Ajoutez à côté de votre flux un lien vers ${service} : aucun script, aucun compte, rien à installer. Aucune adresse ne transite par votre site.`,
  publishersFeedLabel: 'Adresse de votre flux',
  publishersButton: 'Préparer le lien',
  publishersLinkHeading: 'Un lien',
  publishersButtonHeading: 'Ou un bouton',
  publishersLinkText: 'Recevoir les nouveautés par courriel',
  publishersTry: 'Essayer :',
  publishersReadersLabel: 'Langue de vos lecteurs',
  publishersReadersAuto: 'leur navigateur décide',
  publishersColorLabel: 'Couleur du bouton',
  publishersPreview: 'Aperçu :',
  publishersCopy: "Copiez ce code dans votre page. Il ne contient aucun script et ne charge rien : vos lecteurs ne sont pistés ni par vous ni par nous.",
  publishersButtonCode: 'Code du bouton',
  publishersTipsHeading: 'Ce que votre flux gagne à contenir',
  publishersTips: (service, minutes) => [
    "un identifiant stable par entrée (<id> en Atom, <guid> en RSS) : c'est lui qui évite les envois en double ;",
    'un lien par entrée, vers la page qui en parle ;',
    'un résumé en texte : c\'est ce qui sera lu dans le courriel ;',
    `des en-têtes ETag ou Last-Modified honorés : ${service} lit votre flux toutes les ${minutes} minutes environ, une seule fois quel que soit le nombre d'abonnés.`,
  ],

  cadenceShort: { immediate: 'Par nouveauté', daily: 'Quotidien', weekly: 'Hebdomadaire' },
  planNames: { free: 'Gratuite', pro: 'Pro', business: 'Business' },
  publisherSignInHeading: 'Espace éditeur',
  publisherSignInText: "Vérifiez votre domaine pour afficher votre nom et un texte d'accueil sur la page d'abonnement de vos flux, et voir combien de personnes les suivent. Pas de mot de passe : nous vous envoyons un lien.",
  publisherSignInButton: 'Recevoir un lien de connexion',
  publisherTermsLabel: "J'ai lu et j'accepte les conditions d'utilisation, y compris la partie consacrée aux éditeurs",
  publisherTermsRequired: "Acceptez les conditions d'utilisation pour ouvrir un espace éditeur.",
  publisherSentText: 'Un lien de connexion, valable 24 heures, vient de partir à cette adresse.',
  publisherTitle: 'Espace éditeur',
  publisherSignedIn: (email, plan) => `Connecté en tant que ${email} · offre ${plan}`,
  publisherProfileHeading: 'Votre profil',
  publisherNameLabel: 'Nom affiché aux lecteurs',
  publisherWelcomeLabel: "Texte d'accueil",
  publisherProfileHint: "Affiché sur la page d'abonnement de vos flux dès qu'un de vos domaines est vérifié.",
  publisherSave: 'Enregistrer',
  publisherDomainsHeading: 'Vos domaines',
  publisherDomainLabel: 'Domaine (par exemple blog.exemple.fr)',
  publisherAddDomain: 'Ajouter',
  publisherNoDomain: 'Aucun domaine pour le moment.',
  publisherVerified: (method, date) => `Vérifié par ${method === 'dns' ? 'DNS' : 'fichier'} le ${date}`,
  publisherNotVerified: 'Pas encore vérifié',
  publisherCheck: 'Vérifier',
  publisherRemove: 'Retirer',
  publisherProofIntro: (domain) => `Prouvez que vous contrôlez ${domain} de l'une de ces deux façons, puis cliquez sur « Vérifier » :`,
  publisherProofFile: 'publiez un fichier à cette adresse, contenant cette ligne :',
  publisherProofDns: 'ou ajoutez un enregistrement DNS TXT nommé',
  publisherProofDnsValue: 'avec la valeur :',
  publisherResult: {
    verified: 'Le domaine est vérifié.',
    failed: "La preuve n'a pas encore été trouvée. Une modification DNS peut mettre un moment à apparaître.",
    invalid: "Cela ne ressemble pas à un nom de domaine.",
    limit: 'Vous avez atteint le nombre maximal de domaines.',
    saved: 'Enregistré.',
  },
  publisherFeedsHeading: 'Vos flux',
  publisherNoFeeds: "Aucun flux de vos domaines vérifiés n'est encore suivi.",
  publisherColFeed: 'Flux',
  publisherColTotal: 'Total',
  publisherFewer: (n) => `moins de ${n}`,
  publisherCountsNote: (n) => `Seuls les abonnements confirmés sont comptés. Les nombres inférieurs à ${n} ne sont pas affichés : personne ne peut deviner qui s'est abonné.`,
  publisherDeleteHeading: "Supprimer l'espace éditeur",
  publisherDeleteText: 'Efface votre adresse, votre profil et vos domaines. Vos lecteurs gardent leurs abonnements.',
  publisherDeleteButton: 'Supprimer mon espace éditeur',
  publisherDeletedTitle: 'Espace éditeur supprimé',
  publisherDeletedText: 'Votre adresse, votre profil et vos domaines sont effacés. Vos lecteurs gardent leurs abonnements.',
  publisherExpiredText: "Ce lien n'est plus valable. Demandez-en un nouveau depuis la page Éditeurs.",
  publishedBy: (name) => `Publié par ${name}`,
  verifiedDomain: (domain) => `domaine vérifié ${domain}`,

  robotTitle: 'Le robot',
  robotHeading: 'Le robot qui lit vos flux',
  robotIntro: (service) =>
    `${service} lit des flux Atom et RSS pour envoyer leurs nouveautés par courriel aux personnes qui l'ont demandé. Il se présente avec l'en-tête :`,
  robotPoints: (min, max) => [
    `Chaque flux est lu une seule fois par passage, quel que soit le nombre d'abonnés, toutes les ${min} à ${max} minutes.`,
    'Il envoie If-None-Match et If-Modified-Since, respecte Cache-Control: max-age et Retry-After, et espace ses visites quand le serveur répond mal.',
    "Il ne lit que les flux auxquels quelqu'un est abonné, et oublie ceux que plus personne ne suit.",
    'Si votre flux annonce un concentrateur WebSub (<link rel="hub">), il s\'y abonne : il lit votre flux dans la minute qui suit une notification, et seulement toutes les 6 heures sinon.',
  ],
  robotContact: "Pour toute question ou pour demander l'arrêt :",

  legalTitle: 'Mentions légales',
  legalSections: (p) => [
    {
      heading: 'Éditeur du site',
      items: [
        p.company ? `${p.company}, société par actions simplifiée${p.capital ? ` au capital de ${p.capital}` : ''}` : '',
        p.address ? `Siège : ${p.address}` : '',
        p.registration ? `RCS : ${p.registration}` : '',
        p.siret ? `SIRET : ${p.siret}` : '',
        p.vat ? `TVA intracommunautaire : ${p.vat}` : '',
        `Contact : ${p.contact}`,
        p.director ? `Directeur de la publication : ${p.director}` : '',
      ].filter(Boolean),
    },
    {
      heading: 'Hébergeur',
      items: [p.hostName, p.hostAddress, p.hostPhone ? `Téléphone : ${p.hostPhone}` : ''].filter(Boolean),
    },
    {
      heading: 'Données personnelles',
      paragraphs: ['Ce que le service collecte, pourquoi, combien de temps, et vos droits : voir « Vos données ».'],
    },
    {
      heading: 'Code source',
      paragraphs: [`${p.service} est un logiciel libre, sous licence GNU Affero General Public License, version 3 ou ultérieure. Son code source est disponible à l'adresse ${p.sourceUrl}.`],
    },
    {
      heading: 'Droit applicable',
      paragraphs: ["Les présentes mentions légales sont soumises au droit français. En cas de litige, et après tentative de résolution amiable, les tribunaux français sont seuls compétents."],
    },
  ],

  termsTitle: "Conditions d'utilisation",
  termsUpdated: (date) => `Dernière mise à jour : ${date}.`,
  termsSections: (p) => [
    {
      heading: 'Le service',
      paragraphs: [
        `${p.service} envoie par courriel les nouveautés de flux Atom et RSS aux personnes qui les demandent. Il est exploité par ${p.operator} (voir les mentions légales). Recevoir les nouveautés est gratuit.`,
        "Utiliser le service vaut acceptation de ces conditions. Si vous ne les acceptez pas, ne l'utilisez pas.",
      ],
    },
    {
      heading: "S'abonner",
      items: [
        "N'abonnez que des adresses qui sont les vôtres ou que vous êtes autorisé à utiliser. Chaque abonnement doit être confirmé depuis l'adresse elle-même.",
        "Vous pouvez à tout moment changer le rythme d'un flux, l'arrêter ou effacer votre adresse : depuis n'importe quel courriel, ou depuis « Mes abonnements ».",
        "N'utilisez pas le service pour envoyer des demandes en masse, inonder une adresse ou contourner ses limites. Les demandes qui ressemblent à un abus peuvent être refusées et leur auteur bloqué.",
      ],
    },
    {
      heading: 'Contenus',
      paragraphs: [
        `Les flux appartiennent à leurs éditeurs. ${p.service} reprend leurs titres, résumés et liens tels quels, sans les vérifier ni les modifier, et n'en est pas responsable, pas plus que des sites vers lesquels ils mènent.`,
        `Pour signaler un contenu illicite, écrivez à ${p.contact} : le flux peut être suspendu pour tous.`,
      ],
    },
    {
      heading: 'Éditeurs',
      paragraphs: ['Ces points concernent quiconque ouvre un espace éditeur.'],
      items: [
        "Ne vérifiez que des domaines que vous contrôlez ou que vous êtes autorisé à représenter. Le domaine revient à qui l'a prouvé en dernier ; une preuve qui disparaît est perdue.",
        "Le nom et le texte d'accueil montrés aux lecteurs doivent être exacts et licites, ne pas usurper l'identité de quiconque ni faire de publicité pour des tiers. Ils peuvent être retirés sinon.",
        "Les nombres d'abonnés sont donnés à titre indicatif, tels quels ; ceux inférieurs à cinq ne sont pas affichés. Vous ne voyez jamais les adresses des abonnés et ne devez pas chercher à les identifier.",
        "Vous pouvez supprimer votre espace éditeur à tout moment. Un espace qui ne vérifie aucun domaine est supprimé après 30 jours.",
        "Si des offres payantes sont proposées, leur prix et leurs conditions sont indiqués avant toute souscription.",
      ],
    },
    {
      heading: 'Disponibilité',
      paragraphs: [
        "Le service est fourni en l'état. Il fait de son mieux pour livrer chaque nouveauté une fois et à temps, sans pouvoir le garantir : un flux peut être indisponible, un courriel retardé ou filtré par la messagerie du destinataire.",
        "Le service peut évoluer ou s'arrêter. S'il s'arrête, abonnés et éditeurs en sont prévenus par courriel à l'avance lorsque c'est possible.",
      ],
    },
    {
      heading: 'Données personnelles',
      paragraphs: ['Ce qui est collecté, pourquoi, combien de temps, et vos droits : voir « Vos données ».'],
    },
    {
      heading: 'Évolution de ces conditions',
      paragraphs: ["Ces conditions peuvent évoluer. La date ci-dessus indique la dernière version. Les éditeurs acceptent la version en vigueur à chaque demande de lien de connexion ; les changements importants sont annoncés par courriel."],
    },
    {
      heading: 'Droit applicable',
      paragraphs: [`Ces conditions sont régies par le droit du pays où ${p.operator} est établi (voir les mentions légales). Questions : ${p.contact}.`],
    },
  ],

  privacyTitle: 'Vos données',
  privacySections: (p) => [
    { heading: 'Qui est responsable', paragraphs: [`${p.operator}, que vous pouvez joindre à ${p.contact}.`] },
    {
      heading: 'Ce qui est collecté',
      paragraphs: [
        "Votre adresse de courriel, et rien d'autre : ni nom, ni mot de passe, ni cookie, ni pistage des ouvertures ou des clics.",
        "Nous gardons aussi la liste des flux auxquels vous êtes abonné, le rythme choisi, votre langue et les dates d'abonnement et de confirmation.",
      ],
    },
    {
      heading: 'Pourquoi',
      paragraphs: [
        'Uniquement pour vous envoyer les nouveautés des flux que vous avez demandés, et les courriels nécessaires au service (confirmation, lien vers vos abonnements).',
        'Base légale : votre consentement, donné par la double confirmation, que vous retirez à tout moment en vous désabonnant.',
      ],
    },
    {
      heading: 'Qui la voit',
      paragraphs: [
        `Personne d'autre que l'exploitant et ses sous-traitants (${p.processors}), qui n'agissent que pour son compte.`,
        "Les éditeurs des flux ne voient que le nombre de leurs abonnés, jamais les adresses. Aucune adresse n'est vendue, louée ni partagée. Aucune publicité dans les courriels.",
      ],
    },
    {
      heading: 'Combien de temps',
      items: [
        `Sans confirmation, l'adresse est effacée au bout de ${p.pendingDays} jours.`,
        'À la désinscription du dernier flux, elle est effacée immédiatement.',
        `Si les courriels ne peuvent plus être remis (adresse inexistante), les envois sont suspendus et l'adresse est effacée au bout de ${p.suspendedDays} jours.`,
        'Si vous signalez un envoi comme indésirable, l\'adresse est effacée ; seule une empreinte chiffrée est gardée pour ne plus jamais vous écrire.',
      ],
    },
    {
      heading: 'Vos droits',
      paragraphs: [
        `Vous pouvez à tout moment voir vos abonnements, en changer le rythme, les arrêter et effacer votre adresse depuis « Mes abonnements », ou en écrivant à ${p.contact} pour tout autre droit (accès, rectification, opposition).`,
        'Vous pouvez aussi saisir la CNIL (cnil.fr).',
      ],
    },
    {
      heading: 'Journaux techniques',
      paragraphs: ["Pour limiter les abus, le nombre de demandes par adresse IP et par adresse de courriel est compté sous forme d'empreintes, effacées au bout de deux jours."],
    },
  ],

  mail: {
    via: (feed, service) => `${feed} via ${service}`,
    read: 'Lire',
    readOn: (host) => `Lire sur ${host}`,
    footerWhy: (feed, url) => `Vous recevez ce courriel parce que cette adresse est abonnée aux nouveautés de « ${feed} » (${url}).`,
    footerWhyShort: (feed) => `Vous recevez ce courriel parce que cette adresse est abonnée aux nouveautés de « ${feed} ».`,
    footerUnsubscribe: 'Se désabonner en un clic',
    footerManage: 'Gérer vos abonnements',
    footerNoTracking: (service) => `${service} ne suit ni l'ouverture de ses courriels ni les clics sur leurs liens.`,
    digestHeading: { daily: 'Les nouveautés du jour', weekly: 'Les nouveautés de la semaine', burst: (n) => `${n} nouveautés d'un coup` },
    count: (n) => (n === 1 ? '1 nouveauté' : `${n} nouveautés`),
    deadSubject: (feed) => `« ${feed} » ne répond plus`,
    deadBody: (p) => [
      `Bonjour,`,
      `Le flux « ${p.feed} » (${p.url}) ne répond plus depuis le ${p.since} : son site l'a peut-être déplacé ou fermé. Vous ne recevrez pas ses nouveautés tant qu'il restera muet.`,
      `Il est encore vérifié une fois par jour. S'il revient, vos envois reprennent d'eux-mêmes. Sinon, cet abonnement prend fin le ${p.until} et, si c'était le dernier, votre adresse est effacée. Vous n'avez rien à faire.`,
      `Si le site publie désormais son flux à une autre adresse, abonnez-vous à la nouvelle depuis le site.`,
    ],
    mergedSubject: (kind, n, feeds) =>
      `Votre récapitulatif ${kind === 'daily' ? 'du jour' : 'de la semaine'} : ${n === 1 ? '1 nouveauté' : `${n} nouveautés`} de ${feeds} flux`,
    mergedUnsubscribeFeed: 'Se désabonner de ce flux',
    mergedWhy: (feeds, kind) => `Vous recevez ce récapitulatif ${kind === 'daily' ? 'quotidien' : 'hebdomadaire'} parce que cette adresse est abonnée à ces ${feeds} flux.`,
    mergedStop: (kind) => `Arrêter ce récapitulatif ${kind === 'daily' ? 'quotidien' : 'hebdomadaire'}`,
    confirmSubject: (host) => `Confirmez votre abonnement aux nouveautés de ${host}`,
    confirmBody: (p) => `Bonjour,

Quelqu'un — vous, sans doute — a demandé à recevoir par courriel les nouveautés de :

  ${p.feed}
  ${p.url}

Rythme choisi : ${p.cadence}.

Pour confirmer, ouvrez ce lien puis cliquez sur « Confirmer » :

  ${p.link}

Si vous n'avez rien demandé, ne faites rien : aucun autre courriel ne vous sera envoyé,
et votre adresse sera effacée dans ${p.days} jours.

--
${p.service} — ${p.baseUrl}
Contact : ${p.contact}`,
    alreadySubject: (host) => `Vous êtes déjà abonné aux nouveautés de ${host}`,
    alreadyBody: (p) => `Bonjour,

Une nouvelle demande d'abonnement aux nouveautés de « ${p.feed} » a été faite
pour cette adresse, qui y est déjà abonnée. Rien n'a changé.

Pour changer de rythme ou vous désabonner : ${p.manage}

--
${p.service} — ${p.baseUrl}`,
    publisherSubject: (service) => `Votre espace éditeur — ${service}`,
    publisherBody: (p) => `Bonjour,

Voici le lien vers votre espace éditeur sur ${p.service}. Il est valable 24 heures :

  ${p.link}

Si vous n'avez rien demandé, ignorez ce courriel : rien n'a été créé.

-- 
${p.service} — ${p.baseUrl}`,
    manageSubject: (service) => `Votre lien d'accès — ${service}`,
    manageBody: (p) => `Bonjour,

Voici le lien vers votre espace abonné. Il est valable 24 heures :

  ${p.link}

Vous y verrez vos abonnements, pourrez changer leur rythme ou tout arrêter.
Si vous n'avez rien demandé, ignorez ce courriel.

--
${p.service} — ${p.baseUrl}`,
  },
};
