// 360 and the team's messages (R3 D-50, R5 D-82; design §8.2 M1–M3, §8.7): 360 never reads them, never sends them and never
// keeps what was asked about them. Pure: no I/O, and nothing here knows how Mensajes is stored.
//  - «¿qué me escribió Daniela?», «léeme los mensajes», «resúmeme la conversación» (read) and «dile a Kevin que ya
//    subí la pieza», «mándale un mensaje a Redes» (tell): answered with the button to Mensajes, stored as
//    MESSAGES_MARK (never the text), out of «Lo que preguntan», never sent to a provider, never escalated;
//  - «¿cómo le escribo a Redes?», «¿cómo armo un canal?» (how): a how-to, answered with the guide card.
// A notice to a whole role («avísale a Redes que…», «mándale un aviso a todos») is not a message: it stays the notice
// the boss or administración prepare (preparar_aviso). «Dile a administración que no puedo entrar» is support.
import { plain } from './text';

/** What is stored instead of a question about the team's messages (index.ts). */
export const MESSAGES_MARK = '[pregunta sobre Mensajes]';

export const MESSAGES_READ_TEXT = 'No leo los mensajes del equipo: son de cada canal, para los que están en él. Te dejo el botón para abrir Mensajes.';
export const MESSAGES_TELL_TEXT = 'Eso se lo escribes tú en Mensajes, en un canal donde esté esa persona: yo no leo ni mando mensajes.';
// An account with Administración is out of Mensajes (D-82).
export const MESSAGES_ADMIN_TEXT = 'Mensajes es solo para el equipo: una cuenta con administración no entra, y yo no leo ni mando mensajes.';

