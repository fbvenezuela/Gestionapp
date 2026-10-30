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

const NOUN = String.raw`(?:mensajes?|mensajitos?|chats?|conversacion(?:es)?)`;
// Asked to 360: «lee», «léeme», «resúmeme», «revisa», «¿puedes leer…?».
const READ_VERB = String.raw`(?:lee|leeme|leelo|leelos|leela|leelas|lees|leas|leer|leerme|revisa|revisame|revisalo|resume|resumeme|resumes|resumir|resumirme|resumen|chequea|chequeame)`;
const FILLER = String.raw`(?:el|la|los|las|lo|mis|tus|sus|ese|esa|este|esta|esos|esas|estos|estas|un|una|ultimo|ultimos|ultima|ultimas|nuevo|nuevos|nueva|nuevas|de|del|que|me|todo|todos|todas)`;
const READ = new RegExp(String.raw`\b${READ_VERB}(?: ${FILLER})* ${NOUN}\b`);
// «¿Quién lee los mensajes?», «¿el jefe lee los mensajes?», «¿cómo leo…?», «¿dónde leo…?»: how Mensajes works
// (the guide card), not a request to 360.
const NOT_TO_ME = new RegExp(String.raw`\b(?:como|donde|en que (?:parte|pantalla)|puedo|podemos|se puede|se pueden|quien|quienes|jefe|administracion|admin|redes|despacho|politica|ivt|grabacion|alguien|nadie|otros)\b(?: (?:no|si|tambien|ya))?(?: (?:puede|pueden|puedo|podemos|va a|van a|deberia|tiene que|tienen que))? (?:me )?${READ_VERB}\b`);
// What someone wrote or meant: these verbs are only ever about messages.
const WROTE = /\bque (?:me |nos |te |le |les )?(?:escribio|escribieron|respondio|respondieron|contesto|contestaron|quiso decir|quisieron decir|quiere decir con)\b/;
// What it says, said or put, with a word of Mensajes («¿qué dice el mensaje de Kevin?», «¿qué puso Rubén en el grupo?»).
const SAID = new RegExp(String.raw`\bque (?:me |nos |te |le |les )?(?:dice|dicen|decia|dijo|dijeron|puso|pusieron|mando|mandaron)\b.*\b(?:${NOUN}|grupo|todo el equipo)\b`);
// A label of the screen, not what someone wrote.
const LABEL = /\bmensajes? (?:oculto|nuevos?)\b/;

// «Dile / mándale (un mensaje) / escríbele / pregúntale a <alguien> que…», not to administración (support).
const TELL_VERB = String.raw`(?:dile|digale|decile|dila|diles|mandale|mandales|enviale|enviales|escribele|escribeles|preguntale|preguntales|comentale|comentales|recuerdale|recuerdales)`;
const TELL = new RegExp(String.raw`\b${TELL_VERB}(?: (?:un|una|el|este|ese) (?:mensaje|mensajito|recado|nota))? (?:a|al|para) (?!(?:la )?(?:administracion|admin|soporte)\b)[a-z]+`);
const SEND_ONE = new RegExp(String.raw`\b(?:manda|envia|escribe|mandame|enviame|escribeme|deja|dejale)(?:le|les)? (?:un |una )?(?:mensaje|mensajito) (?:a|al|para) (?!(?:la )?(?:administracion|admin|soporte)\b)[a-z]+`);
const BY_MESSAGE = new RegExp(String.raw`\bavisa(?:le|les)?\b.*\bpor (?:${NOUN}|el chat|la red interna)\b`);
// A notice for a whole role (step 4 of the demo brain): not a message.
const NOTICE = /\bavisos?\b/;

// «¿Cómo le escribo a Redes?», «¿cómo mando un mensaje?», «¿cómo armo un canal?» (the boss's own steps, «Cambiar quién
// está en un canal», are a task of his guide),
// «la red interna».
const HOW_WRITE = new RegExp(
  [
    String.raw`\bcomo (?:se |le |les )?(?:escribo|escribe|escribimos|hablo|hablamos|digo|pregunto)\b(?: (?:algo|un mensaje|una pregunta))? (?:(?:a|al) (?!mano\b)[a-z]+|con (?:alguien|el jefe|redes|despacho|politica|el ivt|ivt|grabacion|el equipo|todo el equipo|mis companeros))\b`,
    String.raw`\bcomo (?:le |les )(?:escribo|hablo|digo|pregunto)\b`,
    String.raw`\bcomo (?:se |le |les )?(?:mando|manda|envio|envia|escribo|escribe|hago|creo|armo|abro|empiezo|inicio) (?:un |una |el |la )?(?:mensaje|mensajito|chat|conversacion|grupo|canal)\b`,
    String.raw`\b(?:red interna|chat del equipo|mensajes del equipo|hablar por mensajes?|hablo por mensajes?|mandar (?:un )?mensaje|mandarle (?:un )?mensaje|escribir(?:le)? (?:un )?mensaje)\b`,
  ].join('|'),
);

export type MessagesAsk = 'read' | 'tell';

/** Whether the question asks 360 to read the team's messages or to send one (null: neither). */
export function messagesAsk(text: string): MessagesAsk | null {
  const q = plain(text);
  if (!q) return null;
  if (!NOTICE.test(q) && (TELL.test(q) || SEND_ONE.test(q) || BY_MESSAGE.test(q))) return 'tell';
  if (LABEL.test(q)) return null;
  if (WROTE.test(q) || SAID.test(q)) return 'read';
  if (READ.test(q) && !NOT_TO_ME.test(q)) return 'read';
  return null;
}

/** «¿Cómo le escribo a alguien?»: how Mensajes is used (the guide card and the button to Mensajes). */
export function asksHowToWrite(text: string): boolean {
  const q = plain(text);
  return !!q && HOW_WRITE.test(q) && !messagesAsk(text) && !NOTICE.test(q);
}
