// Mensajes en español (internacional neutro, tratamiento de usted).

import type { FeedErrorCode, Messages } from './en.ts';

const feedErrors: Record<FeedErrorCode, string> = {
  'invalid-url': 'esta dirección no es válida.',
  'bad-scheme': 'solo se aceptan direcciones http y https.',
  credentials: 'no se aceptan direcciones que contengan un nombre de usuario o una contraseña.',
  'private-address': 'esta dirección apunta a una red privada.',
  'too-many-redirects': 'el servidor redirige demasiadas veces.',
  'no-location': 'el servidor envió una redirección incompleta.',
  'http-status': 'el servidor respondió con un error.',
  'too-large': 'la fuente es demasiado grande (más de 5 MB).',
  interrupted: 'la transferencia se interrumpió.',
  timeout: 'el servidor tardó demasiado en responder.',
  connect: 'no se pudo contactar con el servidor.',
  entities: 'el documento declara entidades XML, que se rechazan por seguridad.',
  malformed: 'el documento no es XML bien formado.',
  'not-a-feed': 'este documento no es una fuente Atom ni RSS.',
  unexpected: 'el servidor dio una respuesta inesperada.',
  'no-feed-found': 'esta página no anuncia ninguna fuente Atom o RSS.',
  'several-feeds': 'esta página anuncia varias fuentes.',
  blocked: 'no está disponible en este servicio.',
};

const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);
const days = (n: number) => plural(n, 'día', 'días');
const updates = (n: number) => plural(n, 'novedad', 'novedades');
const feedsCount = (n: number) => plural(n, 'fuente', 'fuentes');
const kindAdj = (kind: 'daily' | 'weekly') => (kind === 'daily' ? 'diario' : 'semanal');

