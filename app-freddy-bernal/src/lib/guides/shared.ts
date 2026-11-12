// «Para todos» (R3, design §7.3): what every role of the team shares — signing in, the top bar, the phone, no signal,
// the date rule, Mensajes, 360 and Ayuda. Plain Venezuelan Spanish, «tú». «» only for what the screen says.
// Administración is named only where the team needs to know it (D-43): who reads what you ask 360 (ADMIN_SEES_360),
// who recovers a piece the boss deleted, and its word in «Palabras de la app» (ADMIN_MENTIONS). Mensajes has no notice
// (R5, D-79): the guides explain the channels, and that each channel shows who is in it.
import { CHAT_HIDDEN, CHAT_PHONE_TEXT } from '../domain/chat';
import { GLOSSARY_ADMIN, glossaryLine } from './glossary';
import type { SharedTopic } from './types';

// Who reads what you ask 360 (WP-E, S8): the guides' line; the panel under 360's box says it short (panelNote).
export const ADMIN_SEES_360 = 'Administración (las personas que manejan la parte técnica de la app) puede leer lo que le preguntas a 360: no pegues ahí mensajes del equipo.';

// The sentences of Mensajes every guide repeats (design §7.2): one source, so the test can check each guide has them.
export const MSG_ENTER = 'En el teléfono, la tecla Enter hace un salto de línea: el mensaje sale cuando tocas el botón de enviar (el avioncito de papel).';
export const MSG_PHONES = CHAT_PHONE_TEXT;
export const MSG_AGENDA =
  'Quien conoce la agenda (el jefe, el despacho, el IVT y Grabación) no escribe fechas, horas ni mapas donde está Redes o política: la app no lo deja.';
export const MSG_RELATIVE =
  'Si escribes una palabra como “mañana” o “el lunes” donde está Redes o política, la app te pregunta antes de enviar, con «Enviar igual» o «Corregir».';
export const MSG_FREE =
  'Redes y política no conocen la agenda, así que escriben libre. Si ves un mensaje oculto, es que tenía una fecha o una hora de la agenda y no es para ti.';
export const MSG_CHANNELS = 'Mensajes son canales: el jefe los arma, decide quién va en cada uno y está en todos. Cada canal muestra arriba quiénes están.';
export const MSG_TEAM = 'En «Todo el equipo» están todos los del equipo, siempre.';
export const MSG_LINKS =
  'Para hablar de un evento, una pieza o una ficha, copia el enlace de esa pantalla y pégalo en el mensaje: sale como una tarjetita con su título. Cada persona ve solo lo que su rol le deja ver.';
export const MSG_PUSH =
  'Cuando te escriben, te llega al teléfono «Mensaje nuevo» y de quién es, nunca el texto. Para que no te llegue: Mi cuenta → «Mi perfil y avisos» → «Qué avisos quiero», y desmarcas «Mensajes nuevos del equipo».';

// «Lo de arriba»: the line of Mensajes (the bubbles of the top bar). Administración has no Mensajes: sharedFor() and
// 360's index put NO_MESSAGES_LINE in its place, found by this constant (not by its words).
export const TOP_MESSAGES_LINE = 'Los globitos: tus canales de Mensajes, con el número de canales que tienen algo nuevo.';

