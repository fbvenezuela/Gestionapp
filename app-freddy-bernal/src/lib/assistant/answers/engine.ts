// 360's answer index (D-89): every question the team may ask, with its answer per role, from one place. Built once,
// lazily, from the curated entries (ANSWERS: the long tail in people's words) and from the help content itself (the
// role guides, «Para todos» with «Palabras de la app», the flows and administración's guide: src/lib/guides, the same
// source as /ayuda, so 360 never drifts from it). Pure: no database, no I/O. The demo brain answers with the best entry; with a model chain the
// best ones go into the prompt as fichas (brain.ts pickFichas). Static, date-free text: answering never leaks the agenda.
import { ROLE_LABEL, TEAM_ROLES, type Role, type TeamRole } from '../../roles';
import { ADMIN_GUIDE, FLOWS, GLOSSARY, SHARED, allGuides, glossaryLine, sharedFor } from '../../guides';
import { NO_MESSAGES_LINE, TOP_MESSAGES_LINE } from '../../guides/shared';
import { everyoneSections } from '../../guides/sections';
import { hasReceiptCode } from '../../guides/check';
import type { Audience, Flow, RoleText, SectionGuide, Task, WebBlock, WebFacets, WebFlow, WebSection } from '../../guides/types';
import { contract, plain } from '../text';
import { domainOfScreen, type Domain } from '../screens';
import { WEB_REF, webEntry, webFlows, webHref, webSections } from '../../guides/web';
import { UNFILLED_HUECO, clientWords, fillClientWords, type ClientWords } from '../../guides/web/words';
import { ANSWERS, ANSWER_FILES, type Answer, type AnswerText } from './index';

export type { Domain } from '../screens';

// kind: what the entry is (it decides how it is matched and how 360 says it): a curated entry, a question of a guide's
// FAQ, a screen (what it is for), one thing done on a screen, something a role cannot do there, a task and one of its
// steps, the job (what the role does, never does, with whom, its day), a topic of «Para todos» and one of its lines, a
// step of a flow, one of administración's notes, a word of «Palabras de la app» (what it means), a rule of the web's or
// Atención's guide (and why it is so), and a whole flow told as a story (who does what, in order: design §4(c)4).
export type Kind = 'curated' | 'faq' | 'screen' | 'item' | 'cannot' | 'task' | 'step' | 'job' | 'never' | 'with' | 'day' | 'topic' | 'line' | 'flow' | 'note' | 'term' | 'rule' | 'flowStory';

export type Entry = {
  id: string;
  kind: Kind;
  source: string; // where it comes from, for the tests and the panel: 'curado:todos', 'boss:tasks.poner-fecha', 'shared:fecha'…
  roles: Role[] | null; // null = everyone (the team and administración)
  q: string[]; // ways it is asked: matched both ways
  doc?: string; // what it says: matched one way, at a lower weight
  a: AnswerText;
  go?: string; // a SCREENS href (the caller shows it only to whoever can open it)
  tutorial?: string; // a tour id (the caller offers it only to whoever has it)
  screen?: string; // the screen it is about (a small bonus there, and «¿qué es esto?»)
  next?: string; // a step's next step («¿y después?»)
  may?: boolean; // a «No…» to «¿puedo…?» (what a role cannot or never does): only for that question
  names?: string[]; // a word of «Palabras de la app»: the names it is asked with («reel», «short»…)
  domain?: Domain; // the team's work, the web or Atención (design §4(d)3): set on every entry of the index
  also?: string[]; // other screens it is about (a web section: its list and its page with an id)
  cursor?: number; // a flow told as a story: how many of its steps the story says (its «¿Sigo?» goes on from there)
  quiet?: boolean; // a fixed line that only points to the guide (a section 360 never says): never before another answer
};

export type Confidence = 'strong' | 'weak' | 'none';
// via: the way of asking or the text that matched best (for the tests and the panel: why 360 chose it).
export type Match = { entry: Entry; score: number; confidence: Confidence; text: string; via: string };

// ── Reading a question ─────────────────────────────────────────────────────────────────────────────────────────────

// What is written to save letters, dictated or said another way (Venezuelan shorthand, design point 12), read as the
// words it stands for. Applied on plain() text, word by word.
const SHORTHAND: [RegExp, string][] = [
  [/\b(?:q|k|ke|qe)\b/g, 'que'],
  [/\b(?:xq|pq|porq|xk|pk|porke|xque)\b/g, 'por que'],
  [/\b(?:kien|qien)\b/g, 'quien'],
  [/\b(?:kienes|qienes)\b/g, 'quienes'],
  [/\b(?:kndo|qndo|cndo|cuado|kuando|cdo)\b/g, 'cuando'],
  [/\b(?:onde|aonde|adonde|dnd|dnde|dond)\b/g, 'donde'],
  [/\bd\b/g, 'de'],
  [/\bpal\b/g, 'para el'],
  [/\bpa\b/g, 'para'],
  [/\b(?:kiero|kero|qiero)\b/g, 'quiero'],
  [/\b(?:grax|grx|grasias|graciaas)\b/g, 'gracias'],
  [/\b(?:tb|tmb|tbn|tambn)\b/g, 'tambien'],
  [/\b(?:msj|msje|mje|mensj)\b/g, 'mensaje'],
  [/\b(?:msjs|mjes|msjes)\b/g, 'mensajes'],
  [/\b(?:cel|telf|tlf|tel|tlfn|celu)\b/g, 'telefono'],
  [/\b(?:xfa|xfavor|porfa|porfis|plis|please)\b/g, 'por favor'],
  [/\b(?:toy)\b/g, 'estoy'],
  [/\b(?:bn)\b/g, 'bien'],
  [/\b(?:dps|dsp|dspues|despues)\b/g, 'despues'],
  [/\b(?:kmo|cmo|komo)\b/g, 'como'],
  [/\b(?:tng|tngo)\b/g, 'tengo'],
  [/\b(?:nose)\b/g, 'no se'],
  [/\b(?:porfavor)\b/g, 'por favor'],
  [/\b(?:vdd)\b/g, 'verdad'],
  [/\b(?:min|mins)\b/g, 'minutos'],
  [/\b(?:pls|pliss)\b/g, 'por favor'],
  [/\b(?:ta)\b/g, 'esta'],
  [/\b(?:tan|stan)\b/g, 'estan'],
  [/\b(?:sta)\b/g, 'esta'],
  [/\b(?:aki|aca)\b/g, 'aqui'],
  [/\b(?:nd|nada)\b/g, 'nada'],
  [/\b(?:ud|uds)\b/g, 'usted'],
  [/\b(?:info)\b/g, 'informacion'],
  [/\b(?:insta|ig)\b/g, 'instagram'],
  [/\b(?:fb)\b/g, 'facebook'],
  [/\b(?:yt)\b/g, 'youtube'],
  [/\b(?:tuit|tuits|twit|twits)\b/g, 'tweet'],
  [/\b(?:tik tok)\b/g, 'tiktok'],
  [/\b(?:(?:en|para|de|a) )x\b/g, ' twitter'],
  [/\bx\b/g, 'por'],
  [/\b(?:gobernador|gobernadora|gobe|gober)\b/g, 'jefe'],
  [/\b(?:camarografos?|camarografas?|camaras?|camarita)\b/g, 'grabacion'],
  [/\b(?:compa|compas|companeros?|companeras?|colegas?|panas?)\b/g, 'equipo'],
  [/\b(?:email|emails|mail|mails|gmail)\b/g, 'correo'],
  [/\b(?:chat|chats)\b/g, 'mensajes'],
  [/\b(?:notificaciones|notificacion)\b/g, 'avisos'],
  [/\b(?:clave|claves|password|contrasenas?)\b/g, 'contrasena'],
  [/\b(?:aplicacion|aplicaciones|aplicacio)\b/g, 'app'],
  [/\b(?:copies)\b/g, 'copy'],
  // The screen's pictures, said as people say them: the bell, the envelope, the pencil, the magnifier, the gear.
  [/\b(?:campanit[ao]|campanaso)\b/g, 'campana'],
  // The bubbles: Mensajes are the bubbles at the top («los globitos», «el globito de arriba»); the one at the bottom
  // right is 360's own button («¿para qué es el globito de abajo?», «la burbujita que me sale abajo»). A bubble alone
  // («el globito») says neither (13/11).
  [/\b(?:globit[oa]s?|burbujit[ao]s?)\b(?=(?: [a-z0-9]+){0,4} (?:abajo|de abajo)\b)/g, 'boton redondo'],
  [/\b(?:globit[oa]s?|burbujit[ao]s?)\b(?=(?: [a-z0-9]+){0,3} (?:arriba|de arriba)\b)/g, 'mensajes'],
  [/\b(?:sobrecito|sobresito|el sobre|cartica|cartita|globitos|burbujitas)\b/g, 'mensajes'],
  // «El botón Más» of the phone's bar: «más» alone is a filler word, the button is not (13/11).
  [/\bboton (?:de |del )?mas\b(?! (?:de|que|grande|chiquit\w*|pequen\w*)\b)/g, 'boton masmenu'],
  [/\b(?:lapicito|lapicero|lapisito)\b/g, 'lapiz'],
  [/\b(?:lupita)\b/g, 'lupa'],
  [/\b(?:engranaje|engranajito|tuerquita|tuerca|ruedita)\b/g, 'ajustes'],
  [/\b(?:casita)\b/g, 'inicio'],
  [/\b(?:whatsapp|wasap|wassap|guasap|whats)\b/g, 'whatsapp'],
  // A phone number is a phone: «los números de arriba» (counts on a screen) are not Mi perfil's «tu número de teléfono».
  [/\bnumeros? (?:de|del) (?:telefonos?|celular)\b/g, 'telefono'],
  [/\b(mis?|tus?|su) numero\b/g, '$1 telefono'],
  [/\bpara que\b/g, 'paraque'],
  // «Se publica solo», «sale sola»: by itself, with nobody doing it («solo» alone is a filler).
  [/\b(se (?:publica|publican|sube|suben|manda|mandan|envia|envian|programa)|sale|salen) (?:sol[oa]s?|solit[oa]s?)\b/g, '$1 automatico'],
  [/\bdel? uno al? diez\b/g, 'de 1 a 10'],
  [/\b1 al 10\b/g, '1 a 10'],
];

/** plain(), with the shorthand read as words: what the index matches. */
export function readable(text: string): string {
  return SHORTHAND.reduce((t, [re, to]) => t.replace(re, to), plain(text)).replace(/\s+/g, ' ').trim();
}

// Words that say nothing of what is asked (articles, prepositions, fillers, auxiliaries).
const STOP = new Set(
  ('a al ante con contra de del desde en entre hacia hasta para por segun sin sobre tras el la lo los las un una unos unas y e o u ni que se me te le les nos mi mis tu tus su sus ' +
    'es son era fue sea ser estar esta estan este esto estos esa ese eso esas esos aquel ya si muy mas pero como cual cuales hay algo alguien alguna algun algunos ' +
    'todo toda todos todas otro otra otros otras cada mismo misma tambien solo aqui ahi alla asi bien pues osea tipo cosa cosas ahora ahorita luego entonces bueno oye ' +
    'hola porfa favor puedo puede pueden podemos podria podrian quiero quiere quieres necesito necesita tengo tienes tiene tienen tener hago haces hace hacen hacer ' +
    'voy vas va van vamos ir dime decir digo dice saber se sabes yo tu usted el ella ellos nosotros eh ah okey ok vale dale gracias epa buenas buenos dias tarde ' +
    'deberia debo debe hice hizo cuanto cuanta cuantos cuantas sera seria tan tanto pasa paso eso estoy estas estamos mucho mucha muchos poco nada ese cuando donde quien quienes ' +
    'porque por que aja verdad realmente exactamente queda quedan quedo quede quedaron estaba estaban estuvo estaria ' +
    // What is said around a question and asks nothing (fillers, greetings, Venezuelan ways of talking).
    'chamo chama chamito mana mano vaina broder bro mijo mija nojoda epale mira fijate disculpa disculpe perdon perdona oiga coye vez veces rapido rapidito vale ' +
    // Polite ways of asking: they ask nothing themselves («¿podrías explicarme el procedimiento para…?»).
    'podrias podrian puedes pudieras quisiera quisieramos gustaria explicame explicarme expliqueme explicame ayudame ayudarme ayudeme indicame indiqueme cuentame digame dices dime procedimiento amablemente ' +
    // The frame of a «¿cómo funciona…?», «¿para qué sirve…?», «¿qué significa…?»: the kind of question says it (askKind).
    'funciona funcionan funcionar funcione sirve sirven servir significa significan significado').split(' '),
);
// Question words and negation: they shape a question («¿dónde…?», «¿quién…?», «no me llega») and weigh little.
// «Error» only says it is a problem («hay un error en el copy» is about the copy): light too.
const LIGHT: Record<string, number> = { donde: 0.5, quien: 0.6, quienes: 0.6, cuando: 0.4, no: 0.6, nunca: 0.6, despues: 0.4, antes: 0.4, porque: 0.3, mio: 0.4, paraque: 0.5, error: 1 };
// The person's own («mi nombre», «mis avisos», «tu perfil»): one light word.
const MINE = new Set(['mi', 'mis', 'tu', 'tus']);