export const es: Messages = {
  langName: 'Español',
  label: (label) => `${label}:`,

  nav: { privacy: 'Sus datos', account: 'Mis suscripciones', publishers: 'Editores', robot: 'El robot', legal: 'Aviso legal', terms: 'Condiciones de uso', source: 'Código fuente' },
  languageSwitch: 'Idioma',

  cadence: {
    immediate: 'un correo por cada novedad',
    daily: 'un resumen diario',
    weekly: 'un resumen semanal',
  },
  weekdays: ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'],
  onWeekday: (day) => `los ${day}`,
  atHour: (h) => `${h}:00`,

  homeTitle: 'Recibir una fuente por correo electrónico',
  homeHeading: 'Las novedades de un sitio web, en su bandeja de entrada',
  homeIntro: (service) =>
    `Muchos sitios web publican una fuente Atom o RSS: la lista de sus últimas publicaciones. ${service} se las envía por correo electrónico, con la frecuencia que usted prefiera. Sin cuenta, sin contraseña, sin publicidad, sin seguimiento.`,
  feedUrlLabel: 'Dirección de la fuente o del sitio web',
  feedUrlButton: 'Ver esta fuente',
  home: {
    stepsHeading: 'Cómo funciona',
    steps: [
      'Pegue la dirección de una fuente, o simplemente la de un sitio web: sus fuentes se encuentran por usted. Muchos sitios también ofrecen un enlace "Recibir las novedades por correo electrónico".',
      'Escriba su dirección de correo electrónico y elija la frecuencia: un correo por cada novedad, o un resumen diario o semanal, a la hora que prefiera.',
      'Confirme desde el correo que reciba. A partir de entonces, cada correo incluye un enlace para darse de baja con un clic.',
    ],
    promisesHeading: 'Con qué puede contar',
    promises: [
      'Gratuito para los lectores, sin publicidad en los correos.',
      'Sin seguimiento: ni píxeles, ni enlaces reescritos, ni cookies. Los correos se leen igual sin imágenes.',
      'Su dirección solo se usa para estos correos, nunca se comparte y se borra en cuanto cancela su última suscripción.',
      'Varios resúmenes a la misma hora llegan en un solo correo, con una sección por sitio.',
      'Si un sitio deja de publicar su fuente, se le avisa, en lugar de dejarle esperando.',
    ],
    publishersHeading: '¿Publica un sitio web?',
    publishersText: (service) =>
      `Permita que sus lectores le sigan por correo electrónico con un solo enlace junto a su fuente: sin scripts, sin cuentas, sin listas que gestionar. ${service} lee su fuente con moderación, una sola vez sea cual sea el número de suscriptores, y en menos de un minuto si anuncia un hub de WebSub.`,
    publishersCta: 'Obtener el enlace o un botón',
    faqHeading: 'Preguntas',
    faq: [
      { q: '¿Qué es una fuente?', a: 'Una lista de las últimas publicaciones de un sitio web, publicada en una dirección que los programas pueden leer (Atom o RSS). La mayoría de los blogs, los sitios de noticias y muchos organismos públicos tienen una, a menudo señalada con un icono naranja.' },
      { q: 'No encuentro la dirección de la fuente.', a: 'Pegue en su lugar la dirección del sitio web: si el sitio anuncia una fuente, se encuentra por usted.' },
      { q: '¿Necesito una cuenta?', a: 'No. Accede a sus suscripciones mediante un enlace enviado a su dirección, válido durante 24 horas, cada vez que lo solicite.' },
      { q: '¿Cómo me doy de baja?', a: 'Con el enlace al pie de cualquier correo, con un clic, o desde "Mis suscripciones", donde también puede borrar su dirección.' },
    ],
  },

  subscribeTitle: (feed) => `Suscribirse a ${feed}`,
  feedLabel: 'Fuente',
  siteLabel: 'Sitio web',
  latestHeading: 'Últimas publicaciones',
  noEntries: 'Esta fuente aún no tiene publicaciones.',
  untitled: 'Sin título',
  receiveHeading: 'Recibir las próximas por correo electrónico',
  emailLabel: 'Su dirección de correo electrónico',
  cadenceLegend: 'Frecuencia',
  subscribeButton: 'Recibir las novedades',
  subscribeNotice: (n) =>
    `Le enviaremos un correo con un enlace de confirmación. Hasta que haga clic en él, no se le enviará nada más, y su dirección se borrará al cabo de ${days(n)}. Su dirección solo se usa para estos correos:`,
  privacyLink: 'lo que hacemos con ella',
  subscribeTerms: 'Al suscribirse, acepta las',
  termsLink: 'condiciones de uso',

  feedErrorTitle: 'Fuente ilegible',
  feedErrorHeading: 'No se puede leer esta fuente',
  feedError: (code) => `No se puede leer esta fuente: ${feedErrors[code] ?? feedErrors.unexpected}`,
  chooseTitle: 'Elegir una fuente',
  chooseHeading: 'Esta página ofrece varias fuentes',
  chooseText: '¿Cuál desea recibir por correo electrónico?',
  chooseUntitled: 'Fuente sin título',
  feedErrorHelp: (service) =>
    `${service} acepta fuentes Atom y RSS. Compruebe la dirección: suele terminar en .xml, /feed, /rss o /atom.`,
  invalidFeedUrl: 'La dirección de la fuente no es válida.',
  invalidEmail: 'Esta dirección de correo electrónico no parece válida.',
  chooseCadence: 'Elija una frecuencia.',
  tooManyTitle: 'Demasiadas solicitudes',
  tooManyText: 'Vuelva a intentarlo dentro de una hora.',
  errorTitle: 'Error',
  errorText: 'Algo ha fallado. Vuelva a intentarlo en un momento.',
  notFoundTitle: 'Página no encontrada',
  notFoundText: 'Esta página no existe.',
  expiredTitle: 'Enlace caducado',
  confirmExpiredText: 'Este enlace ya no es válido. Vuelva a iniciar la suscripción desde el sitio web que le trajo hasta aquí.',
  invalidUnsubscribeTitle: 'Enlace no válido',
  invalidUnsubscribeText: 'Este enlace para darse de baja no es válido.',
  manageExpiredText: 'Este enlace ya no es válido. Solicite uno nuevo desde "Mis suscripciones".',

  checkMailboxTitle: 'Revise su correo',
  checkMailboxHeading: 'Revise su bandeja de entrada',
  checkMailboxText: 'Si la dirección es válida, le hemos enviado un correo de confirmación. Abra el enlace que contiene para confirmar la suscripción. No olvide mirar en la carpeta de correo no deseado.',
  checkMailboxNote: 'No se le enviará nada hasta que confirme.',

  confirmTitle: 'Confirmar',
  confirmHeading: 'Confirme su suscripción',
  confirmText: (feed, cadence) => `Recibirá las novedades de "${feed}": ${cadence}.`,
  confirmButton: 'Confirmar',
  confirmNote: 'Este botón evita que un programa que abre los enlaces de sus correos (un antivirus, por ejemplo) confirme en su nombre.',
  confirmedTitle: 'Suscripción confirmada',
  confirmedHeading: 'Listo',
  confirmedText: (feed) => `Recibirá las próximas novedades de "${feed}". Cada correo incluye un enlace para darse de baja con un clic.`,
  confirmedManage: 'Para cambiar la frecuencia o darse de baja:',
  confirmedUnsubscribe: 'darse de baja',

  unsubscribeTitle: 'Darse de baja',
  unsubscribeHeading: 'Darse de baja',
  unsubscribeText: (feed) => `¿Dejar de recibir las novedades de "${feed}"?`,
  unsubscribeButton: 'Darme de baja',
  unsubscribedTitle: 'Baja confirmada',
  unsubscribedHeading: 'Se ha dado de baja',
  unsubscribedText: 'No recibirá nada más de esta fuente. Si era su última suscripción, su dirección se ha borrado.',
  unsubscribedNote: '¿Ha sido un error? Basta con volver a suscribirse desde el sitio web de origen.',

  stopDigestTitle: (kind) => (kind === 'daily' ? 'Cancelar el resumen diario' : 'Cancelar el resumen semanal'),
  stopDigestText: (kind, n) =>
    `¿Cancelar el resumen ${kindAdj(kind)}? Reúne ${feedsCount(n)}:`,
  stopDigestButton: 'Cancelar este resumen',
  stopDigestOther: 'Sus demás suscripciones no se ven afectadas. Para darse de baja de una sola fuente, use el enlace que aparece debajo de ella en el correo, o:',
  stoppedDigestText: 'Ya no recibirá este resumen. Si contenía sus últimas suscripciones, su dirección se ha borrado.',

  accountTitle: 'Mis suscripciones',
  accountRequestText: 'Sin contraseña: escriba su dirección y recibirá un enlace, válido durante 24 horas, que abre sus suscripciones.',
  accountRequestButton: 'Enviarme el enlace',
  accountSentTitle: 'Enlace enviado',
  accountSentText: 'Si esta dirección está suscrita a al menos una fuente, se le acaba de enviar un enlace a sus suscripciones.',
  accountAddress: (email) => `Dirección: ${email}`,
  accountNone: 'Ninguna suscripción.',
  accountColFeed: 'Fuente',
  accountColCadence: 'Frecuencia',
  accountColWhen: 'Cuándo',
  accountPending: 'pendiente de confirmación',
  accountAsPublished: 'en cuanto se publica',
  accountChange: 'Cambiar',
  accountStop: 'Dar de baja',
  accountCadenceAria: (feed) => `Frecuencia para ${feed}`,
  accountHourAria: (feed) => `Hora del resumen para ${feed}`,
  accountDayAria: (feed) => `Día del resumen para ${feed}`,
  accountDeleteHeading: 'Darse de baja de todo',
  accountDeleteText: 'Elimina todas sus suscripciones y borra su dirección. Inmediato y definitivo.',
  accountDeleteButton: 'Darme de baja de todo y borrar mi dirección',
  accountErasedTitle: 'Dirección borrada',
  accountErasedText: 'Todas sus suscripciones se han cancelado y su dirección se ha borrado.',

  publishersTitle: 'Editores',
  publishersHeading: 'Ofrezca sus novedades por correo electrónico',
  publishersIntro: (service) =>
    `No todos sus lectores usan un lector de fuentes, pero todos tienen una bandeja de entrada. Añada un enlace a ${service} junto a su fuente: sin scripts, sin cuentas, nada que instalar. Ninguna dirección pasa por su sitio web.`,
  publishersFeedLabel: 'Dirección de su fuente',
  publishersButton: 'Preparar el enlace',
  publishersLinkHeading: 'Un enlace',
  publishersButtonHeading: 'O un botón',
  publishersLinkText: 'Recibir las novedades por correo electrónico',
  publishersTry: 'Pruébelo:',
  publishersReadersLabel: 'Idioma de sus lectores',
  publishersReadersAuto: 'lo decide su navegador',
  publishersColorLabel: 'Color del botón',
  publishersPreview: 'Vista previa:',
  publishersCopy: 'Copie este código en su página. No contiene ningún script ni carga nada: sus lectores no son rastreados, ni por usted ni por nosotros.',
  publishersButtonCode: 'Código del botón',
  publishersTipsHeading: 'Lo que su fuente gana si contiene',
  publishersTips: (service, minutes) => [
    'un identificador estable por entrada (<id> en Atom, <guid> en RSS): evita los correos duplicados;',
    'un enlace por entrada, a la página que trata de ella;',
    'un resumen en texto sin formato: es lo que se leerá en el correo;',
    `cabeceras ETag o Last-Modified respetadas: ${service} lee su fuente aproximadamente cada ${minutes === 1 ? 'minuto' : `${minutes} minutos`}, una sola vez sea cual sea el número de suscriptores.`,
  ],

  cadenceShort: { immediate: 'Por novedad', daily: 'Diario', weekly: 'Semanal' },
  planNames: { free: 'Gratuito', pro: 'Pro', business: 'Business' },
  publisherSignInHeading: 'Espacio de editor',
  publisherSignInText: 'Verifique su dominio para mostrar su nombre y un texto de bienvenida en la página de suscripción de sus fuentes, y para ver cuántas personas las siguen. Sin contraseña: le enviamos un enlace por correo electrónico.',
  publisherSignInButton: 'Enviarme un enlace de acceso',
  publisherTermsLabel: 'He leído y acepto las condiciones de uso, incluida la parte dedicada a los editores',
  publisherTermsRequired: 'Acepte las condiciones de uso para abrir un espacio de editor.',
  publisherSentText: 'Se acaba de enviar a esta dirección un enlace de acceso, válido durante 24 horas.',
  publisherTitle: 'Espacio de editor',
  publisherSignedIn: (email, plan) => `Sesión iniciada como ${email} · plan ${plan}`,
  publisherProfileHeading: 'Su perfil',
  publisherNameLabel: 'Nombre que verán los lectores',
  publisherWelcomeLabel: 'Texto de bienvenida',
  publisherProfileHint: 'Se muestra en la página de suscripción de sus fuentes en cuanto se verifique uno de sus dominios.',
  publisherSave: 'Guardar',
  publisherDomainsHeading: 'Sus dominios',
  publisherDomainLabel: 'Dominio (por ejemplo blog.example.org)',
  publisherAddDomain: 'Añadir',
  publisherNoDomain: 'Todavía no hay ningún dominio.',
  publisherVerified: (method, date) => `Verificado mediante ${method === 'dns' ? 'DNS' : 'archivo'} el ${date}`,
  publisherNotVerified: 'Aún no verificado',
  publisherCheck: 'Comprobar ahora',
  publisherRemove: 'Quitar',
  publisherProofIntro: (domain) => `Demuestre que controla ${domain} de una de estas dos formas y luego haga clic en "Comprobar ahora":`,
  publisherProofFile: 'publique un archivo en esta dirección que contenga esta línea:',
  publisherProofDns: 'o añada un registro DNS TXT con el nombre',
  publisherProofDnsValue: 'y el valor:',
  publisherResult: {
    verified: 'El dominio está verificado.',
    failed: 'Todavía no se ha encontrado la prueba. Los cambios de DNS pueden tardar un tiempo en aparecer.',
    invalid: 'Esto no parece un nombre de dominio.',
    limit: 'Ha alcanzado el número máximo de dominios.',
    saved: 'Guardado.',
  },
  publisherFeedsHeading: 'Sus fuentes',
  publisherNoFeeds: 'Todavía nadie sigue ninguna fuente de sus dominios verificados.',
  publisherColFeed: 'Fuente',
  publisherColTotal: 'Total',
  publisherFewer: (n) => `menos de ${n}`,
  publisherCountsNote: (n) => `Solo se cuentan las suscripciones confirmadas. Las cifras inferiores a ${n} no se muestran, para que nadie pueda deducir quién se ha suscrito.`,
  publisherDeleteHeading: 'Eliminar el espacio de editor',
  publisherDeleteText: 'Borra su dirección, su perfil y sus dominios. Sus lectores conservan sus suscripciones.',
  publisherDeleteButton: 'Eliminar mi espacio de editor',
  publisherDeletedTitle: 'Espacio de editor eliminado',
  publisherDeletedText: 'Su dirección, su perfil y sus dominios se han borrado. Sus lectores conservan sus suscripciones.',
  publisherExpiredText: 'Este enlace ya no es válido. Solicite uno nuevo desde la página Editores.',
  publishedBy: (name) => `Publicado por ${name}`,
  verifiedDomain: (domain) => `dominio verificado ${domain}`,

  newsTitle: 'Noticias',
  newsFollow: 'Seguir estas noticias:',
  newsByEmail: 'por correo electrónico',
  newsFeed: 'fuente Atom',
  robotTitle: 'El robot',
  robotHeading: 'El robot que lee sus fuentes',
  robotIntro: (service) =>
    `${service} lee fuentes Atom y RSS para enviar sus novedades por correo electrónico a las personas que las han solicitado. Se identifica con la cabecera:`,
  robotPoints: (min, max) => [
    `Cada fuente se lee una sola vez por ronda, sea cual sea el número de suscriptores, cada ${min} a ${max} minutos.`,
    'Envía If-None-Match e If-Modified-Since, respeta Cache-Control: max-age y Retry-After, y espacia sus visitas cuando el servidor responde mal.',
    'Solo lee las fuentes a las que alguien está suscrito, y olvida las que ya nadie sigue.',
    'Si su fuente anuncia un hub de WebSub (<link rel="hub">), se suscribe a él y lee su fuente en menos de un minuto tras una notificación, y si no, solo cada 6 horas.',
  ],
  robotContact: 'Para preguntas, o para pedirle que se detenga:',

  legalTitle: 'Aviso legal',
  legalSections: (p) => [
    {
      heading: 'Editor',
      items: [
        p.company ? `${p.company}, sociedad por acciones simplificada (SAS)${p.capital ? ` con un capital social de ${p.capital}` : ''}` : '',
        p.address ? `Domicilio social: ${p.address}` : '',
        p.registration ? `Registro: ${p.registration}` : '',
        p.siret ? `SIRET: ${p.siret}` : '',
        p.vat ? `Número de IVA de la UE: ${p.vat}` : '',
        `Contacto: ${p.contact}`,
        p.director ? `Director de la publicación: ${p.director}` : '',
      ].filter(Boolean),
    },
    {
      heading: 'Alojamiento',
      items: [p.hostName, p.hostAddress, p.hostPhone ? `Teléfono: ${p.hostPhone}` : ''].filter(Boolean),
    },
    {
      heading: 'Datos personales',
      paragraphs: ['Qué recoge el servicio, por qué, durante cuánto tiempo, y sus derechos: consulte "Sus datos".'],
    },
    {
      heading: 'Código fuente',
      paragraphs: [`${p.service} es software libre, bajo la licencia GNU Affero General Public License, versión 3 o posterior. Su código fuente está disponible en ${p.sourceUrl}.`],
    },
    {
      heading: 'Legislación aplicable',
      paragraphs: ['Este aviso legal se rige por la legislación francesa. En caso de litigio, y tras un intento de resolución amistosa, los tribunales franceses serán los únicos competentes.'],
    },
  ],

  termsTitle: 'Condiciones de uso',
  termsUpdated: (date) => `Última actualización: ${date}.`,
  termsSections: (p) => [
    {
      heading: 'El servicio',
      paragraphs: [
        `${p.service} envía por correo electrónico las nuevas entradas de fuentes Atom y RSS a las personas que las solicitan. Lo gestiona ${p.operator} (consulte el aviso legal). Recibir las novedades es gratuito.`,
        'Usar el servicio implica aceptar estas condiciones. Si no las acepta, no lo utilice.',
      ],
    },
    {
      heading: 'Suscripción',
      items: [
        'Suscriba únicamente direcciones que sean suyas o que esté autorizado a utilizar. Cada suscripción debe confirmarse desde la propia dirección.',
        'Puede cambiar la frecuencia con la que recibe una fuente, darse de baja de una fuente o borrar su dirección en cualquier momento: desde cualquier correo o desde "Mis suscripciones".',
        'No utilice el servicio para enviar solicitudes de forma masiva, para saturar una dirección ni para eludir sus límites. Las solicitudes que parezcan abusivas pueden rechazarse y su autor puede ser bloqueado.',
      ],
    },
    {
      heading: 'Contenido',
      paragraphs: [
        `Las fuentes pertenecen a sus editores. ${p.service} copia sus títulos, resúmenes y enlaces tal cual, sin verificarlos ni modificarlos, y no es responsable de ellos ni de los sitios web a los que enlazan.`,
        `Para denunciar un contenido ilícito, escriba a ${p.contact}: la fuente puede suspenderse para todos.`,
      ],
    },
    {
      heading: 'Editores',
      paragraphs: ['Estos puntos se aplican a cualquier persona que abra un espacio de editor.'],
      items: [
        'Verifique únicamente dominios que controle o que esté autorizado a representar. El dominio corresponde a quien lo haya verificado en último lugar; una prueba que desaparece se pierde.',
        'El nombre y el texto de bienvenida que muestre a los lectores deben ser exactos y lícitos, y no deben suplantar la identidad de nadie ni hacer publicidad de terceros. De lo contrario, pueden retirarse.',
        'Las cifras de suscriptores se ofrecen a título informativo, tal cual; las cifras inferiores a cinco no se muestran. Usted nunca ve las direcciones de los suscriptores y no debe intentar identificarlos.',
        'Puede eliminar su espacio de editor en cualquier momento. Un espacio que nunca verifica un dominio se elimina al cabo de 30 días.',
        'Si se ofrecen planes de pago, su precio y sus condiciones se indican antes de que contrate uno.',
      ],
    },
    {
      heading: 'Disponibilidad',
      paragraphs: [
        'El servicio se ofrece tal cual. Hace todo lo posible por entregar cada novedad una sola vez y a tiempo, pero no puede garantizarlo: las fuentes pueden no estar disponibles, y los proveedores de correo pueden retrasar o filtrar los correos.',
        'El servicio puede cambiar o dejar de prestarse. Si deja de prestarse, se avisará con antelación por correo electrónico a los suscriptores y editores cuando sea posible.',
      ],
    },
    {
      heading: 'Datos personales',
      paragraphs: ['Qué se recoge, por qué, durante cuánto tiempo, y sus derechos: consulte "Sus datos".'],
    },
    {
      heading: 'Cambios en estas condiciones',
      paragraphs: ['Estas condiciones pueden cambiar. La fecha indicada arriba corresponde a la última versión. Los editores aceptan la versión vigente cada vez que solicitan un enlace de acceso; los cambios importantes se anuncian por correo electrónico.'],
    },
    {
      heading: 'Legislación aplicable',
      paragraphs: [`Estas condiciones se rigen por la legislación del país en el que está establecido ${p.operator} (consulte el aviso legal). Preguntas: ${p.contact}.`],
    },
  ],

  privacyTitle: 'Sus datos',
  privacySections: (p) => [
    { heading: 'Quién es el responsable', paragraphs: [`${p.operator}, con quien puede contactar en ${p.contact}.`] },
    {
      heading: 'Qué se recoge',
      paragraphs: [
        'Su dirección de correo electrónico, y nada más: ni nombre, ni contraseña, ni cookies, ni seguimiento de aperturas o clics.',
        'También conservamos la lista de fuentes que sigue, la frecuencia con la que desea recibirlas, su idioma y las fechas en que se suscribió y confirmó.',
      ],
    },
    {
      heading: 'Para qué',
      paragraphs: [
        'Únicamente para enviarle las novedades de las fuentes que ha solicitado y los correos que el servicio necesita (confirmación, enlace a sus suscripciones).',
        'Base jurídica: su consentimiento, otorgado mediante la doble confirmación, que puede retirar en cualquier momento dándose de baja.',
      ],
    },
    {
      heading: 'Quién la ve',
      paragraphs: [
        `Nadie, salvo el operador y sus encargados del tratamiento (${p.processors}), que actúan únicamente en su nombre.`,
        'Los editores de las fuentes solo ven cuántos suscriptores tienen, nunca sus direcciones. Ninguna dirección se vende, se alquila ni se comparte. No hay publicidad en los correos.',
      ],
    },
    {
      heading: 'Durante cuánto tiempo',
      items: [
        `Sin confirmación, la dirección se borra al cabo de ${days(p.pendingDays)}.`,
        'Cuando se da de baja de su última fuente, se borra inmediatamente.',
        `Si los correos ya no se pueden entregar (la dirección no existe), los envíos se detienen y la dirección se borra al cabo de ${days(p.suspendedDays)}.`,
        'Si marca un correo como spam, la dirección se borra; solo se conserva una huella cifrada para no volver a escribirle nunca.',
      ],
    },
    {
      heading: 'Sus derechos',
      paragraphs: [
        `Puede ver sus suscripciones, cambiar su frecuencia, cancelarlas y borrar su dirección en cualquier momento desde "Mis suscripciones", o escribiendo a ${p.contact} para ejercer cualquier otro derecho (acceso, rectificación, oposición).`,
        'También puede presentar una reclamación ante su autoridad de protección de datos (en Francia, la CNIL: cnil.fr).',
      ],
    },
    {
      heading: 'Registros técnicos',
      paragraphs: ['Para limitar los abusos, el número de solicitudes por dirección IP y por dirección de correo electrónico se cuenta en forma de huellas, que se borran al cabo de dos días.'],
    },
  ],

  mail: {
    via: (feed, service) => `${feed} vía ${service}`,
    read: 'Leer',
    readOn: (host) => `Leer en ${host}`,
    footerWhy: (feed, url) => `Recibe este correo porque esta dirección está suscrita a las novedades de "${feed}" (${url}).`,
    footerWhyShort: (feed) => `Recibe este correo porque esta dirección está suscrita a las novedades de "${feed}".`,
    footerUnsubscribe: 'Darse de baja con un clic',
    footerManage: 'Gestionar sus suscripciones',
    footerNoTracking: (service) => `${service} no rastrea la apertura de sus correos ni los clics en sus enlaces.`,
    digestHeading: { daily: 'Las novedades de hoy', weekly: 'Las novedades de esta semana', burst: (n) => `${updates(n)} a la vez` },
    count: (n) => updates(n),
    mergedSubject: (kind, n, feeds) =>
      `Su resumen ${kindAdj(kind)}: ${updates(n)} de ${feedsCount(feeds)}`,
    mergedUnsubscribeFeed: 'Darse de baja de esta fuente',
    mergedWhy: (feeds, kind) =>
      `Recibe este resumen ${kindAdj(kind)} porque esta dirección está suscrita a ${feeds === 1 ? 'esta fuente' : `estas ${feeds} fuentes`}.`,
    mergedStop: (kind) => `Cancelar este resumen ${kindAdj(kind)}`,
    removedSubject: (feed) => `"${feed}" ya no está disponible`,
    removedBody: (p) => `Hola:

La fuente "${p.feed}" (${p.url}) se ha retirado de ${p.service}.
Su suscripción a ella ha finalizado. Si era su única suscripción, su dirección se ha
borrado. No tiene que hacer nada.

Preguntas: ${p.contact}

--
${p.service}`,
    deadSubject: (feed) => `"${feed}" ya no responde`,
    deadBody: (p) => [
      `Hola:`,
      `La fuente "${p.feed}" (${p.url}) no responde desde el ${p.since}: es posible que su sitio web la haya trasladado o cerrado. No recibirá sus novedades mientras siga sin responder.`,
      `Se sigue comprobando una vez al día. Si vuelve a funcionar, sus envíos se reanudarán automáticamente. De lo contrario, esta suscripción finalizará el ${p.until} y, si es la última, su dirección se borrará. No tiene que hacer nada.`,
      `Si el sitio web publica ahora su fuente en otra dirección, suscríbase a la nueva desde el sitio web.`,
    ],
    confirmSubject: (host) => `Confirme su suscripción a las novedades de ${host}`,
    confirmBody: (p) => `Hola:

Alguien (probablemente usted) ha solicitado recibir por correo electrónico las novedades de:

  ${p.feed}
  ${p.url}

Frecuencia: ${p.cadence}.

Para confirmar, abra este enlace y haga clic en "Confirmar":

  ${p.link}

Si no ha solicitado nada, no haga nada: no se le enviará ningún otro correo
y su dirección se borrará dentro de ${days(p.days)}.

--
${p.service} — ${p.baseUrl}
Contacto: ${p.contact}`,
    alreadySubject: (host) => `Ya tiene una suscripción a las novedades de ${host}`,
    alreadyBody: (p) => `Hola:

Se ha realizado una nueva solicitud de suscripción a las novedades de "${p.feed}"
para esta dirección, que ya está suscrita. No ha cambiado nada.

Para cambiar la frecuencia o darse de baja: ${p.manage}

--
${p.service} — ${p.baseUrl}`,
    publisherSubject: (service) => `Su espacio de editor — ${service}`,
    publisherBody: (p) => `Hola:

Este es el enlace a su espacio de editor en ${p.service}. Es válido durante 24 horas:

  ${p.link}

Si no ha solicitado nada, ignore este correo: no se ha creado nada.

-- 
${p.service} — ${p.baseUrl}`,
    manageSubject: (service) => `Su enlace de acceso — ${service}`,
    manageBody: (p) => `Hola:

Este es el enlace a sus suscripciones. Es válido durante 24 horas:

  ${p.link}

Allí puede ver sus suscripciones, cambiar su frecuencia o darse de baja de todo.
Si no ha solicitado nada, ignore este correo.

--
${p.service} — ${p.baseUrl}`,
  },
};
