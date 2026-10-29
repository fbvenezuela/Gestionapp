// «Para todos» (R3, design §7.3): what every role of the team shares — signing in, the top bar, the phone, no signal,
// the date rule, Mensajes, 360 and Ayuda. Plain Venezuelan Spanish, «tú». «» only for what the screen says.
// Administración is named only in Mensajes' notice and in 360's line (D-43): CHAT_NOTICE and ADMIN_SEES_360.
import { CHAT_ACK_TEXT, CHAT_HIDDEN, CHAT_NOTICE, CHAT_NOTICE_LINE, CHAT_PHONE_TEXT } from '../domain/chat';
import type { SharedTopic } from './types';

// What 360's panel says under the box (WP-E, S8): who reads what you ask it.
export const ADMIN_SEES_360 = 'Administración ve lo que le preguntas a 360: no pegues ahí mensajes del equipo.';

// The sentences of Mensajes every guide repeats (design §7.2): one source, so the test can check each guide has them.
export const MSG_ENTER = 'En el teléfono, la tecla Enter hace un salto de línea: el mensaje sale cuando tocas el botón de enviar (el avioncito de papel).';
export const MSG_PHONES = CHAT_PHONE_TEXT;
export const MSG_AGENDA =
  'Quien conoce la agenda (el jefe, el despacho, el IVT y Grabación) no escribe fechas, horas ni mapas donde está Redes o política: la plataforma no lo deja.';
export const MSG_RELATIVE =
  'Si escribes una palabra como “mañana” o “el lunes” donde está Redes o política, la plataforma te pregunta antes de enviar, con «Enviar igual» o «Corregir».';
export const MSG_FREE =
  'Redes y política no conocen la agenda, así que escriben libre. Si ves un mensaje oculto, es que tenía una fecha o una hora de la agenda y no es para ti.';
export const MSG_RULES =
  '«Quién habla con quién» lo decide el jefe y vale para las conversaciones de Mensajes. No cambia «Todo el equipo» ni las notas de trabajo (la nota de Grabación para el editor, los comentarios de una pieza).';
export const MSG_TO_BOSS = 'A todos se les permite escribirle al jefe, y el jefe le escribe a todos.';
export const MSG_LINKS =
  'Para hablar de un evento, una pieza o una ficha, pega su dirección de la plataforma: sale como una tarjetita con su título, y cada quien la abre con sus permisos.';
export const MSG_PUSH =
  'Cuando te escriben, te llega al teléfono “Mensaje nuevo” y de quién es, nunca el texto. Se apaga en «Qué avisos quiero» con «Mensajes nuevos del equipo».';

