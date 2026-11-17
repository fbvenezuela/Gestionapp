// 360 and what people send from the web (design §4(e), decision 4): 360 never reads a request, a case or a denuncia,
// never gives a person's contact or data, their files, the receipts' codes and keys or the desk's counts, and never keeps
// what was asked about them. Pure: no I/O, and nothing here knows how the requests are stored (attention-isolation test).
//  - «¿qué pidió la señora…?», «léeme la última denuncia», «¿qué le contestaron…?», «busca el caso que termina en…»
//    (content), «dame el teléfono de quien reportó…» (person), «¿cuántas solicitudes vencidas hay?» (count), «expórtame
//    la lista con los teléfonos» (export) and «pásame la clave del comprobante de prueba» (code): a fixed line per role
//    (local.ts step C), stored as CASE_MARK (never the text), out of «Lo que preguntan», never sent to a provider;
//  - «¿cómo veo los casos?», «¿quién ve el contacto?», «¿puedo exportar?», «¿qué es una denuncia?»: how Atención works,
//    answered by the guide (the answers of the index).
import { plain } from './text';

/** What is stored instead of a question about a citizen's request (index.ts). */
export const CASE_MARK = '[pregunta sobre un caso]';

export type CaseAsk = 'content' | 'person' | 'count' | 'export' | 'code';

// What people send.
const CASE_NOUN = String.raw`(?:solicitud|solicitudes|caso|casos|denuncia|denuncias|observacion|observaciones|peticion|peticiones|queja|quejas|reportes? de la web)`;
// Who sends it: said as such («la señora», «el vecino», «quien reportó»)…
const SENDER = String.raw`(?:senora|senoras|senor|senores|senorita|vecino|vecina|vecinos|vecinas|ciudadano|ciudadana|ciudadanos|quien (?:reporto|mando|pidio|denuncio|escribio|hizo|envio)|el que (?:reporto|mando|pidio|denuncio|escribio|hizo|envio)|la que (?:reporto|mando|pidio|denuncio|escribio|hizo|envio))`;
// …or «la gente», «la persona», only next to the web or what it sent («¿qué dice la gente en los comentarios?» is Redes').
const SOMEONE = String.raw`(?:la gente|la persona|las personas|una persona)`;
const CITIZEN = /\b(?:solicitud|solicitudes|caso|casos|denuncia|denuncias|reporte|reportes|reporto|denuncio|pidio|la web|por la web|en la web|pagina|atencion|observacion|observaciones|comprobante)\b/;
// Asked to 360: «léeme», «resúmeme», «dime», «muéstrame», «busca».
const READ = String.raw`(?:lee|leeme|leelo|leela|leelos|leelas|leer|leerme|resume|resumeme|resumir|dime|dimelo|cuentame|muestrame|ensename|busca|buscame|revisa|revisame|abre|abreme)`;
// What it says, asked for or answered (never how something is done).
const SAID = String.raw`(?:pidio|pide|piden|pidieron|dice|dicen|decia|dijo|dijeron|escribio|escribieron|mando|mandaron|envio|enviaron|reporto|reportaron|denuncio|denunciaron|contesto|contestaron|respondio|respondieron|le dijeron|le contestaron|le respondieron|le escribieron|subieron|llego|llegaron|entro|entraron|se queja|se quejan|reclama|reclaman|foto|fotos|evidencia|evidencias|archivo|archivos)`;