// What kind of question a text is (design §A): how something is done, what it is, who, where, why, whether one may,
// what happens if, what goes in it, how many, when. A way of asking of another kind is another question, even with the
// same words («¿quién aprueba los tweets?» is not «si Redes cambia un tweet aprobado…»; «¿cómo apruebo una pieza en
// rojo?» is not «¿qué significa el rojo?»). Read on readable() text, without its «…» labels.
export type AskKind = 'how' | 'what' | 'who' | 'where' | 'why' | 'may' | 'if' | 'list' | 'count' | 'when' | 'problem';
const KIND_RES: [AskKind, RegExp][] = [
  ['who', /\b(?:quien|quienes)\b/],
  ['why', /^(?:(?:y|e|pero|entonces|oye|bueno|ok|aja|ya) )*(?:y )?(?:por que|porque)\b|\bpor que (?:no|me|le|se|nos|ya|sale|salen|aparece|dice|dicen|esta|estan|tengo|hay)\b/],
  ['if', /\bque (?:pasa|hago|sucede|ocurre|hacemos) (?:si|cuando|con)\b|^(?:(?:y|e|pero|entonces|oye|bueno|ok) )*(?:y )?si\b|\by si\b/],
  // Something that fails or that the platform will not let («no me deja publicar», «me sale un error que dice…»).
  ['problem', /\b(?:error|errores|falla|fallo|no me deja|no me dejo|no deja|no me sale|no sale|no aparece|no me aparece|no carga|no funciona|no sirve|no llega|no me llega|no me acepta|no acepta|me rechaza|se tranco|se trabo|se pego|me sale que|me dice que|dice que (?:no|falta|es muy|esta))\b/],
  ['where', /\b(?:donde|adonde|a donde|en que (?:parte|pantalla|lado|seccion|menu|boton|pestana))\b/],
  ['how', /^(?:(?:y|e|pero|entonces|bueno|ok|ya) )*(?:ahora )?que hago(?: ahora)?$|\bcomo (?!(?:va|van|esta|estan|quedo|quedaron|salio|salieron|es|son|funciona\w*|asi|que)\b)(?!se (?:cuando|si|que|quien|donde)\b)[a-z]+|\bque (?:hago|hacemos|tengo que hacer|hay que hacer|debo hacer) (?:para|pa)\b|\b(?:los )?pasos (?:para|pa)\b|\b(?:la forma|la manera|el modo) de\b/],
  ['what', /\bque (?:es|son|significa\w*|quiere decir|quieren decir)\b|^(?:(?:y|e|pero|entonces|oye|bueno|ok|aja|ya|hola) )*(?:y )?que (?:hace|hacen|sale en|salen en|hay en|dice|dicen|seria|serian|era|eran)\b|\bparaque (?:sirve\w*|es|son)\b|\bcomo funciona\w*\b|\bexplica\w*\b|\bde que se trata\b|\bque onda con\b/],
  ['list', /\bque (?:pongo|ponemos|lleva|llevan|llevo|escribo|lleno|necesito|reviso|revisa|chequeo|verifico|miro|tomo en cuenta|tengo que (?:poner|llenar|escribir|llevar)|hay que (?:poner|llenar|escribir|llevar)|va en|van en)\b/],
  ['may', /\b(?:puedo|podemos|se puede|pueden|puede|me deja|me dejan|nos deja|nos dejan|es posible|tengo permiso|se vale|esta permitido)\b/],
  ['count', /\bcuant[oa]s?\b/],
  ['when', /\bcuando\b/],
];
/** The kind of a question («¿cómo…?», «¿qué es…?», «¿quién…?»…), or null when it says none. */
export function askKind(text: string): AskKind | null {
  const t = text.replace(/«[^«»]*»/g, ' ');
  return KIND_RES.find(([, re]) => re.test(t))?.[0] ?? null;
}
// How far apart two kinds are (1 = the same question): a «¿cómo…?» is close to a «¿dónde…?», a «¿puedo…?» or a «¿qué
// pongo…?»; a «¿quién…?» or a «¿por qué…?» is another question altogether.
const NEAR_KINDS: Record<string, number> = {
  'how may': 0.97, 'how where': 0.97, 'how list': 0.97, 'where may': 0.97, 'count what': 0.97, 'when if': 0.97, 'list may': 0.97,
  'problem why': 0.97, 'problem if': 0.97, 'problem how': 0.95, 'problem may': 0.95, 'why if': 0.95, 'what where': 0.95,
  'what how': 0.92, 'what list': 0.9, 'what may': 0.9,
};
function kindFit(a: AskKind | null, b: AskKind | null): number {
  if (!a || a === b) return 1;
  // A way of asking of no kind («un chip rojo en la pieza») for a question of one: a little less than one of its kind.
  if (!b) return NO_KIND;
  return NEAR_KINDS[`${a} ${b}`] ?? NEAR_KINDS[`${b} ${a}`] ?? 0.86;
}
// What a way of asking of no kind weighs for a question of one.
const NO_KIND = 0.95;
// What a way of asking of the same kind as the question adds.
const SAME_KIND = 0.04;
// What the verb of a «¿cómo…?» weighs, against its weight as a word.
const HEAD = 1.25;
// What a curated answer written for the asker's role adds (one for everyone adds 0.03).
const ROLE_OWN = 0.045;

// Verbs whose root changes, and the same thing said two ways: read as one root.
const IRREGULAR = new Map<string, string>(
  Object.entries({
    pongo: 'pon', pones: 'pon', pone: 'pon', ponen: 'pon', poner: 'pon', ponga: 'pon', pongan: 'pon', puse: 'pon', puso: 'pon', pusieron: 'pon', ponle: 'pon', ponerle: 'pon', ponerla: 'pon', ponerlo: 'pon', ponerse: 'pon', ponemos: 'pon', puesto: 'pon', puesta: 'pon',
    veo: 'ver', ve: 'ver', ves: 'ver', ver: 'ver', vemos: 'ver', vio: 'ver', vi: 'ver', visto: 'ver', vista: 'ver', vea: 'ver', verlo: 'ver', verla: 'ver', verlos: 'ver', ven: 'ver',
    salgo: 'sal', sale: 'sal', salen: 'sal', salir: 'sal', salio: 'sal', salga: 'sal', salgan: 'sal', salimos: 'sal', sali: 'sal',
    subi: 'sub', subio: 'sub', subieron: 'sub', suba: 'sub', suban: 'sub', subirlo: 'sub', subirla: 'sub', subirlos: 'sub', subido: 'sub', subida: 'sub', subidas: 'sub', subidos: 'sub',
    apruebo: 'aprob', aprueba: 'aprob', aprueban: 'aprob', apruebe: 'aprob', aprueben: 'aprob', apruebas: 'aprob',
    pido: 'ped', pide: 'ped', piden: 'ped', pida: 'ped', pidio: 'ped', pidieron: 'ped', pedido: 'ped', pedidos: 'ped', pedidas: 'ped',
    cierro: 'cerr', cierra: 'cerr', cierran: 'cerr', cierre: 'cerr',
    pierdo: 'perd', pierde: 'perd', perdi: 'perd', perdio: 'perd', perdido: 'perd',
    muevo: 'mov', mueve: 'mov', mueven: 'mov', mueva: 'mov', movi: 'mov', movio: 'mov', movida: 'mov', movido: 'mov',
    vuelvo: 'volv', vuelve: 'volv', vuelven: 'volv', volvio: 'volv',
    encuentro: 'encontr', encuentra: 'encontr', encuentran: 'encontr',
    muestro: 'mostr', muestra: 'mostr', muestran: 'mostr', muestrame: 'mostr', mostrar: 'mostr', mostrarme: 'mostr', muestras: 'mostr',
    pruebo: 'prob', prueba: 'prob', probar: 'prob',
    corrijo: 'correg', corrige: 'correg', corrigen: 'correg', corregir: 'correg', corregi: 'correg', corrigio: 'correg', corregido: 'correg',
    propongo: 'propon', propone: 'propon', proponer: 'propon', propuesta: 'propon', propuestas: 'propon', propuse: 'propon', propuso: 'propon', propuesto: 'propon',
    elijo: 'eleg', elige: 'eleg', eligen: 'eleg', elegir: 'eleg', elegi: 'eleg',
    sigo: 'segu', sigue: 'segu', siguen: 'segu', seguir: 'segu', siguiente: 'segu',
    escrito: 'escrib', escrita: 'escrib', escritos: 'escrib', escribo: 'escrib', escribir: 'escrib', escribe: 'escrib', escribelo: 'escrib',
    entiendo: 'entend', entiende: 'entend', entender: 'entend',
    empiezo: 'empez', empieza: 'empez', empiezan: 'empez', empezar: 'empez',
    consigo: 'consegu', consigue: 'consegu', conseguir: 'consegu',
    digo: 'dec', dice: 'dec', dicen: 'dec', dijo: 'dec', diga: 'dec',
    decision: 'decid', decisiones: 'decid',
    pasarle: 'envi', pasarles: 'envi', pasale: 'envi', pasales: 'envi', pasarsela: 'envi', pasarselo: 'envi', pasarselas: 'envi', pasarselos: 'envi', pasasela: 'envi', pasaselo: 'envi',
    doy: 'dar', da: 'dar', dan: 'dar', dar: 'dar', dio: 'dar', di: 'dar', darle: 'dar', darles: 'dar', darla: 'dar', darlo: 'dar', dale: 'dar', damos: 'dar',
    traigo: 'trae', traer: 'trae', trae: 'trae',
    llego: 'lleg', llega: 'lleg', llegan: 'lleg', llegar: 'lleg', llegue: 'lleg',
    escojo: 'escog', escoge: 'escog',
    envio: 'envi', envia: 'envi', envian: 'envi', enviar: 'envi', envie: 'envi', enviado: 'envi',
    celular: 'telefon', celulares: 'telefon', telefono: 'telefon', telefonos: 'telefon',
    correo: 'mail', correos: 'mail',
    leo: 'leer', lee: 'leer', leen: 'leer', leer: 'leer', lees: 'leer', leyendo: 'leer', leido: 'leer', lei: 'leer',
    estado: 'estado', estados: 'estado',
    copy: 'copy', tweet: 'tweet', tweets: 'tweet', reel: 'reel', reels: 'reel',
    video: 'vide', videos: 'vide',
    jefe: 'jefe', jefa: 'jefe',
    app: 'app', apps: 'app',
    fotico: 'foto', foticos: 'foto', fotos: 'foto', foto: 'foto',
  }),
);
const SUFFIXES = 'amientos imientos amiento imiento aciones iciones acion icion iones ion adoras adores adora ador mente ando iendo aron ieron arian arias aria ados adas idos idas ado ada ido ida amos emos imos aban aba ian ar er ir an en as es os a e o s'.split(' ');

// How a root is spelled, said the same way: «aprovar» is «aprobar», «yegar» is «llegar», «aser» is «hacer»,
// «rebisar» is «revisar» (b/v, s/z/c before e and i, ll/y, a silent h at the start), «rechacé» is «rechazar» (a root that
// ends in c is the one in z). Both sides are read like this.
const fold = (r: string) => r.replace(/v/g, 'b').replace(/z/g, 's').replace(/c(?=[ei])/g, 's').replace(/c$/, 's').replace(/ll/g, 'y').replace(/^h(?=[aeiou])/, '');

/** A crude root of a word: «apruebo» and «aprobar», «fotos» and «foto», «publicación» and «publicar» are one. */
export function rootOf(w: string): string {
  const irr = IRREGULAR.get(w);
  if (irr) return fold(irr);
  // Clitics after an infinitive: «ponerle», «subirlo», «mandarles»; «publiqué» is «publicar», «pagué» is «pagar».
  const r = (w.length > 6 ? w.replace(/(ar|er|ir)(?:se)?(?:le|la|lo|les|las|los|me|te|nos)$/, '$1') : w).replace(/(?<=[a-z]{3})qu(e|en|es|emos)$/, 'c$1').replace(/(?<=[a-z]{3})gu(e|en|es|emos)$/, 'g$1');
  for (const s of SUFFIXES) if (r.length - s.length >= 3 && r.endsWith(s)) return fold(r.slice(0, -s.length));
  return fold(r);
}

// Two ways of saying the same thing: a word matches its group at 0.8. Written as words (their roots are taken with
// rootOf, so «chequear», «chequeo» and «chequeé» all land on the group); a word may be in two groups.
const SYNONYMS: string[][] = [
  ['subir', 'cargar', 'montar', 'colgar', 'meter'],
  ['crear', 'armar', 'montar'],
  ['borrar', 'eliminar', 'tumbar', 'quitar', 'remover'],
  ['cancelar', 'suspender', 'tumbar', 'anular'],
  ['cambiar', 'modificar', 'editar', 'corregir', 'actualizar', 'arreglar'],
  ['mandar', 'enviar'],
  ['ver', 'mirar', 'leer', 'chequear', 'revisar', 'consultar'],
  ['revisar', 'chequear', 'verificar'],
  ['cuadrar', 'organizar', 'ordenar', 'acomodar', 'coordinar'],
  ['buscar', 'encontrar', 'ubicar', 'hallar', 'lupa'],
  ['prender', 'activar', 'encender'],
  ['apagar', 'desactivar'],
  ['dejar', 'permitir'],
  ['tardar', 'demorar'],
  ['link', 'enlace'],
  ['gente', 'persona', 'muchachos', 'senores', 'chicos'],
  ['foto', 'imagen'],
  ['campana', 'avisos'],
  ['lapiz', 'editar'],
  ['importancia', 'prioridad'],
  // «¿Qué es lo más urgente?» is what goes first («lo más importante», «lo prioritario»).
  ['urgente', 'importante', 'prioritario'],
  ['rodar', 'mover'],
  ['grabar', 'filmar'],
  ['aprobar', 'autorizar'],
  ['rechazar', 'descartar'],
  ['calificar', 'puntuar', 'evaluar'],
  ['avisar', 'notificar'],
  ['ajustes', 'configuracion'],
  // The obra fichas are the IVT's; the videos and the photos are the material.
  ['obra', 'ivt'],
  ['material', 'video', 'foto'],
  ['salir', 'aparecer'],
  ['entrar', 'ingresar', 'loguear'],
  ['llenar', 'completar', 'rellenar'],
  ['descargar', 'bajar'],
  ['agregar', 'meter', 'anadir', 'incluir', 'sumar'],
  ['invitar', 'agregar'],
  ['quitar', 'sacar'],
  ['equivocar', 'error', 'mal'],
  ['nuevo', 'otro'],
  ['problema', 'falla', 'error'],
  // The kinds of event people name («el material de la feria», «el acto se grabó»): for the help content, an event.
  ['evento', 'acto', 'feria', 'asamblea', 'inauguracion', 'caravana', 'cabildo', 'conversatorio', 'foro', 'juramentacion', 'operativo', 'actividad', 'jornada'],
];
const SYN = new Map<string, Set<string>>();
for (const words of SYNONYMS) {
  const g = [...new Set(words.map((w) => rootOf(w)))];
  for (const r of g) SYN.set(r, new Set([...(SYN.get(r) ?? []), ...g.filter((x) => x !== r)]));
}

type Tok = { root: string; w: number; light: boolean };

/** The words of a text that say something, as roots (in order, repeated ones once). */
export function tokens(text: string): string[] {
  const out: string[] = [];
  for (const raw of readable(text).split(' ')) {
    const w = MINE.has(raw) ? 'mio' : raw;
    if (!w || (STOP.has(w) && !(w in LIGHT))) continue;
    if (w.length < 2 && !/^\d$/.test(w)) continue;
    const r = w in LIGHT ? w : rootOf(w);
    if (!out.includes(r)) out.push(r);
  }
  return out;
}

/** A diminutive read as its word («numeritos», «cosita», «botoncito», «chiquitica», «ratico»): the root it would have. */
export function undiminished(w: string): string | null {
  const d = w.replace(/(?:ecit|cit|itic|it|tic)([oa]s?)$/, '$1');
  return d !== w && d.length >= 3 ? rootOf(d) : null;
}

// How two roots match: the same (1), synonyms (0.8), or one is the other with a short ending («comunit» / «comunitari»,
// «histori» / «historial» do not: they differ by more than a quarter).
function likeness(a: string, b: string): number {
  if (a === b) return 1;
  if (SYN.get(a)?.has(b)) return 0.8;
  // Done again is done: «reactivar» / «activar», «reenviar» / «enviar», «reprogramar» / «programar».
  if ((a.startsWith('re') && a.slice(2) === b && b.length >= 4) || (b.startsWith('re') && b.slice(2) === a && a.length >= 4)) return 0.8;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  // A diminutive is its word: «numerito» / «número», «campanita» / «campana», «botoncito» / «botón».
  if (s.length >= 3 && l.startsWith(s) && /^(?:it|cit|ecit|ic|cic|ecic)$/.test(l.slice(s.length))) return 0.9;
  if (a.length < 5 || b.length < 5) return 0;
  if (!l.startsWith(s)) return 0;
  return l.length - s.length <= Math.max(1, Math.floor(s.length / 4)) ? 0.85 : 0;
}

// ── The entries ────────────────────────────────────────────────────────────────────────────────────────────────────

// A screen's name before an arrow keeps its capital («Publicar → «Registrar…»», «Agenda → «Mis eventos»»).
const lcFirst = (s: string) => (s.startsWith('«') || /^\p{Lu}[\p{Ll}]+ →/u.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
const ucFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const end = (s: string) => (/[.!?…»)]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);
/** The «…» labels a text quotes (top level). */
function labelsOf(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '«') {
      if (depth === 0) start = i + 1;
      depth++;
    } else if (text[i] === '»' && depth > 0 && --depth === 0) out.push(text.slice(start, i));
  }
  return out;
}