const NOUN = String.raw`(?:mensajes?|mensajitos?|msjs?|chats?|conversacion(?:es)?|canal|canales)`;
// Asked to 360: «lee», «léeme», «resúmeme», «revisa», «¿puedes leer…?».
const READ_VERB = String.raw`(?:lee|leeme|leelo|leelos|leela|leelas|lees|leas|leer|leerme|revisa|revisame|revisalo|resume|resumeme|resumes|resumir|resumirme|resumen|chequea|chequeame)`;
const FILLER = String.raw`(?:el|la|los|las|lo|mis|tus|sus|ese|esa|este|esta|esos|esas|estos|estas|un|una|ultimo|ultimos|ultima|ultimas|nuevo|nuevos|nueva|nuevas|de|del|que|me|todo|todos|todas)`;
// «Resúmeme lo que hablaron en el canal de Obras»: what was said in a channel, a few words later.
const READ = new RegExp(String.raw`\b${READ_VERB}(?: ${FILLER})* ${NOUN}\b|\b${READ_VERB} (?:lo que|que) (?:\w+ ){0,3}(?:hablaron|dijeron|escribieron|pusieron|mandaron|conversaron|hablamos|dijimos) (?:\w+ ){0,2}${NOUN}\b`);
// «¿Quién lee los mensajes?», «¿el jefe lee los mensajes?», «¿cómo leo…?», «¿dónde leo…?»: how Mensajes works
// (the guide card), not a request to 360.
const NOT_TO_ME = new RegExp(String.raw`\b(?:como|donde|en que (?:parte|pantalla)|puedo|podemos|se puede|se pueden|quien|quienes|jefe|administracion|admin|redes|despacho|politica|ivt|grabacion|alguien|nadie|otros)\b(?: (?:no|si|tambien|ya))?(?: (?:puede|pueden|puedo|podemos|va a|van a|deberia|tiene que|tienen que))? (?:me )?${READ_VERB}\b`);
// What someone wrote or meant: these verbs are only ever about messages.
const WROTE = /\bque (?:me |nos |te |le |les )?(?:escribio|escribieron|respondio|respondieron|contesto|contestaron|quiso decir|quisieron decir|quiere decir con)\b/;
// What it says, said or put, with a word of Mensajes («¿qué dice el mensaje de Kevin?», «¿qué puso Rubén en el grupo?»).
const SAID = new RegExp(String.raw`\bque (?:me |nos |te |le |les )?(?:dice|dicen|decia|dijo|dijeron|puso|pusieron|mando|mandaron|hablaron|escribieron)\b.*\b(?:${NOUN}|grupo|todo el equipo)\b`);
// A label of the screen, not what someone wrote.
const LABEL = /\bmensajes? (?:oculto|nuevos?)\b/;
// How Mensajes shows up somewhere else (administración's «Registro de cambios», the «Conversaciones» of 360, what someone
// asked 360), asked as a rule («¿sale…?», «¿yo lo veo?», «¿por qué no sale el texto?»): about the platform, not a request
// to read (D-89). «Léeme…», «resúmeme…», «¿qué dijo Kevin en el canal?» still are.
const ELSEWHERE = /\b(?:registro|conversaciones|lo que preguntan)\b|\ble (?:pregunt\w*|dijo|dijeron|escribio|escribieron) a (?:360|asistente|el asistente)\b/;
const AS_RULE = /\b(?:sale|salen|salio|muestra|muestran|aparece|aparecen|se ve|se ven|veo|lo veo|ves|se guarda|se guardan|queda|quedan|por que|puedo ver|puedo leer|se puede ver)\b/;
// What is being said or was said, whether someone answered, who wrote last, going into Mensajes for it, copying a message
// out (red team, 05/11): «¿de qué están hablando en Obras y comunidad?», «¿qué se habló en Mensajes esta semana?»,
// «¿Daniela ya me contestó lo del dron?», «¿quién escribió de último en Grabación y Redes?», «entra a Mensajes y dime si…»,
// «copia aquí el mensaje de bienvenida», «¿qué puso Kevin sobre las tomas?», «dime qué dijo Elio de la asamblea».
const TALKING = /\bde que (?:estan|estaban|estuvieron|esta|hablan|hablaron|habla|hablamos) (?:hablando )?(?:en|por|con)\b|\bque se (?:hablo|dijo|hablaron|dijeron|escribio|escribieron|comento|comentaron|puso) (?:en|por)\b/;
const ANSWERED = /(?<!\b(?:como|donde|si|cuando|para que) )\b(?:ya )?(?:me|nos) (?:contesto|contestaron|respondio|respondieron)\b/;
const LAST = /\b(?:quien|quienes) (?:fue (?:el|la) )?(?:escribio|escribieron|hablo|mando|puso|contesto|respondio)(?: de)? (?:ultimo|ultima|primero)\b|\bquien (?:fue )?(?:el |la )?ultim[oa] en (?:escribir|hablar)\b/;
const GO_READ = /\b(?:entra|metete|revisa|mira|chequea)\b(?: [a-z]+)? (?:a|en) (?:mensajes|el canal|los canales|el chat|el grupo)\b.*\b(?:dime|me dices|si|que)\b/;
const COPY_OUT = /\b(?:copia|copiame|pega|pegame|reenviame|reenvia|transcribe|transcribeme)\b(?: [a-z]+){0,3} (?:mensajes?|chat|conversacion)\b/;
const SAID_ABOUT = /\bque (?:puso|pusieron|dijo|dijeron|escribio|escribieron|mando|mandaron) [a-z]+ (?:sobre|acerca de)\b|\bdime que dijo [a-z]+\b|\b(?:contesto|contestaron|respondio|respondieron|escribio|escribieron|dijo|dijeron|puso|pusieron)\b.*\b(?:en el canal|en los canales|en el chat|en el grupo|en mensajes|por mensajes)\b/;

// Asked to 360 itself: «léeme…», «resúmeme…», «¿puedes leer…?».
const READ_ME = new RegExp(String.raw`^(?:(?:oye|porfa|por favor|360|y) )*(?:lee|leeme|leelo|leelos|leela|leelas|revisa|revisame|resume|resumeme|chequea|chequeame)\b|\b(?:puedes|podrias|me puedes) (?:leer|leerme|resumir|resumirme|revisar)\b`);