const who = (q: string) => new RegExp(String.raw`\b${SENDER}\b`).test(q) || (new RegExp(String.raw`\b${SOMEONE}\b`).test(q) && CITIZEN.test(q));
// Someone of the team said as «la persona de…» («¿qué fotos mandó la persona de Grabación?»): not a citizen.
const TEAM_PERSON = /\b(?:la persona|la gente|las personas|una persona) (?:de|del) (?:grabacion|redes|despacho|politica|ivt|equipo|la oficina|administracion)\b/;
// What may come before the «qué» that asks: «y», «oye», «dime», «sabes»…
const LEAD = String.raw`(?:(?:y|e|pero|oye|mira|dime|sabes|cuentame|me dices|me puedes decir|entonces|bueno|chamo|porfa) )*`;
const CONTENT: ((q: string, clauses: string[]) => boolean)[] = [
  // «Léeme la última denuncia», «resúmeme las solicitudes de hoy», «léeme la última que llegó», «léeme lo que escribió…».
  (q) => new RegExp(String.raw`\b${READ}\b(?: [a-z]+){0,4} ${CASE_NOUN}\b`).test(q),
  (q) => new RegExp(String.raw`\b${READ}\b(?: [a-z]+){0,3} (?:la|el|lo|las|los) (?:ultima|ultimo|ultimas|ultimos)\b`).test(q) && (CITIZEN.test(q) || /\bque (?:llego|llegaron|entro|entraron)\b/.test(q)),
  (q) => new RegExp(String.raw`\b${READ}\b(?: [a-z]+){0,2} (?:lo que|que) (?:\w+ ){0,2}${SAID}\b`).test(q) && (who(q) || new RegExp(String.raw`\b${CASE_NOUN}\b`).test(q)),
  // «¿Qué pidió la señora…?», «¿qué dice el caso del bote?», «¿qué le contestaron a la señora…?», «¿qué foto mandó…?»: the
  // «qué» that asks starts a clause («el vecino que reportó me dio su número» says who, it asks nothing).
  (q, c) => c.some((x) => new RegExp(String.raw`^${LEAD}(?:de |a |con |en |por )?(?:que|lo que) (?:le |les |me |nos )?(?:\w+ )?${SAID}\b`).test(x)) && (new RegExp(String.raw`\b${CASE_NOUN}\b`).test(q) || who(q)),
  (q) => /\bque (?:dice|dicen|decia) (?:la|el|las|los) (?:nota interna|notas internas|respuesta|respuestas|historial)\b/.test(q),
  // «¿Qué solicitudes llegaron?», «¿qué reportes mandó la gente?», «¿de qué se queja la gente…?».
  (q) => new RegExp(String.raw`\bque (?:${CASE_NOUN}|reportes) (?:\w+ ){0,3}(?:llegaron|llego|hay|mandaron|mando|entraron|tenemos|enviaron)\b`).test(q) && CITIZEN.test(q),
  (q) => /\bde que se (?:queja|quejan)\b/.test(q) && who(q),
  // What a person sent with it: «¿qué fotos mandó la persona del derrumbe?», «¿qué archivos subió el vecino?».
  (q, c) =>
    c.some((x) => new RegExp(String.raw`^${LEAD}que (?:fotos?|archivos?|adjuntos?|evidencias?|videos?|documentos?) (?:\w+ ){0,2}(?:mando|mandaron|subio|subieron|envio|enviaron|adjunto|adjuntaron|puso|pusieron)\b`).test(x)) &&
    (who(q) || (new RegExp(String.raw`\b${SOMEONE}\b`).test(q) && !TEAM_PERSON.test(q))),
  // «¿Quién vio el contacto de la señora…?», «¿cuál fue el último que publicaron?», «¿tú eres la bandeja?».
  (q) => /\b(?:quien|quienes) (?:vio|vieron|abrio|abrieron|exporto|exportaron|miro|miraron) (?:el|los) contactos?\b/.test(q),
  (q) => /\btu eres la bandeja\b/.test(q),
  // A case by its code or a piece of it («AC-2026-…», «el código del caso de la señora», «el caso que termina en…»).
  (q) => /\bac\s?\d{4}\b/.test(q) || /\b(?:caso|solicitud|denuncia|codigo)\b.*\btermina en\b/.test(q),
  (q) => /\b(?:dame|dime|pasame|me das|me pasas|mandame|cual es|cuales son|necesito|busca|buscame)\b.*\b(?:codigo|codigos)\b.*\b(?:caso|casos|solicitud|solicitudes|denuncia|denuncias)\b/.test(q) && !/\b(?:comprobante|comprobantes|prueba)\b/.test(q),
];
// A person's contact or data, asked for, next to what they sent.
const DATA_ASK = /\b(?:dame|dime|pasame|me das|me pasas|mandame|enviame|cual es|cuales son|necesito|quiero|tienes|sabes)\b(?: [a-z]+){0,3} (?:el |la |los |las |su |sus )?(?:telefono|telefonos|numero|correo|correos|contacto|contactos|datos|nombre|nombres|direccion|whatsapp|cedula)\b/;
const NAME_OR_HOME = /^(?:(?:y|e|pero|oye) )?(?:como se llama|como se llaman|donde vive|donde viven)\b/;
const OF_SENDER = /\b(?:reporto|reportaron|denuncio|denunciaron|pidio|pidieron|mando|mandaron|escribio|solicitud|solicitudes|caso|casos|denuncia|denuncias|reporte|la web|por la web|atencion|casos atendidos)\b/;
// The desk's numbers, asked to 360 («¿cuántas solicitudes vencidas hay?», «¿y cuántas hay en no procede?»).
const COUNT = /^(?:(?:y|e|pero|oye|dime|sabes) )*cuant[oa]s\b/;
const COUNT_OF_DESK = /\b(?:solicitudes|denuncias|casos|peticiones|quejas|observaciones|no procede|derivad[oa]s|sin responder|por la web|de la web|atencion)\b/;
// The list exported for someone, by 360 («expórtame…», «mándame por aquí el excel de los casos…»).
const EXPORT = /\b(?:exporta|exportame|exportalo|exportala|descarga|descargame|bajame|mandame|pasame|enviame|dame|sacame)\b(?: [a-z]+){0,5} (?:el excel|un excel|la lista|el csv|la hoja|los contactos|las solicitudes|los casos|las denuncias)\b/;
const EXPORT_OF_DESK = /\b(?:solicitudes|casos|denuncias|contactos|telefonos|atencion)\b/;
// A receipt's code or key, of the demo or of anyone («la clave del comprobante de prueba», «DEMR02», «recupérame su clave»).
const CODE = [
  /\bdemr\s?\d{2}\b/,
  /\b(?:dame|dime|pasame|me das|me pasas|mandame|cual es|cuales son|necesito|quiero|tienes|sabes)\b.*\b(?:codigo|codigos|clave|claves)\b.*\b(?:comprobante|comprobantes|prueba)\b/,
  /\b(?:dame|dime|pasame|me das|me pasas|mandame|cual es|necesito)\b.*\bclave\b.*\b(?:solicitud|caso|denuncia|senora|senor|persona)\b/,
  /\b(?:recupera|recuperame|recuperala|recuperamela|recuperarle)\b.*\bclave\b|\bclave\b.*\b(?:recupera|recuperame|recuperala|recuperamela)\b/,
];
// «¿Me la recuperas?» of a citizen's key (of a team member's, it is how to come in: no passwords).
const RECOVER_FOR = /\b(?:recuperas|recuperasela|recuperarsela|recuperarla|recuperamela|me la recuperas|se la recuperas)\b/;
const OF_CITIZEN = /\b(?:solicitud|comprobante|caso|denuncia|senora|senor|vecin[oa]|ciudadan[oa]|la persona)\b/;
// Who sent it, asked: «¿quién denunció al alcalde por la web?», «¿quién mandó la solicitud del hueco?» (a denuncia is
// only Atención's; the rest, said next to the web or what it sent).
const WHO_SENT = /^(?:(?:y|e|pero|oye) )?(?:quien|quienes) (?:denuncio|denunciaron|reporto|reportaron|mando|mandaron|envio|enviaron|escribio|escribieron|pidio|pidieron|hizo|hicieron|puso|pusieron)\b/;
const SENT_OF_DESK = /\bdenunci|\b(?:solicitud|solicitudes|por la web|en la web|desde la web|atencion|observacion|peticion|queja)\b/;
// Asked as a rule or a how-to («¿cómo veo…?», «¿quién ve…?», «¿puedo…?», «¿qué es…?»): the guide answers it.
const RULE = /^(?:(?:y|e|pero|oye) )?(?:como|donde|quien|quienes|puedo|podemos|se puede|que es|que son|que significa|para que|por que|cuando|en que)\b/;