export const SHARED: SharedTopic[] = [
  {
    id: 'entrar',
    title: 'Entrar',
    body: [
      'Te llega una invitación al correo. En «Entrar» escribes tu «Correo» y tocas «Mandarme el código».',
      'Te llega un código al correo: lo escribes en «Código del correo» y tocas «Entrar». No hay contraseñas.',
      'El jefe, el despacho, política y el IVT además usan el doble factor. La primera vez sale «Protege tu cuenta (una sola vez)»: instalas una aplicación de códigos, tocas «Mostrar el código QR», lo escaneas y escribes el código.',
      'Desde ahí, cada vez que entras te pide el «Código de tu aplicación». Si cambias de teléfono, pídele ayuda a quien te invitó.',
    ],
  },
  {
    id: 'arriba',
    title: 'Lo de arriba de la pantalla',
    body: [
      '«Crear»: solo lo que tu rol puede crear. Grabación no tiene este botón.',
      'El sobre: tus mensajes con el equipo, con el número de conversaciones que tienen algo nuevo.',
      'La campana: tus avisos, con el número de los que no has leído.',
      'La lupa (o «Buscar evento o pieza» en la computadora): buscas un evento o una pieza por su nombre o su lugar.',
      '«Mi cuenta»: «Mi perfil y avisos», «Ayuda y guías», «Ver el tutorial de esta pantalla», el «Modo sol» (más contraste y letra más grande para leer en la calle) y «Salir». Al salir se borran del teléfono los borradores.',
    ],
  },
  {
    id: 'telefono',
    title: 'En el teléfono',
    body: [
      'Abajo está la barra con tus pantallas. Si no caben todas, la última dice «Más» y adentro está el resto.',
      'Si abres una pantalla que no es de tu rol, la plataforma te lleva a tu inicio y te dice «Esa pantalla no es de tu rol. Te trajimos a tu inicio.»',
      'Los consejos de una línea salen las primeras veces; los cierras con «Entendido».',
    ],
  },
  {
    id: 'sin-senal',
    title: 'Sin señal o sin luz',
    body: [
      'Arriba sale «Sin señal. Lo que escribas se guarda en el teléfono y se envía cuando vuelva.»',
      'Lo que escribes en fichas, eventos, storyboard y notas queda en el teléfono hasta que tocas «Guardar» con señal.',
      'Las fotos y los videos se suben por partes: si se va la señal, siguen solos cuando vuelve.',
      'La guía y los tutoriales necesitan señal: la plataforma no guarda páginas en el teléfono, por privacidad.',
    ],
  },
  {
    id: 'fecha',
    title: 'La regla de la fecha',
    body: [
      'La fecha, la hora y la dirección de la agenda del jefe son información de seguridad.',
      'Las ven el jefe, el despacho, quien graba ese evento y el IVT en sus visitas de obra. Redes y política nunca las ven: Redes ve los eventos en una lista sin fecha y política solo ve “ya tiene fecha”.',
      'No escribas la fecha ni la hora en títulos, notas, motivos, comentarios ni mensajes: los lee gente que no debe saberlas. Escribe “lo antes posible”, “cuando esté listo” o “el día del evento”.',
      'Los teléfonos de terceros van solo en los contactos de la ficha, que se ven con el doble factor.',
    ],
  },
  {
    id: 'mensajes',
    title: 'Mensajes',
    body: [
      CHAT_NOTICE,
      'Entras por el sobre de arriba. La primera vez sale un aviso que aceptas con «Entendido»: sin aceptarlo no puedes escribir.',
      'Le escribes a una persona o armas un grupo (de 3 a 12 personas) con «Escribirle a alguien». En «Todo el equipo» escriben todos y lo lee todo el equipo.',
      'En cada conversación dice: ' + CHAT_NOTICE_LINE,
      'Un mensaje no se edita ni se borra. Por eso, antes de escribir, piensa si puede leerlo el jefe.',
      MSG_ENTER,
      MSG_PHONES,
      MSG_AGENDA,
      MSG_RELATIVE,
      MSG_FREE,
      MSG_TO_BOSS,
      MSG_RULES,
      MSG_LINKS,
      MSG_PUSH,
      'Con «Silenciar» una conversación deja de sonar en tu teléfono; la sigues leyendo igual.',
    ],
  },
  {
    id: '360',
    title: '360, el asistente',
    body: [
      'Es el botón redondo de abajo a la derecha. Pregúntale lo que sea de la plataforma: “¿qué tengo pendiente?”, “¿dónde apruebo?”, “muéstrame cómo se usa esta pantalla”.',
      'A veces te ofrece en una línea “¿Te muestro esta pantalla?”. Si dices que sí, te muestra un tutorial; si la cierras dos veces, deja de ofrecer. Nunca se abre solo.',
      '360 no lee los mensajes del equipo y no le dice a nadie la fecha de la agenda.',
      ADMIN_SEES_360,
    ],
  },
  {
    id: 'ayuda',
    title: 'Ayuda y tutoriales',
    body: [
      'En «Mi cuenta» → «Ayuda y guías» está la guía de tu trabajo, lo que se hace en cada pantalla, cómo va el trabajo entre todos y los tutoriales de tus pantallas.',
      'En «Mi cuenta» → «Ver el tutorial de esta pantalla» te muestra, paso a paso, la pantalla en la que estás (si tiene tutorial).',
      'En un tutorial: «Siguiente» y «Atrás» para moverte, «Terminar» al final, y la X «Salir del tutorial» cuando quieras. Mientras corre, la pantalla no cambia: lo que te señala lo tocas cuando lo cierres.',
    ],
  },
];

// Administración has no Mensajes (D-49): its «Para todos» drops the topic and says so where the envelope is named.
export const NO_MESSAGES_LINE = 'Mensajes es del equipo: administración no lo ve, y por eso no tiene el sobre.';

/** «Para todos» for this session: with Mensajes for a team member, without it (and without the envelope) for an
 * account with Administración or without a team role (the same test as the envelope, chat-header-link.tsx). */
export function sharedFor(o: { messages: boolean }): SharedTopic[] {
  if (o.messages) return SHARED;
  return SHARED.filter((t) => t.id !== 'mensajes').map((t) =>
    t.id === 'arriba' ? { ...t, body: t.body.map((line) => (line.startsWith('El sobre:') ? NO_MESSAGES_LINE : line)) } : t,
  );
}

// The texts that may name Administración in a team guide (D-43): Mensajes' notices and 360's line.
export const ADMIN_MENTIONS: string[] = [CHAT_NOTICE, CHAT_NOTICE_LINE, CHAT_ACK_TEXT, ADMIN_SEES_360];
// What a hidden message says (the guides explain it; the screen draws it).
export const HIDDEN_MESSAGE = CHAT_HIDDEN;