// «Dile / mándale (un mensaje) / escríbele / pregúntale a <alguien> que…», not to administración (support).
const TELL_VERB = String.raw`(?:dile|digale|decile|dila|diles|mandale|mandales|enviale|enviales|escribele|escribeles|preguntale|preguntales|comentale|comentales|recuerdale|recuerdales)`;
const TELL = new RegExp(String.raw`\b${TELL_VERB}(?: (?:un|una|el|este|ese) (?:mensaje|mensajito|msj|mje|recado|nota))? (?:a|al|para) (?!(?:la )?(?:administracion|admin|soporte)\b)[a-z]+`);
// «Avísale al jefe que…», «avísale a Kevin que…»: a message to someone (to a whole role it is a notice, step 4).
const TELL_ONE = /\bavisale (?:al jefe|a (?!(?:redes|despacho|politica|ivt|grabacion|todos|todo|administracion|admin|soporte|equipo|la|el|los|las)\b)[a-z]+) que\b/;
const SEND_ONE = new RegExp(String.raw`\b(?:manda|envia|escribe|mandame|enviame|escribeme|deja|dejale)(?:le|les)? (?:un |una )?(?:mensaje|mensajito|msj|mje) (?:a|al|para) (?!(?:la )?(?:administracion|admin|soporte)\b)[a-z]+`);
const BY_MESSAGE = new RegExp(String.raw`\bavisa(?:le|les)?\b.*\bpor (?:${NOUN}|el chat|la red interna)\b`);
// A notice for a whole role (step 4 of the demo brain): not a message.
const NOTICE = /\bavisos?\b/;

// «¿Cómo le escribo a Redes?», «¿cómo mando un mensaje?», «la red interna». Not a channel's management («¿cómo armo /
// edito / archivo un canal?», «Solo el jefe escribe»), nor a message the platform held («Enviar igual» o «Corregir», «no me
// deja mandar el mensaje», «Mensaje oculto»): the answers say those, role by role (D-89).
const HOW_WRITE = new RegExp(
  [
    String.raw`\bcomo (?:se |le |les )?(?:escribo|escribe|escribimos|hablo|hablamos|digo|pregunto)\b(?: (?:algo|un mensaje|una pregunta))? (?:(?:a|al) (?!mano\b)[a-z]+|con (?:alguien|el jefe|redes|despacho|politica|el ivt|ivt|grabacion|el equipo|todo el equipo|mis companeros))\b`,
    String.raw`\bcomo (?:le |les )(?:escribo|hablo|digo|pregunto)\b`,
    String.raw`\bcomo (?:se |le |les )?(?:mando|manda|envio|envia|escribo|escribe|hago|empiezo|inicio) (?:un |una |el |la )?(?:mensaje|mensajito|chat|conversacion)\b`,
    String.raw`\b(?:red interna|chat del equipo|mensajes del equipo|hablar por mensajes?|hablo por mensajes?|mandar (?:un )?mensaje|mandarle (?:un )?mensaje|escribir(?:le)? (?:un )?mensaje)\b`,
  ].join('|'),
);

// A channel's management or a message the platform held: not how to write to someone.
// The Enter key and the send button too («como mando el mensaje si el enter no lo manda»): the answers say it.
const NOT_HOW_WRITE = /\b(?:canal|canales|grupo|grupos|no me deja|no me dejo|no puedo|no se (?:manda|envia|puede|mando|envio)|no lo (?:manda|envia|mando|envio)|enter|salto de linea|avioncito|boton de enviar|oculto|oculta|ocultaron|enviar igual|corregir|solo el jefe|archiv\w*|edit\w*|borr\w*|elimin\w*|bloque\w*)\b/;

export type MessagesAsk = 'read' | 'tell';

/** Whether the question asks 360 to read the team's messages or to send one (null: neither). */
export function messagesAsk(text: string): MessagesAsk | null {
  const q = plain(text);
  if (!q) return null;
  if (!NOTICE.test(q) && (TELL.test(q) || TELL_ONE.test(q) || SEND_ONE.test(q) || BY_MESSAGE.test(q))) return 'tell';
  if (LABEL.test(q)) return null;
  const rule = ELSEWHERE.test(q) && AS_RULE.test(q) && !READ_ME.test(q);
  if ((WROTE.test(q) || SAID.test(q) || TALKING.test(q) || ANSWERED.test(q) || LAST.test(q) || GO_READ.test(q) || COPY_OUT.test(q) || SAID_ABOUT.test(q)) && !rule) return 'read';
  if (READ.test(q) && !NOT_TO_ME.test(q) && !rule) return 'read';
  return null;
}

/** «¿Cómo le escribo a alguien?»: how Mensajes is used (the guide card and the button to Mensajes). */
export function asksHowToWrite(text: string): boolean {
  const q = plain(text);
  return !!q && HOW_WRITE.test(q) && !NOT_HOW_WRITE.test(q) && !messagesAsk(text) && !NOTICE.test(q);
}