// A word of what people send («la solicitud», «el vecino», «la denuncia», «por la web»): with it, a question that also
// reads as one about the team's messages («¿qué escribió el vecino que reportó…?») is about a case.
const DESK_WORDS = /\b(?:solicitud|solicitudes|denuncia|denuncias|caso|casos|reporte|reportes|reporto|reportaron|vecin[oa]s?|ciudadan[oa]s?|senora|senor|por la web|de la web|en la web|atencion|observacion|observaciones)\b/;

/** Whether a question about a case goes before the Mensajes one (both would refuse; the case's line says it right). */
export function caseOverMessages(text: string, before?: string | null): boolean {
  return !!caseAsk(text, before) && DESK_WORDS.test(plain(text));
}

/**
 * What a question asks 360 to read or give of the citizens' requests (null: nothing of that). `before`: the question
 * before in the thread, for a «¿y la última?» that goes on with one about a denuncia or a case.
 */
export function caseAsk(text: string, before?: string | null): CaseAsk | null {
  // «En caso de…», «en ese caso» are a way of talking, not a case.
  const q = plain(text).replace(/\b(?:en|por si|para) (?:caso|ese caso|el caso|este caso|un caso|todo caso|cualquier caso|tal caso)\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (!q) return null;
  const rule = RULE.test(q);
  if (CODE.some((re) => re.test(q)) || (RECOVER_FOR.test(q) && /\bclave\b|\bla recuper/.test(q) && OF_CITIZEN.test(q))) return 'code';
  if (!rule && EXPORT.test(q) && EXPORT_OF_DESK.test(q)) return 'export';
  if (COUNT.test(q) && COUNT_OF_DESK.test(q)) return 'count';
  if (WHO_SENT.test(q) && SENT_OF_DESK.test(q)) return 'person';
  if (((!rule && DATA_ASK.test(q)) || NAME_OR_HOME.test(q)) && OF_SENDER.test(q) && (who(q) || /\b(?:de quien|del que|de la que|de la solicitud|del caso|de la denuncia)\b/.test(q))) return 'person';
  // Each clause of the question, for the «qué» that starts one («el caso lleva días quieto, ¿qué le respondieron?»).
  const clauses = String(text ?? '').split(/[,.;:¿?!¡]+/).map((x) => plain(x).replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!/^(?:(?:y|e|pero|oye) )?(?:como|donde|puedo|podemos|se puede|que es|que son|que significa|para que|por que)\b/.test(q) && CONTENT.some((t) => t(q, clauses))) return 'content';
  // «¿Y qué pidió la última persona?», «léeme la última que llegó» after a question about Atención.
  const prev = plain(before ?? '');
  if (prev && /\b(?:solicitud|solicitudes|denuncia|denuncias|caso|casos|atencion ciudadana|casos atendidos|bandeja)\b/.test(prev)) {
    if (/^(?:(?:y|e|pero) )?(?:que (?:pidio|dice|dijo|escribio|mando|reporto)|leeme|lee|dime|cual fue)\b/.test(q) && /\b(?:ultim[oa]s?|persona|senora|senor|vecino|ese|esa|eso)\b/.test(q)) return 'content';
    if (/^(?:(?:y|e|pero) )?cuant[oa]s\b/.test(q)) return 'count';
  }
  return null;
}