/** A label without the example number of a counted one: «Aprobar todas las verdes (2)», «Publicar antes (#20)»,
 * «Resumen del mes · Mes 1», «5 personas» are asked by their words. */
function labelWords(l: string): string {
  return l.replace(/\(\s*#?(?:n|\d+)\s*\)/g, ' ').replace(/\s+·\s+Mes\s+(?:n|\d+)(?:\s*#\d+)?$/u, ' ').replace(/^(?:n|N|\d+)\s+(?=\p{L})/u, ' ');
}

// The labels of a text that are asked about by name (two words or more), not a button's verb («Poner en el copy»,
// «Marcar realizado» read as an order: asked with their words, they would answer «¿qué pongo en el copy?»).
const askedLabels = (text: string) => labelsOf(text).filter((l) => l.split(' ').length >= 2 && !/^\p{L}+(?:ar|er|ir)\b/u.test(l));

/** «Cargar una ficha comunitaria, paso a paso: 1) … 2) …», up to about 420 letters (the rest is in the guide). */
export function stepsAnswer(title: string, steps: string[]): string {
  const out: string[] = [];
  let len = title.length + 16;
  for (const [k, s] of steps.entries()) {
    const line = `${k + 1}) ${s}`;
    if (out.length && len + line.length > 420) break;
    out.push(line);
    len += line.length + 1;
  }
  const rest = out.length < steps.length ? ' El resto está en la guía de tu trabajo.' : '';
  return `${title}, paso a paso: ${out.join(' ')}${rest}`;
}

// Where a screen is said in an answer: «En Por aprobar», «En un evento, la pestaña Material», «En Ajustes → Equipo».
function placeOf(s: { title: string; screen?: string }): string {
  const t = s.title.replace(/: /g, ', ');
  const named = /^(?:Un|Una) /.test(t) ? lcFirst(t) : t;
  return s.screen?.startsWith('/ajustes/') ? `Ajustes → ${named}` : named;
}
function itemText(s: { title: string; screen?: string }, item: string): string {
  return `En ${placeOf(s)}: ${lcFirst(item)}`;
}
const staticScreen = (screen?: string) => (screen && !screen.includes('[') && !screen.includes('?') ? screen : undefined);

// The roles named for a step of a flow («el jefe o el despacho»).
const WHO: Record<TeamRole, string> = { boss: 'el jefe', dispatch: 'el despacho', politics: 'política', ivt: 'el IVT', camera: 'Grabación', social: 'Redes' };
const whoOf = (roles: TeamRole[]) => {
  const names = roles.map((r) => WHO[r]);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} o ${names.at(-1)}` : names[0] ?? '';
};

// What a screen is for, said: its name first unless what it says already names it, then what is done there, up to about
// 400 letters («Por ponerle fecha: las fichas del IVT y los reportes… Cada tarjeta dice…»).
function screenText(s: { title: string; screen?: string; what: string; youDo: string[] }): string {
  const name = placeOf(s).replace(/^Ajustes → /, '');
  const last = plain(s.title).split(' ').at(-1) ?? '';
  const first = plain(s.title).split(' ').slice(0, 2).join(' ');
  const named = new RegExp(`^(?:el|la|los|las|tu|tus) ${last}\\b`).test(plain(s.what)) || plain(s.what).startsWith(first);
  let out = named ? end(s.what) : `${ucFirst(name)}: ${lcFirst(end(s.what))}`;
  for (const item of s.youDo) {
    const next = `${out} ${end(ucFirst(item))}`;
    if (next.length > 400) break;
    out = next;
  }
  return out;
}

function screenEntries(role: Role, prefix: string, source: string, s: SectionGuide | (ReturnType<typeof adminSections>[number])): Entry[] {
  const out: Entry[] = [];
  const go = staticScreen(s.screen);
  const title = s.title;
  // A section of a role's guide about a screen of «Web» or «Atención» (the boss's and Administración's, APP-42) is of
  // that domain, like the web's guide (its button and its weights, design §4(d)3); every other one is the team's.
  const domain = domainOfScreen(s.screen);
  const base = { roles: [role], source, screen: s.screen?.split('?')[0], ...(go ? { go } : {}), ...(domain && domain !== 'equipo' ? { domain } : {}) };
  const tour = 'tour' in s ? s.tour : undefined;
  out.push({
    ...base,
    id: `${prefix}`,
    kind: 'screen',
    q: [title, `para que sirve ${title}`, `que es ${title}`, `que hago en ${title}`, `que hay en ${title}`, `donde esta ${title}`, `como funciona ${title}`],
    doc: s.what,
    a: screenText(s),
    ...(tour ? { tutorial: tour } : {}),
  });
  s.youDo.forEach((item, k) => {
    out.push({ ...base, id: `${prefix}:hace:${k}`, kind: 'item', q: askedLabels(item), doc: `${title}. ${item}`, a: end(itemText(s, item)) });
  });
  (s.cannot ?? []).forEach((item, k) => {
    out.push({ ...base, id: `${prefix}:no:${k}`, kind: 'cannot', may: true, q: [`puedo ${lcFirst(item)}`], doc: `${title}. ${item}`, a: end(`No puedes ${lcFirst(item)}`) });
  });
  return out;
}

function taskEntries(role: TeamRole, slug: string, t: Task): Entry[] {
  const source = `${role}:tasks.${t.id}`;
  const base = { roles: [role] as Role[], source, ...(t.tour ? { tutorial: t.tour } : {}) };
  const id = `${slug}:paso-a-paso:${t.id}`;
  // Asked by its title or its «Cuándo»; each step answers on its own (all the steps in one text would match anything).
  const out: Entry[] = [{ ...base, id, kind: 'task', q: [t.title, `como ${t.title}`, t.when], a: stepsAnswer(t.title, t.steps), go: `/ayuda/${slug}?ver=pasos` }];
  t.steps.forEach((step, k) => {
    const next = t.steps[k + 1];
    const text = `Para ${lcFirst(t.title)}: ${lcFirst(end(step))}${next && step.length < 90 ? ` Después: ${lcFirst(end(next))}` : ''}`;
    out.push({ ...base, id: `${id}:${k + 1}`, kind: 'step', q: askedLabels(step), doc: `${t.title}. ${step}`, a: text, ...(next ? { next: `${id}:${k + 2}` } : {}) });
  });
  return out;
}

type AdminSection = (typeof ADMIN_GUIDE.sections)[number];
function adminSections(): AdminSection[] {
  return ADMIN_GUIDE.sections;
}

function guideEntries(): Entry[] {
  const out: Entry[] = [];
  for (const g of allGuides()) {
    const role = g.role;
    const r = [role] as Role[];
    const slug = g.slug;
    const label = ROLE_LABEL[role];
    // «Tu trabajo»: what the role does, never does, with whom, and its day.
    out.push({
      id: `${slug}:trabajo`,
      kind: 'job',
      source: `${role}:job.mission`,
      roles: r,
      q: ['que hago yo', 'cual es mi trabajo', 'que hace mi rol', 'cual es mi funcion', 'de que se trata mi trabajo', 'que me toca hacer a mi', `que hace ${label}`, 'para que estoy en la plataforma', 'cual es mi responsabilidad'],
      a: `${g.job.mission} ${g.job.responsibilities.slice(0, 2).map((x) => end(x)).join(' ')}`,
      go: `/ayuda/${slug}`,
    });
    g.job.responsibilities.forEach((x, k) => out.push({ id: `${slug}:trabajo:${k}`, kind: 'job', source: `${role}:job.responsibilities`, roles: r, q: [], doc: x, a: end(`Te toca ${lcFirst(x)}`) }));
    out.push({
      id: `${slug}:nunca`,
      kind: 'never',
      source: `${role}:job.never`,
      roles: r,
      q: ['que no hago', 'que no debo hacer', 'que no me toca', 'que tengo prohibido', 'que no puedo hacer', 'que cosas no hago yo'],
      a: `No te toca: ${g.job.never.map((x) => lcFirst(x.replace(/[.]$/, ''))).join('; ')}.`,
    });
    g.job.never.forEach((x, k) => out.push({ id: `${slug}:nunca:${k}`, kind: 'never', may: true, source: `${role}:job.never`, roles: r, q: [`puedo ${lcFirst(x)}`], doc: x, a: end(`No: ${lcFirst(x)}`) }));
    out.push({
      id: `${slug}:con-quien`,
      kind: 'with',
      source: `${role}:job.worksWith`,
      roles: r,
      q: ['con quien trabajo', 'con quienes trabajo', 'quien me pasa el trabajo', 'a quien le paso lo mio', 'con quien me coordino'],
      a: g.job.worksWith.map((w) => `${ROLE_LABEL[w.role]}: ${lcFirst(end(w.what))}`).join(' '),
    });
    for (const w of g.job.worksWith) {
      const who = ROLE_LABEL[w.role];
      out.push({
        id: `${slug}:con:${w.role}`,
        kind: 'with',
        source: `${role}:job.worksWith`,
        roles: r,
        q: [`que hace ${who} por mi`, `que me da ${who}`, `que le paso a ${who}`, `que hago con ${who}`, `como trabajo con ${who}`],
        doc: w.what,
        a: `${who}: ${lcFirst(end(w.what))}`,
      });
    }
    out.push({
      id: `${slug}:dia`,
      kind: 'day',
      source: `${role}:day`,
      roles: r,
      q: ['como es mi dia', 'que hago cada dia', 'por donde empiezo', 'que hago primero', 'cual es mi rutina', 'que hago todos los dias', 'como empiezo el dia'],
      a: g.day.slice(0, 3).map((x) => end(x)).join(' '),
    });
    g.job.rhythm.forEach((x, k) => out.push({ id: `${slug}:ritmo:${k}`, kind: 'day', source: `${role}:job.rhythm`, roles: r, q: [], doc: x, a: end(x) }));
    g.day.forEach((x, k) => out.push({ id: `${slug}:dia:${k}`, kind: 'day', source: `${role}:day`, roles: r, q: [], doc: x, a: end(x) }));
    g.tasks.forEach((t, k) => {
      const list = taskEntries(role, slug, t);
      const after = g.tasks[k + 1];
      if (after && /^Después\b/.test(after.when)) list[0].next = `${slug}:paso-a-paso:${after.id}`;
      out.push(...list);
    });
    g.sections.forEach((s, k) => out.push(...screenEntries(role, `${slug}:pantalla:${k}`, `${role}:sections ${s.title}`, s)));
    g.faq.forEach((f, k) => out.push({ id: `${slug}:pregunta:${k}`, kind: 'faq', source: `${role}:faq`, roles: r, q: [f.q], doc: f.a, a: f.a }));
  }
  return out;
}

function sharedEntries(): Entry[] {
  const out: Entry[] = [];
  const team = [...TEAM_ROLES] as Role[];
  // What administración reads of «Para todos» (sharedFor): no Mensajes, and «Lo de arriba» without the bubbles.
  const forAdmin = new Map(sharedFor({ messages: false }).map((t) => [t.id, t]));
  for (const t of SHARED) {
    // Administración has no Mensajes (D-49): the topic is the team's, and the envelope line says so (sharedFor).
    const roles: Role[] | null = t.id === 'mensajes' ? team : null;
    // A topic said to everyone says administración's own lines to administración («Lo de arriba de la pantalla»: never
    // that it has the bubbles of Mensajes, 13/11).
    const lead = t.body.slice(0, 2).join(' ');
    const adminLead = forAdmin.get(t.id)?.body.slice(0, 2).join(' ');
    const a: AnswerText = roles === null && adminLead && adminLead !== lead ? { default: lead, admin: adminLead } : lead;
    out.push({ id: `todos:${t.id}`, kind: 'topic', source: `shared:${t.id}`, roles, q: [t.title, `como funciona ${t.title}`, `que es ${t.title}`], doc: t.body[0], a, ...(t.id === 'mensajes' ? { go: '/mensajes' } : t.id === 'ayuda' ? { go: '/ayuda' } : {}) });
    t.body.forEach((line, k) => {
      const envelope = line === TOP_MESSAGES_LINE;
      const id = `todos:${t.id}:${k}`;
      if (envelope) {
        out.push({ id, kind: 'line', source: `shared:${t.id}`, roles: team, q: askedLabels(line), doc: `${t.title}. ${line}`, a: line });
        out.push({ id: `${id}:admin`, kind: 'line', source: `shared:${t.id}`, roles: ['admin'], q: [], doc: NO_MESSAGES_LINE, a: NO_MESSAGES_LINE });
      } else out.push({ id, kind: 'line', source: `shared:${t.id}`, roles, q: askedLabels(line), doc: `${t.title}. ${line}`, a: line });
    });
  }
  return out;
}

// «Palabras de la app» (src/lib/guides/glossary.ts): what a word means, for the team and administración. Its name and the
// words people ask with, each said the ways a meaning is asked («¿qué es un reel?», «¿qué significa CSV?», «¿qué quiere
// decir trancado?»), and the word alone; it says «Reel y Short: Un video corto…». A task that names the word («¿cómo subo
// un reel?») is a «¿cómo…?»: these ways of asking are of another kind, so the task goes first.
// What a word means is the same for everyone; who does it is not (13/11). «Programar» says «a esa hora la publicas tú»:
// to whoever does not publish (publishing is Redes', the boss's and administración's), who does. «La oficina» is what
// «Oficina» opens in the menu: política and the IVT do not have it.
const NOT_PUBLISHING: Role[] = ['dispatch', 'politics', 'ivt', 'camera'];
const GLOSSARY_FOR: Record<string, (line: string) => Partial<Record<Role, string>>> = {
  programar: (line) => Object.fromEntries(NOT_PUBLISHING.map((r) => [r, line.replace('a esa hora la publicas tú y marcas «Ya lo publiqué»', 'a esa hora la publica a mano quien publica (Redes, el jefe o administración) y marca «Ya lo publiqué»')])),
  oficina: () => {
    const text = 'La oficina: El trabajo dibujado como una oficina de diez salas, de «Recepción» a «Analizador». No está en tu menú: la abren el jefe, el despacho, Redes, Grabación y administración, con «Oficina».';
    return { politics: text, ivt: text };
  },
};

function glossaryEntries(): Entry[] {
  return GLOSSARY.map((g) => {
    const names = [...new Set([g.term, ...g.aka].map((x) => x.toLowerCase()))];
    const line = glossaryLine(g);
    const byRole = GLOSSARY_FOR[g.id]?.(line);
    return {
      id: `palabra:${g.id}`,
      kind: 'term' as const,
      source: `glossary:${g.id}`,
      roles: null,
      q: names.flatMap((x) => [`que es ${x}`, `que son ${x}`, `que significa ${x}`, `que quiere decir ${x}`, `para que es ${x}`, x]),
      doc: g.text,
      a: byRole ? { default: line, ...byRole } : line,
      go: '/ayuda',
      names,
    };
  });
}

function flowEntries(): Entry[] {
  const out: Entry[] = [];
  const guides = allGuides();
  for (const f of FLOWS) {
    const roles = guides.filter((g) => g.flows.includes(f.id)).map((g) => g.role as Role);
    f.steps.forEach((s, k) => {
      const branches = s.question && s.branches?.length ? ` ${s.question} ${s.branches.map((b) => `${b.label}: ${lcFirst(b.text)}`).join(' ')}` : '';
      const nextStep = f.steps[k + 1];
      out.push({
        id: `flujo:${f.id}:${s.id}`,
        kind: 'flow',
        source: `flows:${f.id} step ${k + 1}`,
        roles,
        q: askedLabels(s.text),
        doc: `${f.title}. ${s.text}${branches}`,
        a: `${ucFirst(whoOf(s.roles))}: ${lcFirst(end(s.text))}${branches}`,
        ...(nextStep ? { next: `flujo:${f.id}:${nextStep.id}` } : {}),
      });
    });
  }
  return out;
}

function adminEntries(): Entry[] {
  const out: Entry[] = [];
  const r: Role[] = ['admin'];
  everyoneSections('admin')
    .filter((x) => x.screen === '/avisos' || x.screen === '/buscar' || x.screen === '/perfil')
    .forEach((x, k) => out.push(...screenEntries('admin', `admin:todos:${k}`, `admin:sections ${x.title}`, x)));
  out.push({ id: 'admin:trabajo', kind: 'job', source: 'admin:mission', roles: r, q: ['que hago yo', 'cual es mi trabajo', 'que hace administracion', 'que hace mi rol', 'cual es mi funcion'], a: ADMIN_GUIDE.mission, go: '/ayuda/administracion' });
  adminSections().forEach((s, k) => out.push(...screenEntries('admin', `admin:pantalla:${k}`, `admin:sections ${s.title}`, s)));
  ADMIN_GUIDE.notes.forEach((n, k) => out.push({ id: `admin:nota:${k}`, kind: 'note', source: 'admin:notes', roles: r, q: [], doc: n, a: n }));
  ADMIN_GUIDE.faq.forEach((f, k) => out.push({ id: `admin:pregunta:${k}`, kind: 'faq', source: 'admin:faq', roles: r, q: [f.q], doc: f.a, a: f.a }));
  return out;
}

// A whole flow told as a story (design §4(c)4): who does what, in order, in up to four short sentences, with the flow's
// own page as its button (/ayuda/flujos?f=<id>); «¿Sigo?» when more steps follow (a «sí» or «¿y después?» walks them:
// explain.ts). Asked «¿cómo es el camino de un evento?», «¿cuál es el flujo del mes de Redes?», «¿quién hace qué en los
// tweets?».
const STORY_STEPS = 4;
const STORY_ASK = /\b(?:flujos?|camino|de punta a punta|quien hace que|por donde pasa|el proceso|todo el proceso|los pasos de todo|en que orden)\b/;
const STORY_LETTERS = 400;
// (The title alone only when it says a journey, «Un evento, de la agenda a la publicación»: «El semáforo» or «Tweets de la
// semana» asked alone is what the word means or how it works, the glossary's and the curated answers'.)
function storyAsks(title: string): string[] {
  const noun = lcFirst(title.split(/,\s/)[0]);
  // («de» + «el mes de Redes» is said «del mes de Redes».)
  return [...(title.includes(', ') ? [title] : []), ...storyFrames(noun)].map((x) => x.replace(/\bde el\b/g, 'del').replace(/\ba el\b/g, 'al'));
}
function storyFrames(noun: string): string[] {
  return [`el camino de ${noun}`, `como es el camino de ${noun}`, `cual es el flujo de ${noun}`, `el flujo de ${noun}`, `como funciona el flujo de ${noun}`, `quien hace que en ${noun}`, `por donde pasa ${noun}`];
}
/** The first clause of a step («Graba, sube cada parte… Cuando ya empezó, «Marcar realizado».» → its first sentence). */
const firstSentence = (t: string) => {
  let depth = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '«') depth++;
    else if (t[i] === '»') depth = Math.max(0, depth - 1);
    else if (depth === 0 && t[i] === '.' && (i + 1 === t.length || t[i + 1] === ' ')) return t.slice(0, i + 1);
  }
  return t;
};
function storyText(title: string, lines: string[]): { text: string; said: number } {
  const parts = [`${title.replace(/: /g, ', ')}:`];
  let said = 0;
  for (const l of lines) {
    if (said >= STORY_STEPS || (said > 0 && `${parts.join(' ')} ${l}`.length > STORY_LETTERS)) break;
    parts.push(l);
    said++;
  }
  return { text: `${parts.join(' ')}${said < lines.length ? ' ¿Sigo?' : ''}`, said };
}
function teamFlowStories(): Entry[] {
  const guides = allGuides();
  return FLOWS.map((f: Flow): Entry => {
    const roles = guides.filter((g) => g.flows.includes(f.id)).map((g) => g.role as Role);
    const lines = f.steps.map((s) => `${ucFirst(whoOf(s.roles))}: ${lcFirst(end(firstSentence(s.text)))}`);
    const { text, said } = storyText(f.title, lines);
    return { id: `flujo:${f.id}`, kind: 'flowStory', source: `flows:${f.id} story`, roles, q: storyAsks(f.title), doc: `${f.title}. ${f.steps.map((s) => s.text).join(' ')}`, a: text, go: `/ayuda/flujos?f=${f.id}`, ...(said < lines.length ? { cursor: said } : {}) };
  });
}

// ── The web's and Atención's guide (WF-C, design §4(a)-(d)) ─────────────────────────────────────────────────────────
// Every section and flow of the four docs (src/lib/guides/web, the source of «Ayuda y guías» and the docs), for the boss
// and Administración only (their `audience`; never a team role, never a web role): what each section says, block by
// block, its tasks (the numbered steps), its flows (each step and the whole story) and, once the next round fills them,
// 360's own fields (what, items, tasks, cannot, rules, faq, why). Each entry carries its domain (the web's or Atención's)
// and its button: the panel's screen when there is one, else its place in the guide.

// The sections whose text 360 never says (design §4(e)): they print the demo receipts, the demo keys or example codes.
// 360 points to the guide instead (and, for a receipt, to «Consultar mi solicitud»).
const NEVER_SAID = new Set(['2.3', '5.0', '5.4', '5.22', '7.5', '7.6']);
const RECEIPT_SECTIONS = new Set(['2.3', '7.6']);
// Atención's: its manual (part 5), its flows (6.1 to 6.11), the citizen's journey (part 2) and the desk's roles.
const ATTENTION_SECTIONS = new Set(['atencion-ciudadana', 'rol-coordinador', 'rol-responsable', 'rol-operador-denuncias', 'rol-auditoria', 'atender-en-5-pasos']);
function webDomain(pdf: string, id: string): Domain {
  const [a, b] = pdf.split('.').map(Number);
  return a === 2 || a === 5 || (a === 6 && b >= 1 && b <= 11) || ATTENTION_SECTIONS.has(id) ? 'atencion' : 'web';
}
// The panel's screens of a section (the first one is its own; a static one is its button), when 360's `screen` field
// does not say it: «¿qué es esto?» there, a small bonus there, and «Ir a…».
const SECTION_SCREENS: Record<string, string[]> = {
  'pantalla-la-web': ['/admin/web'],
  editor: ['/admin/web/editar/[id]'],
  'vista-previa': ['/admin/web/vista-previa/[id]'],
  aprobar: ['/admin/web/por-aprobar', '/admin/web/revisar/[id]'],
  versiones: ['/admin/web/editar/[id]/versiones'],
  biblioteca: ['/admin/web/biblioteca', '/admin/web/biblioteca/[id]'],
  'ajustes-del-sitio': ['/admin/web/ajustes'],
  redirecciones: ['/admin/web/redirecciones'],
  'bandeja-y-tablero': ['/admin/atencion'],
  'un-caso': ['/admin/atencion/[id]'],
  cifras: ['/admin/atencion/estadisticas'],
  'areas-y-plazos': ['/admin/atencion/areas'],
  mapa: ['/admin/atencion/mapa'],
  registro: ['/admin/atencion/registro'],
};
// What Administración is on when it opens «Atención» (it never sees the inbox: the page shows it «Áreas y plazos»).
const ADMIN_SCREEN_ENTRY: Record<string, string> = { '/admin/atencion': 'web:areas-y-plazos' };

// The client's words, as 360 says them in a web text: its answer is static help text, so it names them plainly («el
// programa semanal», «el semanario», «la web oficial»), never as a hueco; its ways of asking and its text for matching
// keep the hueco, which the index fills with the client's real words (withClientWords), so «¿qué es el …?» with the
// program's name finds it.
const NEUTRAL_WORDS: [RegExp, string][] = [
  [/\b(bloque|tarjeta|lista|página|sección)\s+«\[PROGRAMA\]»/g, '$1 del programa semanal'],
  [/«\[PROGRAMA\]»|\[PROGRAMA\]/g, 'el programa semanal'],
  [/\b(bloque|tarjeta|lista|página|sección)\s+«\[SEMANARIO\]»/g, '$1 del semanario'],
  [/«\[SEMANARIO\]»|\[SEMANARIO\]/g, 'el semanario'],
  [/,\s*\[WEB_OFICIAL\]/g, ''],
  [/\[WEB_OFICIAL\]/g, 'la web oficial'],
  [/\[ORGANIZACION\]/g, 'la institución'],
];
/** A web text without its doc's marks: «(ver [§x])» out, any other [§x] as that section's title, no **bold** nor `code`. */
function webPlain(text: string): string {
  return text
    .replace(/\s*\((?:ver|véase)\s+(?:\[§[a-z0-9-]+\](?:,\s*|\s+y\s+)?)+\)/g, '')
    .replace(WEB_REF, (_m: string, id: string) => webEntry(id)?.title ?? '')
    .replace(/\*\*/g, '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\s+([.,;:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
/** A web text as 360 says it (see NEUTRAL_WORDS). */
function webSaid(text: string): string {
  let t = webPlain(text);
  for (const [re, to] of NEUTRAL_WORDS) t = t.replace(re, to);
  return contract(t).replace(/\s+/g, ' ').trim();
}
const roleTextOf = (t: RoleText, f: (s: string) => string): AnswerText =>
  typeof t === 'string' ? f(t) : (Object.fromEntries(Object.entries(t).filter((e): e is [string, string] => typeof e[1] === 'string').map(([k, v]) => [k, f(v)])) as AnswerText);
const roleTexts = (t: RoleText): string[] => (typeof t === 'string' ? [t] : Object.values(t).filter((x): x is string => typeof x === 'string'));
/** A role text for one key (an audience or `default`): its own, else the default, else (for one text for all) that one. */
const roleFor = (t: RoleText, key: string): string | undefined => (typeof t === 'string' ? t : ((t as Record<string, string | undefined>)[key] ?? t.default));
const audienceRoles = (a: readonly Audience[]): Role[] => a.filter((x) => x === 'boss' || x === 'admin');

// One thing a section says: a paragraph, an item of a list or a box, a row of a table; and its lead («En «Decidir»:»).
type WebUnit = { text: string; lead?: string; key?: string };
const LEAD = (t: string) => t.length <= 80 && /:\s*$/.test(t);
function tableRow(head: string[], row: string[]): WebUnit {
  const cells = row.map((c) => webPlain(c));
  const key = cells[0] ?? '';
  const rest = cells.slice(1).map((c, k) => (head.length > 2 ? `${lcFirst(webPlain(head[k + 1] ?? ''))}, ${lcFirst(c)}` : lcFirst(c)));
  return { text: `${key}: ${rest.join('; ')}`, key };
}
/** The units and the tasks (numbered steps) of a section's blocks. Part 1's numbered lists are the order of a page. */
function webUnits(s: WebSection): { units: WebUnit[]; tasks: { title: string; steps: string[] }[] } {
  const units: WebUnit[] = [];
  const tasks: { title: string; steps: string[] }[] = [];
  const listsAreSteps = !s.pdf.startsWith('1.');
  let lead: string | undefined;
  s.blocks.forEach((b: WebBlock) => {
    if (b.kind === 'p') {
      const t = webPlain(b.text);
      if (LEAD(t)) lead = t;
      else {
        units.push({ text: t });
        lead = undefined;
      }
      return;
    }
    if (b.kind === 'steps' && listsAreSteps) {
      const title = lead ? lead.replace(/:\s*$/, '') : s.title;
      tasks.push({ title: webPlain(title), steps: b.items.map((x) => webPlain(x)) });
    } else if (b.kind === 'list' || b.kind === 'steps') for (const x of b.items) units.push({ text: webPlain(x), ...(lead ? { lead } : {}) });
    else if (b.kind === 'note') for (const x of b.paras) units.push({ text: webPlain(x) });
    else if (b.kind === 'table') for (const r of b.rows) units.push({ ...tableRow(b.head, r), ...(lead ? { lead } : {}) });
    lead = undefined;
  });
  return { units: units.filter((u) => u.text && !hasReceiptCode(u.text)), tasks: tasks.filter((t) => t.steps.length && !t.steps.some(hasReceiptCode)) };
}
// What a section is about, said as the guide says it: its first unit, named, and the next ones up to about 400 letters.
function webSectionText(title: string, texts: string[]): string {
  const first = texts[0] ?? '';
  const head = plain(webSaid(title)).split(' ').filter((w) => w.length > 3)[0];
  let out = head && plain(first).includes(head) ? end(first) : `${ucFirst(webSaid(title)).replace(/: /g, ', ')}: ${lcFirst(end(first))}`;
  for (const t of texts.slice(1)) {
    const next = `${out} ${end(ucFirst(t))}`;
    if (next.length > STORY_LETTERS) break;
    out = next;
  }
  return out;
}
// The ways a web section is asked: its title (without what is in parentheses), as what it is, what it is for, how it
// works, what is in it and where it is, also with the web or Atención named («¿qué es Inicio en la web?»).
function webTitleAsks(title: string, domain: Domain): string[] {
  const t = webPlain(title).replace(/\s*\([^)]*\)\s*$/, '').replace(/[«»]/g, '').trim();
  const where = domain === 'atencion' ? 'en atencion' : 'en la web';
  // «El comprobante: código y clave», «Versiones: el historial…»: asked by its head too.
  const head = t.includes(':') ? t.split(':')[0].trim() : null;
  // A title that is something done («Programar», «Archivar», «Hacer un reporte»): asked how too.
  const done = /^\p{L}+(?:ar|er|ir)\b/u.test(t) ? [`como ${t}`, `como ${t} ${where}`] : [];
  return [t, `${t} ${where}`, `que es ${t}`, `que es ${t} ${where}`, `para que sirve ${t}`, `como funciona ${t}`, `que hay en ${t}`, `que se hace en ${t}`, ...done, ...(head ? [head, `que es ${head}`, `${head} ${where}`] : [])];
}
/** A unit that starts with a button's or a field's label («Devolver con comentario»: …): asked by it, and how. */
function leadLabelAsks(text: string): string[] {
  const m = /^«([^«»]{3,60})»(?:\s*\([^)]*\))?\s*:/.exec(text);
  if (!m || UNFILLED_HUECO.test(m[1])) return [];
  return [m[1], `como ${m[1]}`, `que hace ${m[1]}`, `para que sirve ${m[1]}`];
}
const nodeSlug = (id: string) => id.replace(/_/g, '-');

/** The entries of one web section or flow's 360 fields (design §4(a)): tasks, cannot, rules (and why) and questions. */
function facetEntries(x: WebFacets & { id: string; title: string; audience: Audience[] }, base: Omit<Entry, 'id' | 'kind' | 'q' | 'a'>, prefix: string): Entry[] {
  const out: Entry[] = [];
  const safe = (t: string) => !hasReceiptCode(t);
  for (const t of x.tasks ?? []) {
    if (!t.steps.every(safe)) continue;
    // A how-to that only one of the section's readers does (WebTask.audience: the boss writes and publishes, Administración
    // gives the roles) goes to that one only, with its steps; the other one is told the section's `cannot` for them.
    const tb = t.audience ? { ...base, roles: audienceRoles(t.audience) } : base;
    const id = `${prefix}:tarea:${t.id}`;
    const steps = t.steps.map((st) => webSaid(st));
    out.push({ ...tb, id, kind: 'task', q: [webPlain(t.title), `como ${webPlain(t.title)}`, ...(t.when ? [webPlain(t.when)] : [])], a: stepsAnswer(webSaid(t.title), steps) });
    steps.forEach((st, k) => {
      const nx = steps[k + 1];
      out.push({ ...tb, id: `${id}:${k + 1}`, kind: 'step', q: askedLabels(webPlain(t.steps[k])), doc: `${webPlain(t.title)}. ${webPlain(t.steps[k])}`, a: `Para ${lcFirst(webSaid(t.title))}: ${lcFirst(end(st))}${nx && st.length < 90 ? ` Después: ${lcFirst(end(nx))}` : ''}`, ...(nx ? { next: `${id}:${k + 2}` } : {}) });
    });
  }
  for (const [aud, list] of Object.entries(x.cannot ?? {}) as [Audience, string[]][]) {
    list.filter(safe).forEach((c, k) => {
      const t = webSaid(c);
      out.push({ ...base, roles: [aud], id: `${prefix}:no:${aud}:${k}`, kind: 'cannot', may: true, q: [`puedo ${lcFirst(t.replace(/^No[,:]?\s*/, '').replace(/[.]$/, ''))}`], doc: `${webPlain(x.title)}. ${webPlain(c)}`, a: /^No\b/.test(t) ? end(t) : end(`No: ${lcFirst(t)}`) });
    });
  }
  (x.rules ?? []).filter(safe).forEach((r, k) => out.push({ ...base, id: `${prefix}:regla:${k}`, kind: 'rule', q: askedLabels(webPlain(r)), doc: `${webPlain(x.title)}. ${webPlain(r)}`, a: end(webSaid(r)) }));
  if (x.why && safe(x.why)) {
    const t = webPlain(x.title).replace(/\s*\([^)]*\)\s*$/, '').replace(/[«»]/g, '');
    out.push({ ...base, id: `${prefix}:porque`, kind: 'rule', q: [`por que ${t}`, `por que es asi ${t}`], doc: `${webPlain(x.title)}. ${webPlain(x.why)}`, a: end(webSaid(x.why)) });
  }
  (x.faq ?? []).forEach((f, k) => {
    if (!roleTexts(f.a).every(safe)) return;
    out.push({ ...base, id: `${prefix}:pregunta:${k}`, kind: 'faq', q: [webPlain(f.q)], doc: roleTexts(f.a).map(webPlain).join(' '), a: roleTextOf(f.a, (t) => end(webSaid(t))) });
  });
  return out;
}

function webSectionEntries(s: WebSection): Entry[] {
  const roles = audienceRoles(s.audience);
  const domain = webDomain(s.pdf, s.id);
  const screens = s.screen ? [s.screen, ...(SECTION_SCREENS[s.id] ?? []).filter((x) => x !== s.screen)] : (SECTION_SCREENS[s.id] ?? []);
  const go = screens.find((x) => !x.includes('[')) ?? webHref(s.id) ?? undefined;
  const base = { source: `web:${s.pdf} ${s.id}`, roles, domain, ...(go ? { go } : {}), ...(screens[0] ? { screen: screens[0] } : {}), ...(screens.length > 1 ? { also: screens.slice(1) } : {}) };
  const prefix = `web:${s.id}`;
  // Nobody's (a citizen's contact, the denuncias, exporting: design §4(d)): only what each one cannot do, to «¿puedo…?».
  if (!roles.length) return facetEntries(s, { ...base, roles: [] }, prefix).filter((e) => e.may);
  const out: Entry[] = [];
  const title = webPlain(s.title);
  const asks = webTitleAsks(s.title, domain);
  if (NEVER_SAID.has(s.pdf)) {
    const said = RECEIPT_SECTIONS.has(s.pdf)
      ? `${ucFirst(webSaid(s.title))}: está en la guía, con su botón. Yo no doy ni pido códigos ni claves, tampoco los de prueba: la persona consulta su solicitud con los suyos en «Consultar mi solicitud».`
      : `${ucFirst(webSaid(s.title))}: está en la guía, con su botón. Yo no doy ni pido códigos ni claves, tampoco los de prueba.`;
    out.push({ ...base, id: prefix, kind: 'screen', q: asks, doc: title, a: said, quiet: true });
    return [...out, ...facetEntries(s, base, prefix)];
  }
  const { units, tasks } = webUnits(s);
  const items = (s.items ?? []).filter((t) => roleTexts(t).every((x) => !hasReceiptCode(x)));
  const what = s.what && roleTexts(s.what).every((x) => !hasReceiptCode(x)) ? s.what : undefined;
  const lead = [...units.map((u) => u.text), ...tasks.map((t) => `${t.title}: ${t.steps[0] ?? ''}`)];
  // 360's own «what» and items, per audience when they are written per audience; else the guide's own words.
  const itemsFor = (key: string) => items.map((i) => roleFor(i, key)).filter((x): x is string => !!x).map(webPlain);
  const said: RoleText = !what
    ? webSectionText(s.title, lead)
    : typeof what === 'string'
      ? webSectionText(s.title, [webPlain(what), ...itemsFor('default')])
      : Object.fromEntries(Object.entries(what).filter((e): e is [string, string] => typeof e[1] === 'string').map(([k, v]) => [k, webSectionText(s.title, [webPlain(v), ...itemsFor(k)])]));
  out.push({ ...base, id: prefix, kind: 'screen', q: asks, doc: webPlain(what ? roleTexts(what)[0] : (lead[0] ?? title)), a: roleTextOf(said, webSaid) });
  // 360's own items first (its words for this section), then what the guide says, block by block.
  items.forEach((t, k) => out.push({ ...base, id: `${prefix}:cosa:${k}`, kind: 'item', q: roleTexts(t).flatMap((x) => askedLabels(webPlain(x))), doc: `${title}. ${webPlain(roleTexts(t)[0])}`, a: roleTextOf(t, (x) => end(webSaid(x))) }));
  units.forEach((u, k) => {
    const text = u.lead && !plain(u.text).startsWith(plain(u.lead).replace(/:$/, '')) ? `${u.lead} ${u.text}` : u.text;
    const key = u.key && !UNFILLED_HUECO.test(u.key) ? u.key.replace(/[«»]/g, '') : '';
    const q = [...askedLabels(u.text), ...leadLabelAsks(u.text), ...(key ? [`que significa ${key}`, `que es ${key}`] : [])];
    out.push({ ...base, id: `${prefix}:${k}`, kind: 'item', q, doc: `${title}. ${u.lead ? `${u.lead} ` : ''}${u.text}`, a: end(webSaid(text)) });
  });
  tasks.forEach((t, b) => {
    const id = `${prefix}:pasos:${b}`;
    const steps = t.steps.map((x) => webSaid(x));
    const name = t.title.replace(/\s*\([^)]*\)\s*$/, '');
    out.push({ ...base, id, kind: 'task', q: [name, `como ${name}`, `como se hace ${name}`], doc: `${title}. ${t.title}`, a: stepsAnswer(webSaid(t.title), steps) });
    steps.forEach((st, k) => {
      const nx = steps[k + 1];
      out.push({ ...base, id: `${id}:${k + 1}`, kind: 'step', q: askedLabels(t.steps[k]), doc: `${t.title}. ${t.steps[k]}`, a: `${ucFirst(webSaid(name))}, paso ${k + 1}: ${lcFirst(end(st))}`, ...(nx ? { next: `${id}:${k + 2}` } : {}) });
    });
  });
  return [...out, ...facetEntries(s, base, prefix)];
}

/** The main path of a flow's drawing: from its first box, the first way out of each one (a question's «Sí» first). */
function mainPath(f: WebFlow): WebFlow['nodes'] {
  const byId = new Map(f.nodes.map((n) => [n.id, n]));
  const out: WebFlow['nodes'] = [];
  const seen = new Set<string>();
  let n = f.nodes[0];
  while (n && !seen.has(n.id)) {
    seen.add(n.id);
    out.push(n);
    const exits = f.edges.filter((e) => e.from === n!.id && !e.dotted);
    const next = exits.find((e) => /^s[ií]$/i.test(e.label ?? '')) ?? exits[0];
    n = next ? byId.get(next.to)! : undefined!;
  }
  return out;
}

function webFlowEntries(f: WebFlow): Entry[] {
  const roles = audienceRoles(f.audience);
  const domain = webDomain(f.pdf, f.id);
  const go = webHref(f.id) ?? undefined;
  const base = { source: `web:${f.pdf} ${f.id}`, roles, domain, ...(go ? { go } : {}) };
  const prefix = `webflujo:${f.id}`;
  if (!roles.length) return facetEntries(f, { ...base, roles: [] }, prefix).filter((e) => e.may);
  const out: Entry[] = [];
  const byId = new Map(f.nodes.map((n) => [n.id, n]));
  for (const n of f.nodes) {
    if (hasReceiptCode(n.text)) continue;
    const exits = f.edges.filter((e) => e.from === n.id && !e.dotted);
    const branches = n.shape === 'decision' ? ` ${exits.map((e) => `${webPlain(e.label ?? '')}: ${lcFirst(end(webPlain(byId.get(e.to)?.text ?? '')))}`).join(' ')}` : '';
    const next = n.shape !== 'decision' && exits[0] ? `${prefix}:${nodeSlug(exits[0].to)}` : undefined;
    out.push({ ...base, id: `${prefix}:${nodeSlug(n.id)}`, kind: 'flow', q: [...askedLabels(webPlain(n.text)), ...leadLabelAsks(webPlain(n.text))], doc: `${webPlain(f.title)}. ${webPlain(n.text)}${branches}`, a: webSaid(`${end(webPlain(n.text))}${branches}`), ...(next ? { next } : {}) });
  }
  // The story: who does it, then the drawing's main path; its cursor is the next box of that path it did not say.
  // «La web: revisar y decidir» is asked by what is done too («¿cómo funciona revisar y decidir?»).
  const lines = mainPath(f).map((n) => end(webSaid(n.text)));
  const { text, said } = storyText(webSaid(f.title), [end(webSaid(f.who)), ...lines]);
  const rest = webPlain(f.title).includes(':') ? webPlain(f.title).split(':').slice(1).join(':').trim().replace(/[«»]/g, '') : '';
  const restAsks = rest ? [`como funciona ${rest}`, `el flujo de ${rest}`, `como es el camino para ${rest}`, `quien hace que para ${rest}`] : [];
  out.push({ ...base, id: prefix, kind: 'flowStory', q: [...storyAsks(webPlain(f.title).replace(/[«»]/g, '')), ...restAsks], doc: `${webPlain(f.title)}. ${webPlain(f.who)}`, a: text, ...(said - 1 < lines.length ? { cursor: said - 1 } : {}) });
  f.know.forEach((k, i) => {
    if (hasReceiptCode(k)) return;
    out.push({ ...base, id: `${prefix}:saber:${i}`, kind: 'item', q: askedLabels(webPlain(k)), doc: `${webPlain(f.title)}. ${webPlain(k)}`, a: end(webSaid(k)) });
  });
  return [...out, ...facetEntries(f, base, prefix)];
}

function webEntries(): Entry[] {
  return [...webSections().flatMap(webSectionEntries), ...webFlows().flatMap(webFlowEntries)];
}

function curatedEntries(list: Answer[], file: (a: Answer) => string): Entry[] {
  // A curated answer of the web (its id says so, or its button is a web or Atención screen) is of that domain.
  const domainOf = (x: Answer): Domain => {
    const d = domainOfScreen(x.go);
    return d && d !== 'equipo' ? d : /(?:^|-)atencion(?:-|$)/.test(x.id) ? 'atencion' : /(?:^|-)web(?:-|$)/.test(x.id) ? 'web' : 'equipo';
  };
  return list.map((x) => ({ id: `curado:${x.id}`, kind: 'curated' as const, source: `curado:${file(x)}`, roles: x.roles, q: x.q, a: x.a, domain: domainOf(x), ...(x.go ? { go: x.go } : {}), ...(x.tutorial ? { tutorial: x.tutorial } : {}) }));
}

// ── The index ──────────────────────────────────────────────────────────────────────────────────────────────────────

// roles: only for whoever is told that text (a curated entry's answer per role); unset = whoever gets the entry.
// quoted: the label a way of asking is about («¿Qué significa «Sube el material»?»), when it is most of it.
type Doc = { entry: number; toks: Tok[]; total: number; kind: 'q' | 'doc'; labels: string[]; weight: number; label: boolean; text: string; ask: AskKind | null; quoted?: string; roles?: Role[]; web?: boolean };
// What a kind's text weighs as an answer: a line of the job or the day says less than a screen, a task or a question.
const KIND_WEIGHT: Partial<Record<Kind, number>> = { job: 0.85, day: 0.85, with: 0.95, flow: 0.95, never: 0.95, line: 0.9 };
type Index = { entries: Entry[]; docs: Doc[]; byKey: Map<string, number[]>; idf: Map<string, number>; unknown: number; idfAll: Map<string, number>; unknownAll: number; labels: Map<string, number[]>; byId: Map<string, Entry>; asked: Map<string, Entry[]>; defines: Set<string>; whoLabels: RegExp | null; said: Set<string>; saidAll: Set<string> };

let INDEX: Index | null = null;

/** Each text a curated entry says, with who is told it (unset: everyone who gets the entry). */
function saidBy(e: Entry): [string, Role[] | undefined][] {
  if (typeof e.a === 'string') return [[e.a, undefined]];
  const a = e.a;
  const all: Role[] = e.roles ?? [...TEAM_ROLES, 'admin'];
  const keyed = all.filter((r) => typeof a[r] === 'string');
  const out: [string, Role[] | undefined][] = keyed.map((r) => [a[r]!, [r]]);
  const rest = all.filter((r) => !keyed.includes(r));
  if (a.default && rest.length) out.push([a.default, rest]);
  return out;
}
const key = (root: string) => root.slice(0, 4);

/** The entries, built once (the guides and the curated answers do not change while the server runs). */
export function allEntries(): Entry[] {
  return index().entries;
}

// The client's words (config/clients, guides/web/words.ts: the program's, the paper's, the official site's and the
// organization's names) where the help content writes their huecos: filled in the ways of asking and in what an entry
// says, so «¿qué es el …?» with that name matches the entry that names it. Its answer keeps the hueco: 360 fills it when
// it says it (text.ts fillHuecos), as it fills [APP] or [JEFE].
const withWords = (t: string, w: ClientWords) => (UNFILLED_HUECO.test(t) ? fillClientWords(t, w) : t);
function withClientWords(e: Entry, w: ClientWords): Entry {
  const q = e.q.map((x) => withWords(x, w));
  const doc = e.doc === undefined ? undefined : withWords(e.doc, w);
  return q.some((x, k) => x !== e.q[k]) || doc !== e.doc ? { ...e, q, ...(doc !== undefined ? { doc } : {}) } : e;
}
/** A text of the help content as the index reads it: with the client's words in place of their huecos. */
export function indexedText(text: string): string {
  return withWords(text, clientWords());
}

function index(): Index {
  if (INDEX) return INDEX;
  // The file of each curated entry, for its source tag.
  const files = new Map<Answer, string>(Object.entries(ANSWER_FILES).flatMap(([f, list]) => list.map((a): [Answer, string] => [a, f])));
  const words = clientWords();
  const filled = (t: string) => withWords(t, words);
  const entries = [...curatedEntries(ANSWERS, (a) => files.get(a) ?? 'respuestas'), ...guideEntries(), ...sharedEntries(), ...glossaryEntries(), ...flowEntries(), ...teamFlowStories(), ...adminEntries(), ...webEntries()]
    .map((e) => withClientWords(e, words))
    // (The word «Web y Atención» of «Palabras de la app» is the web's: asked with Atención's words, «¿qué son las vencidas
    // en Atención?», it weighs them as the web's guide does, and its meaning does not answer what the guide says.)
    .map((e): Entry => (e.domain ? e : { ...e, domain: e.id === 'palabra:web-y-atencion' ? 'web' : 'equipo' }));
  const saidOf = (e: Entry) => saidBy(e).map(([t, roles]): [string, Role[] | undefined] => [filled(t), roles]);
  // How much each word says: document frequency per root, over the entries (each entry once). Two tables: the team's
  // entries are weighed among themselves, so the web's and Atención's guide and the flows told as stories (WF-C) never
  // change a team question's scores; the web's entries, among all of them, as one index.
  const weights = (list: Entry[]) => {
    const df = new Map<string, number>();
    for (const e of list) for (const r of new Set([...e.q, e.doc ?? '', ...(e.kind === 'curated' ? saidOf(e).map(([t]) => t) : [])].flatMap((t) => tokens(t)))) df.set(r, (df.get(r) ?? 0) + 1);
    const n = list.length;
    const idf = new Map<string, number>();
    for (const [r, c] of df) idf.set(r, Math.log(1 + n / c));
    // A word only some ways of asking have, and no answer or guide text says («Kevin», «la ermita», «chamo»): an example
    // detail of how it was asked, not what it is about. It weighs like a common word.
    const said = new Set(list.flatMap((e) => [e.doc ?? '', ...(e.kind === 'curated' ? saidOf(e).map(([t]) => t) : [filled(typeof e.a === 'string' ? e.a : textFor(e.a, [...TEAM_ROLES, 'admin']))])]).flatMap((t) => tokens(t)));
    const common = [...idf.values()].sort((a, b) => a - b)[Math.floor(idf.size * DETAIL_AT)] ?? 1;
    for (const [r, w] of idf) if (!said.has(r) && w > common) idf.set(r, common);
    return { idf, said, n };
  };
  // (The team's: every entry but the web's guide, its curated answers and the flows told as stories, WF-C.)
  const teamOnly = (e: Entry) => !e.source.startsWith('web:') && e.source !== 'curado:web' && e.kind !== 'flowStory';
  const { idf, said, n } = weights(entries.filter(teamOnly));
  const all = weights(entries);
  const weighOf = (table: Map<string, number>, size: number) => (r: string): Tok => ({ root: r, w: r in LIGHT ? LIGHT[r] : table.get(r) ?? Math.log(1 + size), light: r in LIGHT });
  const weighTeam = weighOf(idf, n);
  const weighAll = weighOf(all.idf, all.n);
  const docs: Doc[] = [];
  const byKey = new Map<string, number[]>();
  const labels = new Map<string, number[]>();
  // «Label»: what it is. The entries that say what a label is, as `entry label`.
  const defines = new Set<string>();
  entries.forEach((e, k) => {
    for (const m of filled(`${e.doc ?? ''} ${typeof e.a === 'string' ? e.a : (e.a.default ?? '')}`).matchAll(/«([^«»]{3,60})»:/g)) defines.add(`${k} ${readable(m[1])}`);
    const web = e.domain === 'web' || e.domain === 'atencion';
    const weigh = web ? weighAll : weighTeam;
    const add = (text: string, kind: 'q' | 'doc', roles?: Role[]) => {
      const toks = tokens(kind === 'doc' ? text.replace(/“[^”]*”/g, ' ') : text).map(weigh);
      if (!toks.length) return;
      const label = kind === 'q' && (e.kind === 'item' || e.kind === 'step' || e.kind === 'line' || e.kind === 'flow');
      const weight = label ? 0.8 : e.q.length || kind === 'q' ? 1 : (KIND_WEIGHT[e.kind] ?? 1);
      const named = kind === 'q' ? labelsOf(text)[0] : undefined;
      const quoted = named && tokens(named).length * 5 >= toks.length * 3 ? readable(named) : undefined;
      const d = docs.push({ entry: k, toks, total: toks.reduce((s, t) => s + t.w, 0), kind, labels: [], weight, label, text, ask: kind === 'q' ? askKind(readable(text)) : null, ...(quoted ? { quoted } : {}), ...(roles ? { roles } : {}), ...(web ? { web } : {}) }) - 1;
      for (const t of toks) {
        const list = byKey.get(key(t.root)) ?? [];
        if (list.at(-1) !== d) list.push(d);
        byKey.set(key(t.root), list);
      }
    };
    for (const q of e.q) add(q, 'q');
    if (e.doc) add(e.doc, 'doc');
    // What a curated entry answers says the asked words too (design §A): one way, per role, as a guide's text does.
    if (e.kind === 'curated') for (const [text, roles] of saidOf(e)) add(text, 'doc', roles);
    // The screen's labels it quotes (two words or more): asked by name, they point here.
    for (const l of new Set([...labelsOf(e.doc ?? ''), ...labelsOf(filled(typeof e.a === 'string' ? e.a : '')), ...e.q.flatMap(labelsOf)])) {
      const p = readable(labelWords(l));
      if (p.split(' ').length < 2 || p.length < 8) continue;
      labels.set(p, [...(labels.get(p) ?? []), k]);
    }
  });
  // Each way of asking, word for word: asked exactly like that, it is the answer.
  const asked = new Map<string, Entry[]>();
  for (const e of entries) for (const q of e.q) asked.set(readable(q), [...(asked.get(readable(q)) ?? []), e]);
  // The labels that say «quién» («Quién graba»): named in a question, they do not make it a «¿quién…?».
  const who = [...labels.keys()].filter((l) => /\bquien(?:es)?\b/.test(l));
  const whoLabels = who.length ? new RegExp(`\\b(?:${who.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'g') : null;
  INDEX = { entries, docs, byKey, idf, unknown: 0.6 * Math.log(1 + n), idfAll: all.idf, unknownAll: 0.6 * Math.log(1 + all.n), labels, byId: new Map(entries.map((e) => [e.id, e])), asked, defines, whoLabels, said, saidAll: all.said };
  return INDEX;
}

/** An entry by its id (a step's next one). */
export function entryById(id: string): Entry | undefined {
  return index().byId.get(id);
}

/** What a screen is for, for these roles (its «screen» entry: «¿qué es esto?» on it). */
export function entryForScreen(screen: string, roles: Role[]): Entry | undefined {
  const path = screen.split('?')[0];
  const ix = index();
  // Administración on «Atención» sees «Áreas y plazos», never the inbox (ADMIN_SCREEN_ENTRY).
  const adminOwn = roles.includes('admin') && !roles.includes('boss') ? ADMIN_SCREEN_ENTRY[path] : undefined;
  const own = adminOwn ? ix.byId.get(adminOwn) : undefined;
  if (own && forRoles(own, roles)) return own;
  return ix.entries.find((e) => e.kind === 'screen' && e.screen === path && forRoles(e, roles)) ?? ix.entries.find((e) => e.kind === 'screen' && !!e.also?.includes(path) && forRoles(e, roles));
}

// ── The domain of a question (design §4(d)3) ───────────────────────────────────────────────────────────────────────
// The words that make a question the web's or Atención's, read on readable() text. Only words the team's own help never
// uses that way: «la web», «noticia», «redirección», «vista previa»…; «solicitudes», «ciudadano», «bandeja», «denuncias»,
// «comprobante», «AC-…», «coordinación»… Never «bloque» (the storyboard's), «borrador» (a ficha's), «portada» (a reel's),
// «solicitud» or «la denuncia» alone (a ficha comunitaria's type and field), «área» alone («el área de Redes»).
const WEB_DOMAIN = new RegExp(
  String.raw`\b(?:la web|de la web|en la web|(?:en|de|mi|tu|el|del|al) web|web y atencion|pagina web|paginas web|sitio web|web publica|web oficial|web vieja|menu web|noticias?|comunicados?|columnas? de opinion|redirecci\w*|ajustes del sitio|vista previa|editor de la web|aprobador de la web|publicar ahora|devolver con comentario|devuelto con comentario|cambios sin publicar|desarchiv\w*|volver a esta version|texto alternativo|punto de interes|avisos? de servicio|episodios?|indicadores?|obras y acciones|gestion y obras|transparencia|paginas? legales|canales oficiales|semanario|pie de pagina|portada de la web)\b`,
);
const ATTENTION_DOMAIN = new RegExp(
  String.raw`\b(?:atencion ciudadana|menu atencion|(?:en|a) atencion(?! a\b)|(?:registro|cifras|mapa|bandeja|tablero|plazos|areas|roles?) de atencion|solicitudes|solicitud (?:de la gente|de la web|ciudadana|de la persona|de alguien|que llego|que llega)|ciudadan\w*|bandeja|denuncias|una denuncia|operador de denuncias|comprobantes?|consultar mi solicitud|casos? atendidos?|coordinacion|coordinador\w* de atencion|responsables? de area|areas y plazos|auditoria|fecha comprometida|respuestas? guardadas?|notas? internas?|respuesta a la persona|pedido de informacion|requiere informacion|no procede|derivad[oa]s?|reportes? parecidos|casos? iguales|lo que (?:manda|escribe|reporta|pide) la gente|la gente (?:que escribe|que manda|manda|reporta|escribe)|que (?:manda|mandan|escribe|escriben|reporta|reportan|pide|piden) la gente|observacion(?:es)? (?:sobre|de) (?:una|la|esta|las) obras?|ac \d{4})\b|(?<!\ben )\b(?:el|los) casos?\b|\b(?:un|cada|del|al|mis|sus) casos?\b`,
);
// The team's own things: on a screen of the web, a question that names them is the team's («¿cómo apruebo una pieza?»).
const TEAM_DOMAIN = /\b(?:pieza|piezas|reel|reels|tweet|tweets|storyboard|fichas?|eventos?|agenda|copy|feed|semaforo|grabacion|tanda|municipios|obras del ivt)\b/;

/**
 * The domain a question is about: the web's or Atención's when it says so by its words (both: Atención's, the more
 * particular), else the screen the person is on (one of the web's or Atención's), unless the question names the team's
 * own things; null when nothing says either (the team's, as today: the old banks do not move).
 */
export function domainOf(question: string, screen?: string | null): 'web' | 'atencion' | null {
  const t = readable(String(question ?? '').replace(/«[^«»]*»/g, (m) => ` ${m.slice(1, -1)} `));
  const att = ATTENTION_DOMAIN.test(t);
  const web = WEB_DOMAIN.test(t);
  if (att) return 'atencion';
  if (web) return 'web';
  if (TEAM_DOMAIN.test(t)) return null;
  const s = domainOfScreen(screen);
  return s === 'web' || s === 'atencion' ? s : null;
}

/** Every label (in «») the help content quotes, as plain words: the screen's own names, never an event's. */
export function knownLabels(): string[] {
  return [...index().labels.keys()];
}

// ── Matching ───────────────────────────────────────────────────────────────────────────────────────────────────────

// The thresholds (tuned on the TRAIN banks, design §A): strong answers on their own; weak only competes with the
// fichas and never beats «No estoy seguro…» alone.
export const STRONG = 0.62;
export const WEAK = 0.45;
// What the other kind of match adds to an entry's best (a way of asking and its text, design §A).
const ALSO_SAID = 0.25;
// «¿Qué es X?» where X is a word of «Palabras de la app» and nothing more («¿qué es copy?», «¿qué significa trancado?»,
// «¿para qué sirve el semáforo?»): what it means goes first, before an answer that only uses the word («No escribo
// copies sueltos…»), unless an answer for that person was written for exactly that question (termAsked, ownExact). A
// question that names more («¿qué es «Copy faltante»?», «¿qué significa «Sin programar»?») gets no such lift, and a
// question that does not ask what a word means («¿cómo hago un copy?», «¿cómo funciona el semáforo?») gets the task or
// the answer that says how, with the meaning a bit behind and never sure by itself (TERM_SURE); a «¿dónde…?» («¿dónde veo
// las etiquetas?»), the answer that says where, with the meaning further behind: it still answers when nothing says
// where («¿dónde está la oficina?») (12/11, 13/11).
const TERM_ASKED = 0.3;
const TERM_ELSE = 0.88;
const TERM_WHERE = 0.75;
// A question that does not say any of the word's names, only a word with the same root («¿qué es el título?»: «Titular»
// is a part of the art): another word, far behind and never sure.
const TERM_OTHER = 0.8;
const TERM_WHAT = /\b(?:que es|que son|que significa\w*|que quiere decir|que quieren decir|paraque es|paraque son|paraque sirven?)\b/;
// Where a word that only ways of asking have is capped: the weight of the word at this share of the index (a common one).
const DETAIL_AT = 0.2;
// The domain's weights (design §4(d)3): an entry of the question's own domain adds, one of the other public domain (the
// web for Atención, Atención for the web) adds less, the team's for a question of the web or Atención weighs less, and
// the web's or Atención's for a question of neither weighs less too.
const SAME_DOMAIN = 0.04;
const SIBLING_DOMAIN = 0.02;
const OTHER_DOMAIN = 0.8;
const NO_DOMAIN = 0.88;

// names: words of names in the question (an event's, a piece's or a place's title, a person of the team): left out unless
// the help content says them («la entrega» of Grabación stays; «El Mirador», «Kevin» go).
// domain: the web's or Atención's when the question is about them (domainOf); unset, it is read from the question and the
// screen; null, none.
export type FindOptions = { roles: Role[]; screen?: string | null; limit?: number; extra?: string; names?: string[]; domain?: 'web' | 'atencion' | null };

// A question about what something is or where («¿qué es…?», «¿qué sale en…?»): a label named whole is what it asks.
const WHAT_IS = /\b(?:que es|que son|que significa\w*|que quiere decir|que sale en|que hay en|que dice|paraque sirve|paraque es|donde esta|donde veo|que hago en|como (?:uso|funciona))\b/;
// A question that asks what, how, where, who… (not yes or no), maybe after a word that opens it («vale y cómo sé si…»).
const WH_ASK = /^(?:(?:y|e|pero|entonces|oye|vale|ok|okey|bueno|mira|chamo|epa|aja|ya|disculpa|perdon) )*(?:que|como|donde|cuando|quien|quienes|cual|cuales|cuanto|cuantos|cuantas|por que|paraque|de que|en que|a que|con que)\b/;
// Someone named in an answer: a role, the boss, administración.
// (Also the people of the web and of Atención, for the boss's and Administración's «¿quién…?»: «quienes atienden su
// caso», «la coordinación», «el aprobador de la web».)
const NAMES_SOMEONE = /\b(?:jefe|despacho|politica|ivt|grabacion|redes|administracion|solo el|nadie|cualquiera|todos|todo el equipo|coordinacion|coordinador\w*|responsables? de(?:l)? area|operador de denuncias|auditoria|editor(?:es)? de la web|aprobador\w*|quien aprueba|quienes atienden|cualquier persona)\b/;
// An answer in «tú» names the person who asks («Tú, en Ajustes → Equipo…», «Lo haces tú…»).
const NAMES_YOU = /(?<![\p{L}])tú(?![\p{L}])/iu;
const forRoles = (e: Entry, roles: Role[]) => e.roles === null || e.roles.some((r) => roles.includes(r));

/** The text of an entry for these roles: the asker's role key (team order, administración last), else `default`. */
export function textFor(a: AnswerText, roles: Role[]): string {
  if (typeof a === 'string') return a;
  for (const r of [...TEAM_ROLES, 'admin' as const]) if (roles.includes(r) && typeof a[r] === 'string') return a[r]!;
  return a.default ?? Object.values(a).find((x): x is string => typeof x === 'string') ?? '';
}

/**
 * The entries that answer a question, best first, for these roles: each paraphrase scored by how much of the question
 * it has and how much of it the question has (rare words weigh more), a bonus for two words in a row as asked and for
 * a label of the screen named whole, a small one on the screen the person is on; what an entry says (`doc`) counts one
 * way and less. `extra`: topic words of the question before (a follow-up), at half weight.
 */
const PROFILE = rootOf('perfil');
// The kinds of thing a label names («la lista…», «el botón…», «la pestaña…»).
const LABEL_KIND = new Set(['lista', 'boton', 'pestaña', 'casilla', 'seccion', 'pantalla', 'chip', 'opcion', 'campo', 'menu', 'aviso', 'tarjeta'].map((w) => rootOf(plain(w))));
// What is asked, weighed (the follow-up's words at half), and its pairs of words in a row.
type Asked = { toks: { root: string; w: number }[]; total: number; pairs: string[]; text: string; own: string[]; kind: AskKind | null };
function askedOf(question: string, extra?: string, names?: string[], web = false): Asked | null {
  const ix = index();
  // (The words of a question weigh, for the web's entries, as all the entries weigh them: index() above.)
  const table = web ? ix.idfAll : ix.idf;
  const unknown = web ? ix.unknownAll : ix.unknown;
  // A word the index does not know, said as a diminutive («los numeritos», «la cosita»), is its word.
  const dim = new Map<string, string>();
  for (const w of readable(question).split(' ')) {
    const r = rootOf(w);
    if (r in LIGHT || ix.idf.has(r)) continue;
    const u = undiminished(w);
    if (u && ix.idf.has(u)) dim.set(r, u);
  }
  const skip = new Set((names ?? []).flatMap((w) => tokens(w)).filter((r) => !(web ? ix.saidAll : ix.said).has(r)));
  const all = [...new Set(tokens(question).map((r) => dim.get(r) ?? r))];
  // Without the names, unless less than two words that say something are left (then the name is what it is about).
  const own = all.filter((r) => !skip.has(r) && !(r in LIGHT)).length >= 2 ? all.filter((r) => !skip.has(r)) : all;
  // «Mi nombre», «mi teléfono», «mis avisos»: the person's own things live in Mi perfil (not «el nombre» of a category).
  const mine = own.some((r, k) => r === 'mio' && /^(?:nomb|tele|mail|abis|foto|cuen|dato)/.test(own[k + 1] ?? '')) && !own.includes(PROFILE);
  const more = [...(extra ? tokens(extra).filter((t) => !own.includes(t)) : []), ...(mine ? [PROFILE] : [])];
  const weigh = (r: string, half = false) => (r in LIGHT ? LIGHT[r] : table.get(r) ?? unknown) * (half ? 0.5 : 1);
  // The verb of a «¿cómo…?» is what is asked to do («¿cómo apruebo una pieza en rojo?» is about approving): it weighs
  // more than the things around it.
  const verb = /\bcomo (?:(?:se|le|lo|la|los|las|les|me|te|nos) )*([a-z]{3,})/.exec(readable(question))?.[1];
  const head = verb && !STOP.has(verb) ? rootOf(verb) : null;
  const toks = [...own.map((r) => ({ root: r, w: weigh(r) * (r === head ? HEAD : 1) })), ...more.map((r) => ({ root: r, w: weigh(r, true) }))];
  // Only the light words, or nothing: no real question (a «¿dónde?» alone).
  if (!toks.length || toks.every((t) => t.root in LIGHT)) return null;
  const text = readable(question);
  const kind = askKind(ix.whoLabels ? text.replace(ix.whoLabels, ' ') : text);
  return { toks, total: toks.reduce((n, t) => n + t.w, 0), pairs: own.slice(1).map((r, k) => `${own[k]} ${r}`), text, own: own.filter((r) => !(r in LIGHT)), kind };
}

// The light words that only say the kind of question (the kind decides those).
const KIND_WORD = new Set(['donde', 'quien', 'quienes', 'cuando', 'porque', 'paraque']);
// How well one text answers: a way of asking ('q') both ways, what an entry says ('doc') one way and less.
function scoreDoc(a: Asked, toks: Tok[], total: number, kind: 'q' | 'doc', ask: AskKind | null = null): number {
  let got = 0;
  let found = 0;
  let first = toks.length;
  let last = -1;
  const seen = new Array<number>(toks.length).fill(0);
  for (const t of a.toks) {
    let m = 0;
    let at = -1;
    toks.forEach((u, k) => {
      const l = likeness(t.root, u.root);
      if (l > m) [m, at] = [l, k];
    });
    if (!m) continue;
    // A word said another way («acto» / «evento») says as much as the commoner of the two.
    got += (m < 1 ? Math.min(t.w, toks[at].w) : t.w) * m;
    if (!(t.root in LIGHT) || t.root === 'no') {
      found++;
      first = Math.min(first, at);
      last = Math.max(last, at);
    }
    seen[at] = Math.max(seen[at], m);
  }
  if (!found) return 0;
  const cq = got / a.total;
  let s: number;
  if (kind === 'q') {
    // How much of the paraphrase the question has: what is asked weighs more (F with beta 1.5).
    const cp = toks.reduce((n, u, k) => n + u.w * seen[k], 0) / total;
    // A long question has words no way of asking has (the story around it): the more it says, the more a way of asking
    // that it says whole counts (beta from 1.5 down to 1).
    const b2 = a.own.length >= 6 ? 1 : a.own.length >= 5 ? 1.5 : 2.25;
    s = cq && cp ? ((1 + b2) * cq * cp) / (b2 * cp + cq) : 0;
    // A way of asking of another kind («¿por qué no…?», «¿quién…?», «¿dónde…?» for a «¿cómo…?»): less; of the same
    // kind, a little more. A light word of time or of one's own on one side only («después», «mío»): a little less. A
    // «no» on one side only is another question altogether («no sube el video» is a problem, «¿cómo subo un video?» a
    // how-to).
    const other = toks.filter((u) => u.light && !KIND_WORD.has(u.root) && !a.toks.some((t) => t.root === u.root)).length;
    const neg = toks.some((u) => u.root === 'no') !== a.toks.some((t) => t.root === 'no');
    s *= Math.pow(0.9, Math.min(2, other)) * (neg ? 0.85 : 1) * kindFit(a.kind, ask);
    if (s && a.kind && a.kind === ask) s += SAME_KIND;
  } else {
    // A long text has many words: it answers one way, at a discount that grows with its length, and better when the
    // words asked are close together in it.
    const density = found / Math.max(1, last - first + 1);
    s = cq * 0.78 * Math.min(1, Math.pow(14 / Math.max(toks.length, 1), 0.3)) * (0.85 + 0.15 * density);
  }
  const text = ` ${toks.map((u) => u.root).join(' ')} `;
  return s + (kind === 'q' ? 0.06 : 0.03) * a.pairs.filter((p) => text.includes(` ${p} `)).length;
}

/**
 * The entries that answer a question, best first, for these roles: each paraphrase scored by how much of the question
 * it has and how much of it the question has (rare words weigh more), a bonus for two words in a row as asked and for
 * a label of the screen named whole, a small one on the screen the person is on; what an entry says (`doc`) counts one
 * way and less. `extra`: topic words of the question before (a follow-up), at half weight.
 */
export function findAnswers(question: string, opts: FindOptions): Match[] {
  // The domain of the whole question (its parts are read with it).
  const o: FindOptions = opts.domain !== undefined ? opts : { ...opts, domain: domainOf(question, opts.screen) };
  const whole = rank(question, o);
  const parts = partsOf(question);
  if (!parts.length) return whole;
  // Two questions in one, or a long story with the question in one sentence («redes puede ver mis reportes? no quiero q
  // vean los datos de la gente»), or what an error says («me sale un error que dice que…»): each part is matched on its
  // own too, a little lower than the whole; an entry keeps its best.
  const by = new Map<string, Match>(whole.map((m) => [m.entry.id, m]));
  for (const p of parts)
    for (const m of rank(p, { ...o, limit: 4 })) {
      const s = m.score * PART;
      const was = by.get(m.entry.id);
      if (!was || s > was.score) by.set(m.entry.id, { ...m, score: s, confidence: s >= STRONG ? 'strong' : s >= WEAK ? 'weak' : 'none' });
    }
  return [...by.values()].sort((a, b) => b.score - a.score).slice(0, o.limit ?? 8);
}

// What a part of a question weighs against the whole.
const PART = 0.95;
// What an error or a sign says, after «dice (que)»: what it is about.
const SAYS = /\b(?:error|mensaje|aviso|letrero|cartel|cuadro|cuadrito|alerta|texto|rojo)\b[^?.!]*?\b(?:dice|decia|dijo|sale|salio|pone)(?: que)? (.+)$/;
/** The parts of a question worth matching alone (its sentences, the clauses of a long one, what an error says). */
function partsOf(question: string): string[] {
  const t = plain(question);
  const out: string[] = [];
  const said = SAYS.exec(readable(question))?.[1];
  if (said && tokens(said).length >= 2) out.push(said);
  const pieces = String(question ?? '')
    .split(/[?¿!¡.;]+|,\s+(?=\S+(?:\s+\S+){2,})/)
    .map((x) => x.trim())
    .filter((x) => x && plain(x) !== t && tokens(x).filter((r) => !(r in LIGHT)).length >= 2);
  if (pieces.length >= 2 || (pieces.length === 1 && out.length)) out.push(...pieces.slice(0, 3));
  else if (pieces.length === 1 && plain(pieces[0]).length < t.length - 8) out.push(pieces[0]);
  return [...new Set(out)];
}

/**
 * Whether a question asks what this word of the glossary means and nothing more: without its frame («¿qué es…?», «¿para
 * qué sirve…?»), the words that open it («y», «oye», «exactamente») and the articles before the word («el feed», «eso de
 * trancado», «la palabra trancado»), what is left is one of the word's names, whole, as it is said («¿qué es programado?»
 * is not «programar»: política's reports have a state «Programado»). A label or a field that only has the word is
 * another question: «¿qué significa «Sin programar»?», «¿qué es lo que va a decir en el storyboard?», «¿qué es lo que
 * tengo que hacer con el copy?»; so is another word with the same root («¿qué es el título?» is not «Titular»).
 */
const TERM_OPEN = new Set(['y', 'e', 'pero', 'entonces', 'oye', 'bueno', 'ok', 'okey', 'aja', 'ya', 'hola', 'mira', 'chamo', 'chama', 'epa', 'vale', 'disculpa', 'perdon', 'pues', 'por', 'favor', 'me', 'dices', 'dime', 'sabes', 'exactamente', 'realmente', 'aqui', 'algo']);
const TERM_LEAD = /^(?:(?:el|la|los|las|un|una|unos|unas|lo|eso|esto|ese|esa) )*(?:(?:de|del) )?(?:(?:palabra|palabrita|termino) )?(?:(?:el|la|los|las|lo|un|una) )?/;
// A name as it is said (first), and a one-word name with one more or one less «s» or «es» («cupos», «guiones», «sello»):
// said in a question, it is the word. Asked what it means, only the name as it is: «¿qué son las programadas?» asks for
// the board's «Programadas», not for «programar».
const nameForms = new Map<string, string[]>();
function formsOf(n: string): string[] {
  let f = nameForms.get(n);
  if (!f) {
    const r = readable(n);
    f = r.includes(' ') ? [r] : [...new Set([r, `${r}s`, `${r}es`, r.replace(/es$/, ''), r.replace(/s$/, '')])].filter((x) => x.length >= 2);
    nameForms.set(n, f);
  }
  return f;
}
/** Whether a question says one of the word's names (a word that only shares a root, «título» for «Titular», does not). */
function saysName(e: Entry, text: string): boolean {
  return (e.names ?? []).some((n) => formsOf(n).some((f) => ` ${text} `.includes(` ${f} `)));
}
function termAsked(e: Entry, a: Asked): boolean {
  const frame = TERM_WHAT.exec(a.text);
  if (!frame) return false;
  const rest = `${a.text.slice(0, frame.index)} ${a.text.slice(frame.index + frame[0].length)}`.split(' ').filter((w) => w && !TERM_OPEN.has(w)).join(' ');
  const asked = `${rest} `.replace(TERM_LEAD, '').trim();
  return !!asked && (e.names ?? []).some((n) => formsOf(n)[0] === asked);
}
/**
 * The word of «Palabras de la app» a question asks the meaning of, by one of its names and nothing more (step W of the
 * demo brain: «¿qué es el feed?», «explícame qué es un copy», «¿qué significa trancado en la app?»), for these roles;
 * null when it asks anything else, or when an answer for this person was written for exactly that question (it says it
 * better: «¿qué es el feed?» of the IVT is «Son cosas de Redes…»).
 */
export function askedTerm(question: string, roles: Role[]): Entry | null {
  const ix = index();
  const a = askedOf(question);
  if (!a) return null;
  // (Only the team's own: a section of the web's guide titled like the word, «Programar», is the web's, asked with it.)
  if ((ix.asked.get(a.text) ?? []).some((x) => x.kind !== 'term' && (x.domain ?? 'equipo') === 'equipo' && forRoles(x, roles))) return null;
  // Without the polite words before it and where it is said after it («… en la app», «… en Redes»).
  const text = a.text
    .replace(/^(?:(?:y|e|oye|bueno|mira|chamo|porfa|por favor) )*(?:explicame|explica|explicanos|dime|me dices|me explicas|sabes|quisiera saber|quiero saber|me puedes decir|podrias decirme)\b\s*/, '')
    .replace(/ (?:en|de|del) (?:la app|la aplicacion|redes|el panel|la pantalla|aqui)$/, '')
    .trim();
  const quoted = labelsOf(question).map((l) => readable(l));
  for (const t of [a.text, text]) {
    const at = { ...a, text: t };
    const e = ix.entries.find((x) => x.kind === 'term' && forRoles(x, roles) && saysName(x, t) && termAsked(x, at) && (!quoted.length || quoted.some((l) => (x.names ?? []).some((n) => formsOf(n).includes(l)))));
    if (e) return e;
  }
  return null;
}

// The kinds of question a word's meaning answers for sure: what it is, where it is (when nothing says where) and the
// word alone. Any other («¿cómo hago un reel?», «¿puedo cambiar el copy?», «¿quién arma el feed?», «¿cuántos reels…?»,
// «no me sale el feed»): the meaning only backs up another answer, never a sure one by itself (13/11).
const TERM_SURE = new Set<AskKind | null>(['what', 'where', null]);

function rank(question: string, o: FindOptions): Match[] {
  const ix = index();
  const a = askedOf(question, o.extra, o.names);
  // The same question weighed for the web's entries (index(): two tables of weights).
  const aw = a && (o.roles.includes('boss') || o.roles.includes('admin')) ? askedOf(question, o.extra, o.names, true) ?? a : a;
  if (!a) {
    // Only light words («¿qué no debo hacer nunca?», «¿qué no hago yo?»): a way of asking said exactly like that, maybe
    // without its «nunca» or «yo», is still the answer.
    const t = readable(question);
    const same = ix.asked.get(t) ?? ix.asked.get(t.replace(/\b(?:nunca|jamas|yo|aqui|nada|entonces)\b/g, ' ').replace(/\s+/g, ' ').trim()) ?? [];
    return same.filter((e) => forRoles(e, o.roles)).slice(0, o.limit ?? 8).map((e) => ({ entry: e, score: STRONG + 0.1, confidence: 'strong' as const, text: textFor(e.a, o.roles), via: t }));
  }
  // Candidates: the docs that share a key with a word asked.
  const cand = new Set<number>();
  for (const t of a.toks) for (const d of ix.byKey.get(key(t.root)) ?? []) cand.add(d);
  // One word that says something («¿y dónde queda eso?», «¿qué es la receptividad?») answers strongly only from a way of
  // asking (a question or a title), never from a text that happens to have it.
  const oneWord = a.toks.filter((t) => !(t.root in LIGHT)).length <= 1;
  // A short question (up to three words that say something): every one of them counts. A text, or a button's name, that
  // lacks one is no sure answer («¿cómo pido cambios en un copy?» is not «¿Pedir cambios también?» of the design).
  const short = a.own.length <= 3;
  // Per entry, its best way of asking and its best text, each with whether it lacks a word of a short question.
  const byQ = new Map<number, [number, boolean, number]>();
  const byDoc = new Map<number, [number, boolean, number]>();
  for (const d of cand) {
    const doc = ix.docs[d];
    if (!forRoles(ix.entries[doc.entry], o.roles) || (doc.roles && !doc.roles.some((r) => o.roles.includes(r)))) continue;
    // A way of asking about a label («¿Qué significa «Sube el material»?») is for a question that names it whole. (A
    // question of the web or of Atención weighs its words as all the entries do, for every answer: comparable.)
    const s = scoreDoc((doc.web || o.domain) && aw ? aw : a, doc.toks, doc.total, doc.kind, doc.ask) * doc.weight * (doc.quoted && !` ${a.text} `.includes(` ${doc.quoted} `) ? 0.85 : 1);
    if (!s) continue;
    const has = a.own.filter((r) => doc.toks.some((u) => likeness(r, u.root) > 0)).length;
    // A short question: a text or a button's name must say every word of it; a way of asking, at least half of them.
    const lacks = short && ((doc.kind === 'doc' || doc.label) ? has < a.own.length : a.own.length >= 3 && has * 2 < a.own.length);
    const into = doc.kind === 'q' ? byQ : byDoc;
    const was = into.get(doc.entry);
    if (!was || s > was[0]) into.set(doc.entry, [s, lacks, d]);
  }
  // An entry is as good as its best match, and a little better when the other kind says it too (a way of asking and
  // what it answers: the answer that says the asked words is the one asked about).
  const best = new Map<number, number>();
  const via = new Map<number, number>();
  // The entries whose best match lacks a word of a short question: never sure, whatever they add below.
  const partial = new Set<number>();
  for (const k of new Set([...byQ.keys(), ...byDoc.keys()])) {
    const [q, qLacks, qd] = byQ.get(k) ?? [0, false, -1];
    const [t, tLacks, td] = byDoc.get(k) ?? [0, false, -1];
    via.set(k, q >= t ? qd : td);
    let s = Math.max(q, t) + ALSO_SAID * Math.min(q, t);
    // One word that says something answers strongly only from a way of asking, never from a text that has it.
    if (oneWord && t > q) s = Math.min(s, STRONG - 0.01);
    best.set(k, s);
    if (q >= t ? qLacks : tLacks) partial.add(k);
  }
  // A label of the screen asked by name, whole («Hoy en la agenda», «Enviar igual»): its entries go first. A label
  // quoted by many entries says less («Tweets de la semana» is everywhere).
  const quoted = labelsOf(question).map((l) => readable(l));
  for (const [l, list] of ix.labels) {
    if (!` ${a.text} `.includes(` ${l} `)) continue;
    const mine = list.filter((k) => forRoles(ix.entries[k], o.roles));
    // Asked what it is, the label can come after its kind of thing («¿qué es la lista Antes de aprobar?»): that word
    // does not count.
    const total = a.toks.reduce((n, t) => n + (LABEL_KIND.has(t.root) ? 0 : t.w), 0) || a.total;
    const part = tokens(l).reduce((n, r) => n + (a.toks.find((t) => t.root === r)?.w ?? 0), 0) / total;
    // Named after a verb of filling or touching it («¿cómo lleno quién graba?», «¿qué pongo en a dónde se va?»): asked too.
    const filled = new RegExp(`\\b(?:lleno|llenar|pongo|poner|marco|marcar|escribo|escribir|uso|usar|toco|tocar|elijo|elegir|activo|prendo|apago)\\b (?:en |el |la |los |las |lo de )?${l}\\b`).test(a.text);
    if (!quoted.includes(l) && !filled && !(part >= 0.6 && WHAT_IS.test(a.text))) continue;
    const bonus = Math.min(0.24, 0.06 * l.split(' ').length) / Math.sqrt(Math.max(1, mine.length));
    // Asked what it is: the entry that says it («Antes de aprobar»: …) more.
    const what = WHAT_IS.test(a.text);
    for (const k of mine) if (best.has(k)) best.set(k, best.get(k)! + bonus + (what && ix.defines.has(`${k} ${l}`) ? 0.08 : 0));
  }
  const who = a.kind === 'who';
  const wh = WH_ASK.test(a.text);
  const why = /\b(?:por que|porque|paraque)\b/.test(a.text);
  const whereAsk = /\b(?:donde|en que parte|en que pantalla)\b/.test(a.text);
  const explain = /\b(?:como funciona\w*|que es|que son|que significa\w*|paraque sirve|paraque es|que quiere decir)\b/.test(a.text);
  const yesNo = !wh && /\b(?:puedo|podemos|puede|pueden|se puede|es posible|me deja|me dejan|tengo que|hay que|debo|es seguro|esta bien)\b/.test(a.text);
  const howTo = /^(?:y )?como (?!(?:va|van|esta|estan|quedo|salio|es|son)\b)/.test(a.text) || /\b(?:como (?:hago|se hace|le hago|lo hago)|que (?:tengo|hay) que hacer|que hago) para\b/.test(a.text);
  const exactly = new Set(ix.asked.get(a.text) ?? []);
  // An answer for this person written for exactly this question («¿qué es el feed?» of the IVT: «Son cosas de Redes…»;
  // «¿qué es FAB?» of Redes: the copy's formula; «¿qué son los pilares?» of administración: «Los pones tú…»): a word of
  // «Palabras de la app» does not go before it, its meaning stays behind (13/11).
  // (The team's own: a section of the web's guide asked with the word's name, «¿qué es programar?», does not count.)
  const ownExact = [...exactly].some((x) => x.kind !== 'term' && (x.domain ?? 'equipo') === 'equipo' && forRoles(x, o.roles));
  const termSure = TERM_SURE.has(a.kind) && !howTo;
  // The words of «Palabras de la app» asked what they mean by one of their names (below): sure answers.
  const named = new Set<Entry>();
  const out: Match[] = [];
  for (const [k, s0] of best) {
    const e = ix.entries[k];
    let s = s0;
    if (exactly.has(e)) s += 0.05;
    // «¿Quién…?» is answered by someone named, never by what a screen is.
    // (its first clause, after a «No:» or a «Sí,» that a «¿quién…?» does not need: «No: solo el jefe elimina piezas»).
    const first = textFor(e.a, o.roles).replace(/^(?:No|Sí)[.,:]\s*/, '').split(/[.:;]/)[0];
    const namesFirst = NAMES_SOMEONE.test(plain(first)) || NAMES_YOU.test(first);
    if (who && (e.kind === 'screen' || !namesFirst)) s *= 0.72;
    // «¿Cómo…?» is answered by a task or one of its steps (not by a line that happens to have its words).
    if (howTo && (e.kind === 'task' || e.kind === 'step')) s += e.kind === 'task' ? 0.05 : 0.02;
    // …and not by what a screen is (its name shares the words: «¿cómo subo la tanda?» and «Una tanda de tweets»). A section
    // of the web's guide is often the how itself («Programar», «Archivar»): not less.
    if (howTo && e.kind === 'screen' && (e.domain ?? 'equipo') === 'equipo') s *= 0.85;
    // The answer to another kind of question: a «No.» or a «Sí,» to a «¿qué…?» or a «¿quién…?»; a «Porque…» to what
    // does not ask why.
    const said = textFor(e.a, o.roles);
    // «¿Cómo…?» is answered by how, not by who does it («Tú, en Ajustes → Equipo…» answers «¿quién da los roles?»).
    if (a.kind === 'how' && /^(?:Tú|El jefe|Solo el jefe|Redes|Grabación|El despacho|Administración)[,:]/.test(said)) s *= 0.9;
    if (wh && !why && /^(?:No|Sí)[.,:]/.test(said) && !(who && namesFirst)) s *= who ? 0.75 : 0.85;
    // «¿Puedo…?», «¿se puede…?»: an answer that says yes or no first is the direct one.
    else if (yesNo && /^(?:No|Sí)\b/.test(said)) s += 0.05;
    // «¿Dónde…?» is answered by where («En Ajustes → Equipo…», «… → «Nuevo post»»); «¿cómo funciona…?», «¿qué es…?» by
    // what it is, not by where it is set.
    const saysWhere = /^(?:En|Desde|Arriba|Abajo)\b/.test(said) || said.includes('→');
    if (whereAsk && saysWhere) s += 0.04;
    else if (explain && /^(?:En|Desde)\b/.test(said)) s *= 0.92;
    else if (!why && /^Porque\b/.test(said)) s *= 0.85;
    if (o.screen && ((e.screen && e.screen === o.screen) || e.also?.includes(o.screen))) s += 0.04;
    // The domain (design §4(d)3): a question of the web or of Atención goes to the entries of its own (the other of the two
    // a little less) and the team's far behind; a question that names neither keeps today's scores for the team's entries,
    // and the web's need to beat them clearly.
    const ed = e.domain ?? 'equipo';
    const qd = o.domain ?? null;
    if (qd) s = ed === qd ? s + SAME_DOMAIN : ed === 'equipo' ? s * OTHER_DOMAIN : s + SIBLING_DOMAIN;
    else if (ed !== 'equipo') s *= NO_DOMAIN;
    // A rule of the web's guide answers «¿por qué…?» first; a section 360 never says only points to the guide.
    if (e.kind === 'rule' && why) s += 0.03;
    if (e.quiet) s *= 0.85;
    // A whole flow told as a story is for a question about the way («¿cuál es el flujo…?», «¿cómo es el camino…?»,
    // «¿quién hace qué…?»): «¿cómo funciona el semáforo?» is what its colours mean.
    if (e.kind === 'flowStory' && !STORY_ASK.test(a.text)) s *= 0.8;
    if (e.kind === 'term') {
      // (A label quoted in the question, «¿qué es «Sin pilar»?», that is not one of its names: another question.)
      const says = saysName(e, a.text) && (!quoted.length || quoted.some((l) => (e.names ?? []).some((n) => formsOf(n).includes(l))));
      if (says && !ownExact && termAsked(e, a)) {
        s += TERM_ASKED;
        named.add(e);
      } else s *= !says ? TERM_OTHER : whereAsk ? TERM_WHERE : TERM_ELSE;
      if (!termSure || !says) s = Math.min(s, STRONG - 0.01);
    }
    // A curated answer, more when it was written for the asker's role (not everyone's).
    if (e.kind === 'curated') s += e.roles ? ROLE_OWN : 0.03;
    if (partial.has(k)) s = Math.min(s, STRONG - 0.01);
    out.push({ entry: e, score: s, confidence: s >= STRONG ? 'strong' : s >= WEAK ? 'weak' : 'none', text: textFor(e.a, o.roles), via: ix.docs[via.get(k)!]?.text ?? '' });
  }
  out.sort((x, y) => y.score - x.score);
  // One word, and another entry says it almost as well as the first («¿qué tengo que hacer para publicar?»: a question
  // of the guide, a task, the screen): none of them is a sure answer, unless the first is asked word for word, or is a
  // word of «Palabras de la app» asked what it means by its name («¿qué es el feed?», «¿qué es un copy?»: a weak first
  // would let a card that only uses the word answer instead). When one of those that tie is an answer for this person
  // asked word for word, that one goes first and is sure (13/11: «¿qué significa trancado?» of Grabación; «¿cómo sé
  // quién está en un canal?» of the despacho is the members' list, not who arms the channels).
  if (oneWord && !exactly.has(out[0]?.entry) && !named.has(out[0]?.entry) && out.length > 1 && out[0].confidence === 'strong' && out[1].score >= out[0].score - 0.1) {
    const tied = out.filter((m) => m.score >= out[0].score - 0.1);
    const own = tied.find((m) => m.entry.kind !== 'term' && exactly.has(m.entry));
    for (const m of tied) if (m !== own) m.confidence = 'weak';
    if (own) {
      own.score = out[0].score + 0.001;
      own.confidence = 'strong';
      out.sort((x, y) => y.score - x.score);
    }
  }
  return out.slice(0, o.limit ?? 8);
}

/** How well a ficha (a card of the database: the team's or the platform's) answers, on the same scale as the entries. */
export function scoreFicha(question: string, f: { title: string; tags: string[]; body: string }, extra?: string): number {
  const ix = index();
  const a = askedOf(question, extra);
  if (!a) return 0;
  const weigh = (r: string): Tok => ({ root: r, w: r in LIGHT ? LIGHT[r] : ix.idf.get(r) ?? ix.unknown, light: r in LIGHT });
  const as = (text: string) => tokens(text).map(weigh);
  const sum = (t: Tok[]) => t.reduce((n, u) => n + u.w, 0);
  const title = as([f.title, ...f.tags].join(' '));
  // Sentence by sentence, with its title, as the guides' entries are (a card's sentence is what 360 says of it).
  const parts = f.body.split(/(?<=[.!?…])\s+/).map((x) => as(`${f.title}. ${x}`)).filter((t) => t.length);
  return Math.max(title.length ? scoreDoc(a, title, sum(title), 'q') * 0.9 : 0, ...parts.map((t) => scoreDoc(a, t, sum(t), 'doc')));
}

/** The best entry, or null. */
export function bestAnswer(question: string, o: FindOptions): Match | null {
  return findAnswers(question, { ...o, limit: 1 })[0] ?? null;
}