export const SHARED: SharedTopic[] = [
  {
    id: 'entrar',
    title: 'Entrar',
    body: [
      'Te llega una invitación al correo. En «Entrar» escribes tu «Correo» y tocas «Mandarme el código».',
      'Te llega un código al correo: lo escribes en «Código del correo» y tocas «Entrar». No hay contraseñas.',
      'El jefe, el despacho, política y el IVT además usan el doble factor: una segunda clave de 6 números que da una aplicación de códigos del teléfono, como Google Authenticator o Microsoft Authenticator. La primera vez sale «Protege tu cuenta (una sola vez)»: instalas la aplicación, tocas «Mostrar el código QR», lo escaneas con ella, escribes los 6 números que te da y tocas «Confirmar».',
      'Desde ahí, cada vez que entras te pide el «Código de tu aplicación»: escribes los 6 números que te da la aplicación y tocas «Confirmar». Si cambias de teléfono, pídele ayuda a quien te invitó.',
    ],
  },
  {
    id: 'arriba',
    title: 'Lo de arriba de la pantalla',
    body: [
      '«Crear»: solo lo que tu rol puede crear. Grabación no tiene este botón.',
      TOP_MESSAGES_LINE,
      'La campana: tus avisos, con el número de los que no has leído.',
      'La lupa (o «Buscar evento o pieza» en la computadora): buscas un evento o una pieza por su nombre o su lugar.',
      'El muñequito, a la derecha, es Mi cuenta: «Mi perfil y avisos», «Ayuda y guías», «Ver el tutorial de esta pantalla», el «Modo sol» (más contraste y letra más grande para leer en la calle) y «Salir». Al salir se borran del teléfono los borradores.',
    ],
  },
  {
    id: 'telefono',
    title: 'En el teléfono',
    body: [
      'Abajo está la barra con tus pantallas. Si no caben todas, la última dice «Más» y adentro está el resto.',
      'Si abres una pantalla que no es de tu rol, la app te lleva a tu inicio y te dice «Esa pantalla no es de tu rol. Te trajimos a tu inicio.»',
      'Los consejos de una línea salen las primeras veces; los cierras con «Entendido».',
    ],
  },
  {
    id: 'sin-senal',
    title: 'Sin señal o sin luz',
    body: [
      'Arriba sale «Sin señal. Lo que escribas se guarda en el teléfono y se envía cuando vuelva.»',
      'Lo que escribes en fichas, eventos, storyboard y notas queda en el teléfono hasta que tocas «Guardar» con señal.',
      'Si se va la señal mientras subes fotos o videos, la subida sigue sola cuando vuelve.',
      'La guía y los tutoriales solo se ven con señal.',
    ],
  },
  {
    id: 'fecha',
    title: 'La regla de la fecha',
    body: [
      'La fecha, la hora y la dirección de la agenda del jefe son información de seguridad.',
      'Las ven el jefe, el despacho, quien graba ese evento y el IVT en sus visitas de obra. Redes y política nunca las ven: Redes ve los eventos en una lista sin fecha y política solo ve «Ya tiene fecha».',
      'No escribas la fecha ni la hora en títulos, notas, motivos, comentarios ni mensajes: los lee gente que no debe saberlas. Escribe “lo antes posible”, “cuando esté listo” o “el día del evento”.',
      'Los teléfonos de otras personas van solo en los contactos de la ficha. Para verlos hay que entrar con el doble factor.',
    ],
  },
  {
    id: 'mensajes',
    title: 'Mensajes',
    body: [
      'Entras por los globitos de arriba, junto a la campana. El número dice cuántos canales tienen algo nuevo.',
      MSG_CHANNELS,
      MSG_TEAM,
      'Ves solo los canales donde estás. Toca el número de personas arriba de un canal (por ejemplo, «5 personas») para ver la lista de quiénes están.',
      'Un mensaje no se edita ni se cambia después de enviarlo: revísalo antes de tocar el botón de enviar.',
      MSG_ENTER,
      MSG_PHONES,
      MSG_AGENDA,
      MSG_RELATIVE,
      MSG_FREE,
      MSG_LINKS,
      MSG_PUSH,
      'Con «Silenciar» un canal deja de sonar en tu teléfono; lo sigues leyendo igual.',
    ],
  },
  {
    id: '360',
    title: '360, el asistente',
    body: [
      'Es el botón redondo de abajo a la derecha. Pregúntale lo que sea de la app: “¿qué tengo pendiente?”, “¿dónde apruebo?”, “muéstrame cómo se usa esta pantalla”.',
      'A veces te ofrece en una línea «¿Te muestro esta pantalla?». Si tocas «Sí, muéstrame», te muestra un tutorial. Si la cierras con la X dos veces, ya no te la ofrece en ese teléfono. Nunca se abre solo.',
      '360 no lee los mensajes del equipo y no le dice a nadie la fecha de la agenda.',
      ADMIN_SEES_360,
    ],
  },
  {
    id: 'ayuda',
    title: 'Ayuda y tutoriales',
    body: [
      'En Mi cuenta → «Ayuda y guías» están «Mi trabajo, paso a paso», «Qué se hace en cada pantalla», «Cómo va el trabajo entre todos» y los «Tutoriales de mis pantallas».',
      'En Mi cuenta → «Ver el tutorial de esta pantalla» te muestra, paso a paso, la pantalla en la que estás (si tiene tutorial). En tu inicio hay dos, y cada uno dice su nombre: «Ver el tutorial: Bienvenida» y el de esa pantalla.',
      'En un tutorial: «Siguiente» y «Atrás» para moverte, «Terminar» al final, y la X para salir cuando quieras. Mientras ves el tutorial no puedes tocar la pantalla: lo que te señala, lo tocas al cerrarlo.',
    ],
  },
];

// How to read the guides (the team guide's notice, the part that fits the app): under the header of «Ayuda y guías» and
// of each role's guide. The counted labels carry an example number («Aprobar todas las verdes (2)»).
export const HOW_TO_READ = 'Lo que va entre comillas, «así», es el texto exacto de la pantalla. Los números entre paréntesis cambian según el día.';

// Administración has no Mensajes (D-49): its «Para todos» drops the topic and says so where the bubbles are named.
export const NO_MESSAGES_LINE = 'Mensajes es del equipo: administración no lo ve, y por eso no tiene los globitos.';

/** «Para todos» for this session: with Mensajes for a team member, without it (and without the bubbles) for an
 * account with Administración or without a team role (the same test as the bubbles, chat-header-link.tsx). */
export function sharedFor(o: { messages: boolean }): SharedTopic[] {
  if (o.messages) return SHARED;
  return SHARED.filter((t) => t.id !== 'mensajes').map((t) =>
    t.id === 'arriba' ? { ...t, body: t.body.map((line) => (line === TOP_MESSAGES_LINE ? NO_MESSAGES_LINE : line)) } : t,
  );
}

// Who recovers a piece the boss deleted (Ajustes → «Cupo y pilares» → «Piezas eliminadas»): said in the boss's and Redes'
// guides, one piece or several.
export const ADMIN_RECOVERS = 'administración la puede recuperar';
export const ADMIN_RECOVERS_MANY = 'administración las puede recuperar';

// The texts that may name Administración in a team guide (D-43, 12/11): 360's line, who recovers what the boss deleted,
// and its word in «Palabras de la app» (as 360 says it: «Administración: …»). Mensajes has no notice (D-79).
export const ADMIN_MENTIONS: string[] = [ADMIN_SEES_360, ADMIN_RECOVERS, ADMIN_RECOVERS_MANY, glossaryLine(GLOSSARY_ADMIN)];
// What a hidden message says (the guides explain it; the screen draws it).
export const HIDDEN_MESSAGE = CHAT_HIDDEN;
