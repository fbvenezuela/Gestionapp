import 'server-only';
import { TEAM_ROLES } from '../roles';
import { GUIDE_SLUGS } from '../guides/slugs';
import { AGENDA_FALLBACK, canon, hasWord, isSection, keyWords, makesOne, roleFichaKeys, scoreFichas, sectionsFor, stem, type BrainOutput, type ChosenScript, type TurnContext } from './brain';
import { EVENT_NOUNS, GOAL, PLATFORM, WORK, aboutEvent, asksAboutPublishing, asksPlace, asksRoute, asksSchedule, asksWhenWhere, eventAt, eventSignals, eventThread, goesOn, namedTitleWords, namesPlatform, spoken, withoutAgendaThings, withoutWhenWhere } from './events';
import { STRONG, WEAK, askKind, entryById, entryForScreen, findAnswers, knownLabels, readable, scoreFicha, textFor, tokens, type Match } from './answers/engine';
import { NOTICE_MAX, NOTICE_TOO_LONG, noticeIssues } from './guard';
import { coverOf, taskAnswer, taskFor, type GuideTask } from './guide-help';
import { MESSAGES_ADMIN_TEXT, MESSAGES_READ_TEXT, MESSAGES_TELL_TEXT, asksHowToWrite, messagesAsk } from './messages-ask';
import { carriesWhen, hasDateOrTime, safeTitle } from './redact';
import { canOpen, navTarget, screenFor, screenNamed, screensIn } from './screens';
import { NO_TITLES, loadTitles, peopleWords, type TitleSet } from './titles';
import { contract, fillHuecos, plain, sentences, HUECO } from './text';
import { runTool, type Tool, type ToolCtx, type ToolRun, type TutorialLink } from './tools';

// Demo brain, WITHOUT AI (ASISTENTE_MODELOS empty). Same inputs and outputs as the model
// brain: it answers with the scripts and fichas, and uses the same tools — through the same
// runner, so the same row rules apply — chosen by keywords. Its answers say model 'local'.

// `question` is redacted, like everywhere else. `typed` is what the person wrote, only for this
// brain's own lookups (run as the person, never stored, never sent out): a place name in an event's
// title («barrio San Carlos») would otherwise be lost to «[direccion]».
export type LocalInput = { ctx: TurnContext; question: string; typed?: string; tools: Tool[]; toolCtx: ToolCtx };

type R = Record<string, unknown>;

const NETWORK_WORDS: [RegExp, string][] = [
  [/\b(instagram|insta|ig|reel|reels)\b/, 'instagram'],
  [/\b(facebook|fb)\b/, 'facebook'],
  [/\b(tiktok|tik tok)\b/, 'tiktok'],
  [/\bthreads\b/, 'threads'],
  [/\b(twitter|tweets?|tuits?)\b|\b(?:en|para|pa|de) x\b/, 'x'],
  [/\b(youtube|yt)\b/, 'youtube'],
];

const ROLE_WORDS: [RegExp, string][] = [
  [/\b(todos|todo el equipo|todo el mundo)\b/, 'todos'],
  [/\b(redes|social)\b/, 'social'],
  [/\b(despacho)\b/, 'dispatch'],
  [/\b(grabacion|camarografos?|camaras?)\b/, 'camera'],
  [/\b(administracion|admin)\b/, 'admin'],
  [/\b(politica|director de politica)\b/, 'politics'],
  [/\b(ivt|director del ivt)\b/, 'ivt'],
  [/\b(jefe)\b/, 'boss'],
];

// What's pending for me. «¿Qué tengo que revisar antes de aprobar?» is a how-to (TO_DO_HOW, below);
// «¿qué tengo que hacer (hoy)?» is the list.
const PENDING = /\b(pendiente|pendientes|que tengo|que me toca|por hacer|que hay que hacer|que hay para hoy|que hay hoy|que tenemos (?:para )?hoy|atrasad\w*|incomplet\w*|propuestas?|aceptaron|rechazaron)\b|\bcuant[oa]s (?:piezas|tweets|fichas|propuestas)\b.*\b(?:tengo|tenemos|hay|me tocan?|faltan?|quedan?|he hecho|hice|mande)\b/;
// The events that wait for the boss's decision: «¿cuántos eventos tengo por calificar?», «¿qué eventos
// esperan mi decisión?», «¿cuántos esperan la decisión del jefe?» (not how it is done: «¿cómo califico…?»).
const TO_DECIDE = /\b(?:calificar|decidir|decision|aceptar|rechazar|por aprobar)\b/;
const SOME_EVENTS = /\b(?:eventos|propuestas)\b|\b(?:cuantos|cuantas|cuales)\b(?!.*\b(?:piezas?|tweets?|fichas?|copies)\b)/;
// «¿Cómo sé si el jefe aceptó mi propuesta?»: how it went, the person's own list.
// «¿Qué puedo hacer yo aquí?», «¿qué hace mi rol?»: the person's role ficha.
const ROLE_SELF = /\bque (?:puedo|podemos) hacer\b|\bque hago yo\b|\b(?:que hace|para que sirve|que puede hacer) mi rol\b|\bcual es mi (?:trabajo|rol|funcion)\b/;
// «¿Puedo…?», «¿me deja…?»: a question of permissions, answered first from the person's role ficha.
const MAY_I = /\b(?:puedo|podemos|me deja|me dejan|tengo permiso|tenemos permiso|se me permite)\b/;
// The verb of a «¿puedo…?» («¿puedo borrar…?» → borrar).
const MAY_VERB = /\b(?:puedo|podemos|me dejan?|se me permite)\s+(?:(?:yo|tambien|ya|nosotros|nada mas|solo)\s+)?([a-z]+)/;
// «¿Cómo cambio la fecha de un evento?»: how a change is done, not the agenda (in general, not one event's).
const HOW_CHANGE = /\bcomo (?:se |le |lo |la )?(?:cambi|muev|mov|edit|modific|corrij|correg|actualiz|pong|agreg|quit|borr)[a-z]*\b/;
// A ficha that scores less than this, or has less than a third of what is asked («¿cómo cambio el logo?»
// matches «cambiar» and nothing of the logo), is a guess: 360 says it is not sure and offers to tell administración.
const MIN_FICHA_SCORE = 2;
const MIN_FICHA_COVER = 0.3;
// A weak answer of the index (answers/engine.ts) answers alone, with no ficha or task, only from this score.
const WEAK_ALONE = 0.52;
// A question that asks what, how, where, who… (not yes or no).
const WH_ASK = /^(?:y |pero |entonces |oye )?(?:que|como|donde|cuando|quien|quienes|cual|cuales|cuanto|cuantos|cuantas|por que|para que|de que|en que|a que|con que)\b/;
export const NOT_SURE = 'No estoy seguro de eso y no quiero darte un dato malo. ¿Quieres que le avise a administración para que te ayuden?';
// Administración is never offered to tell administración (D-89): its guide, instead.
export const NOT_SURE_ADMIN = 'No estoy seguro de eso y no quiero darte un dato malo. Tu guía, en «Ayuda y guías», lo explica pantalla por pantalla.';
// A role card says what the role does in the third person («No ve piezas…»): said to the person, «No ves piezas…». Only
// the first verb of each sentence and the one after each «no».
const NOT_A_VERB = new Set(['se', 'le', 'la', 'lo', 'me', 'te', 'de', 'que', 'ni', 'una', 'otra', 'esa', 'esta', 'cada', 'nada', 'toda']);
export function secondPerson(text: string): string {
  return text.replace(/(^|[.;]\s+|\b[Nn]o )(\p{L}+?[aeé])(?![\p{L}])/gu, (m, pre: string, verb: string) => (NOT_A_VERB.has(verb.toLowerCase()) ? m : `${pre}${verb}s`));
}
// A work product (WORK: «¿cuándo aprueban la pieza del puente?» asks about the piece, not the event) and
// the things of the platform (PLATFORM: a when or a where about them is a how-to, not the agenda) are the
// shared detector's (events.ts).
// The person's own things or a call for help: «¿cómo cambio mi número de teléfono?», «¿a quién
// llamo si tengo un problema?», «¿cuál es el teléfono de soporte?» are not the agenda. Only those
// phrases: «¿qué hay el domingo? Quiero hacer mi plan» or «… necesito ayuda» still is.
const SELF = /\bmis? (?:numero|telefono|celular|correo|cuenta|clave|contrasena|perfil|acceso|usuario|codigo|pendientes|tareas)\b|\b(?:telefono|numero|correo) de (?:soporte|administracion)\b|\bsoporte\b|\bsi (?:tengo|hay|me sale) (?:un |algun )?(?:problemas?|error|falla)\b|\bque hay que hacer\b/;
// «Lo de la cancha»: an event by another name (whoever can't see it gets no title match).
const LO_DE = /\blo del?\b/;
/**
 * «Lo de la cancha» names an event; «lo de por ponerle fecha», «lo de contactos del sitio», «lo del copy», «lo de esperan
 * al jefe en Hoy» name a label, a screen or a thing of the platform (D-89): no event lookup, no refusal for them.
 */
export function loDeEvent(text: string): boolean {
  const p = plain(text);
  const m = LO_DE.test(p) ? /\blo del? (.+)$/.exec(p) : null;
  if (!m) return false;
  const rest = m[1];
  if (PLATFORM.test(rest) || screensIn(rest).length) return false;
  return !knownLabels().some((l) => rest === l || rest.startsWith(`${l} `));
}
// How it is done, not how one is going: about events in general («¿qué tomas hago en un acto?», «¿cómo
// veo los eventos pasados?») or any «¿cómo + verb?» but how it is going («¿cómo va…?», «¿cómo quedó…?»).
// The fichas answer those; the event lookup is for one event.
const GENERIC_EVENT = new RegExp(String.raw`\b(?:un|una|unos|unas|cada|los|las|mis|tus|sus|cualquier|otro|otra|dos|tres|varios|varias|algunos|algunas)\s+(?:${EVENT_NOUNS})\b`);
// The way somewhere («¿cómo llego a…?», «¿cómo se llega…?», «¿qué tan lejos queda…?») is a where, not a how-to.
const HOW_ANY = /\bcomo (?:se |lo |la |los |las |le |les |me |te |nos )*(?!(?:va|van|vamos|esta|estan|estamos|quedo|quedaron|anda|andan|sigue|siguen|salio|salieron|lleva|llevan|llevamos|le fue|les fue|nos fue|me fue|fue|viene|vienen|ira|iran|llego|llega|llegan|llegamos|llegar|queda|quedan)\b)[a-z]+(?:o|a|e|amos|emos|imos|an|en|ar|er|ir)\b/;
const WAY_THERE = /\bcomo (?:se |hago para |hacemos para )?(?:llego|llega|llegan|llegamos|llegar)\b|\bque tan (?:lejos|cerca)\b|\ba cuanto (?:queda|quedan)\b|\b(?:donde|en que parte) (?:queda|quedan)\b/;
// «¿Qué tengo que revisar antes de aprobar?», «¿qué tengo que poner en el copy?»: how it is done (the
// fichas). «¿Qué tengo que hacer?» / «… hacer hoy» alone is the person's list.
const TO_DO_HOW = /\bque (?:tengo|tenemos|tiene|tienen|hay) que (?!hacer(?: (?:hoy|ahora|ahorita|manana|primero|esta semana))?$)[a-z]+(?:ar|er|ir)\b/;
// How many days or tweets are left or wait: the tool. Anything else about tweets is a how-to (the fichas).
const TWEETS_LEFT = /\b(?:cuantos dias|dias de tweets|cuantos tweets (?:quedan|faltan|hay|tengo|tenemos|me quedan|programados|esperan)|quedan|faltan|programados|esperando|me quedan)\b/;
// A piece's status asked («¿cómo va la pieza del agua?», «¿ya aprobaron…?»), not anything that names a piece.
const PIECE_STATUS = /\b(?:como va|como van|como quedo|como esta|en que va|en que van|en que esta|estado de|ya (?:la |lo )?aprobaron|ya se aprobo|se aprobo|esta aprobad\w*|ya salio|ya se publico|ya la publicaron)\b/;
const PIECE_NAMED = /\bpieza (?:de|del|sobre|que se llama|llamada) [a-z0-9]/;
// The video rules: how long, how heavy, how many characters the copy has in a network.
const VIDEO_RULES = /\b(?:cuanto (?:puede )?dur\w*|duracion|medidas|reglas de video|peso maximo|cuanto pesa|cuanto (?:puede )?pesar|pesar un|resolucion|formato del video|caracteres|largo del copy)\b/;
// A call for help, not the agenda: «¿cuál es el teléfono de soporte?», «¿a quién llamo?» (alone or «…si
// tengo un problema»), «tengo un problema», «me sale un error». «¿A quién llamo en la feria?» or «…para
// lo de los productores?» is an event's contact: the agenda's answer.
// A problem or an error is the app's only when nothing else owns it: alone, or with the app, logging in
// or uploading («tengo una falla con la app», «me sale un error al subir»). «Hay un error en el copy» or
// «un problema con la pieza» is the content's: the fichas answer it.
// «Un error que dice que el copy es muy largo» is the app checking the content: its ficha answers it.
const CONTENT = String.raw`\b(?:piezas?|videos?|material|copy|copies|storyboard|fotos?|tomas|reels?|tweets?|tuits?|tanda|portadas?|formato|archivos?|version|titulo|texto|duracion|peso|medidas)\b`;
const TROUBLE = String.raw`(?:tengo|tenemos|hay|me sale|me salio|me da|me dio|tuve) (?:un |una |algun |alguna )?(?:problemas?|fallas?|errores|error)`;
const APP_TROUBLE = String.raw`${TROUBLE}(?:$| (?:con|en) (?:la |el |mi )?(?:app|aplicacion|plataforma|pagina|sistema|web|asistente|cuenta|clave|contrasena|codigo|acceso|sesion|conexion|internet)\b| (?:al|cuando|para) (?:entrar|iniciar|ingresar|abrir|subir|cargar|guardar|descargar|entro|inicio|ingreso|abro|subo|cargo|guardo|descargo)\b| que\b(?![^.?!]*${CONTENT})| (?:tecnico|raro)\b| (?:a quien|que hago|me ayudas)\b)`;
const SUPPORT = new RegExp(String.raw`\b(?:soporte|mesa de ayuda)\b|\b(?:telefono|numero|correo|contacto) de (?:soporte|ayuda|administracion)\b|^(?:y )?a quien (?:llamo|le escribo|le aviso|acudo|le pregunto)$|\ba quien (?:llamo|le escribo|le aviso|acudo|le pregunto) (?:si|cuando)\b(?![^?.!]*\b(?:llegue|llego|llegar|vaya|voy|alla|ahi|al sitio|a la obra|al evento|a la visita|al acto|a la actividad)\b)|\b${APP_TROUBLE}`);
// Uploading a video, a photo or the material: Grabación, Redes, administración and the boss (he «hace lo de Redes»: the
// event's Material tab lets him) do it.
const UPLOAD = /\b(?:como|donde|quien|quienes) (?:se )?(?:sube|subo|suben|subimos|cargo|carga|cargan|subir|cargar)\b|\b(?:subir|cargar) (?:un |el |la |los |las )?(?:videos?|fotos?|material)\b/;
const UPLOAD_WHAT = /\b(?:videos?|fotos?|material|materiales|grabacion|archivos?|tomas)\b/;
const UPLOADERS = new Set(['admin', 'social', 'camera', 'boss']);
// «Me sale un error que dice que el video pesa mucho»: the app checking the video against a network's rules.
// «Me sale un error que dice que el copy es muy largo»: the network's limit of characters (D-89).
const COPY_TOO = /\b(?:error|dice que|me sale|me salio|no me deja|no deja|no pasa)\b.*\bcopy\b.*\b(?:muy largo|no cabe|se pasa|caracteres)\b/;
const VIDEO_TOO = /\bvideos?\b.*\b(?:pesa|pesado|muy grande|dura mucho|muy largo|muy corto|no cumple)\b|\b(?:pesa|pesado|muy grande|dura mucho|muy largo|muy corto)\b.*\bvideos?\b/;
// «Márcame los avisos como leídos», «limpia mis avisos»: an order (level «hace»). Not «¿puedo borrar un aviso de
// cumplimiento?» (a question about Redes' avisos), nor how it is done.
const MARK = /^(?:(?:por favor|porfa|oye|360) )?(?:marca|marcame|marcalos|marcar|limpia|limpiame|limpiar|borra|borrame|quita|quitame|pon|ponme) (?:todos )?(?:mis |los |todos los |todas las )?(?:avisos?|notificaciones)\b(?! de cumplimiento)|\bavisos? (?:como )?leidos?(?: por favor)?$/;
// «¿Cuántas vencidas tengo?», «¿cuántas obras esperan fecha?», Grabación's «¿qué tengo que subir?», «¿cuántos me faltan?»:
// the person's own list too.
const COUNTS = /\bcuant[oa]s (?:vencidas|obras|fichas|reportes|eventos|videos|archivos)\b.*\b(?:tengo|tenemos|hay|faltan?|quedan?|esperan?|esperando|me tocan?)\b|\b(?:que|cuanto|cuantos) (?:tengo|me falta|me faltan) (?:que |por )?subir\b|\bcuantos me faltan\b|\bmaterial por subir\b|\b(?:tengo|hay) (?:algo )?vencid[oa]s?\b/;
// «Sí», «dale», «avísale» right after 360 offered to tell administración.
const YES = /^(?:si|claro|dale|ok|okey|okay|por favor|hazlo|avisale|avisales|avisa|si por favor|si avisale|si dale|si claro|porfa)(?: (?:por favor|porfa|gracias))?$/;
const OFFERED = /\b(?:quieres que le avise|le aviso)\b[^?¿]*\?\s*$/i;
// A greeting, thanks («grax pana» reads «gracias»).
const GREETING = /^(hola|buenas|buenos dias|buenas tardes|buenas noches|epa|epale|que tal|saludos|hey)\b/;
const THANKS = /\b(gracias|grax|grx|chao|nos vemos|hasta luego)\b/;
// Its name, and whether it is a bot.
const NAME_ASK = /\b(como te llamas|como se llama (el asistente|la asistente|este asistente|usted|el bot)|como te (puedo |debo )?(llamo|llamar|digo|decir)|que nombre tienes|cual es tu nombre|tu nombre|quien eres|quien sos|quien es usted|como te dicen|tienes nombre|presentate)\b/;
const BOT_ASK = /\beres (un |una )?(bot|robot|ia|maquina|inteligencia artificial|humano|humana|persona|real)\b/;
// «¿Con quién hablo?» alone, maybe with a greeting or a «perdón»: it asks for the assistant's name.
const NAME_ONLY = /^(?:(?:hola|buenas|buenos dias|buenas tardes|buenas noches|epa|disculpa|disculpe|perdon|perdone|oye|oiga) )*con quien hablo(?: yo)?(?: (?:perdon|disculpa|disculpe|por favor))?$/;
// A tutorial, or help to use the platform (R3, D-46, D-47; design §8.2 T). Asked for by name («tutorial», «paso a
// paso», «enséñame a usar…», «muéstrame cómo…», «me perdí», «ayuda» alone), or «¿cómo se usa / cómo funciona…?» with a
// screen named or «esta pantalla» (otherwise it is a how-to of something: «¿cómo funciona el semáforo?», the fichas).
// Not «recorrido» alone: a recorrido is also an event («el recorrido del puente»).
const TUTORIAL_WORD = /\b(?:tutorial(?:es)?|paso a paso|recorrido guiado)\b/;
const SHOW_ME = /\b(?:ensename|ensenarme|me ensenas|me puedes ensenar|muestrame|mostrarme|me muestras|me puedes mostrar)(?: (?:a usar|como (?!(?:va|van|quedo|quedaron|esta|estan|sigue|siguen|anda|andan|le fue|salio|salieron)\b)|(?:la |esta )?pantalla|el tutorial)|$)/;
// «Enséñame la agenda», «muéstrame Publicar»: a screen after «enséñame» (screenNamed decides whether it is one).
const SHOW_SCREEN = /\b(?:ensename|ensenarme|me ensenas|muestrame|mostrarme|me muestras)(?: (?:la|el|los|las|mi|mis|tu|esta|este))? ([a-z]+(?: [a-z]+)?)$/;
// The words that ask for a tutorial, left out to find what it is about.
const TUTORIAL_TOPIC_WORDS = /\b(?:hay|tienes|existe|un|una|el|algun|alguno|tutorial(?:es)?|paso a paso|recorrido guiado|para|de|sobre|como)\b/g;
const LOST = /^(?:no entiendo|no le entiendo|no entiendo nada|no entiendo esto|no se que hacer|no se que hago)$|\b(?:me perdi|estoy perdid[oa]|no se (?:como )?usar|no se como (?:se )?usa|no entiendo como (?:se )?usa|no entiendo (?:esta pantalla|la app|la aplicacion|la plataforma))\b|^(?:(?:hola|epa|buenas) )?(?:necesito |quiero |me das |dame )?(?:una )?ayuda(?: (?:por favor|porfa|aqui|con (?:la|esta) (?:app|aplicacion|plataforma|pantalla)))?$|\bnecesito ayuda (?:con|para usar) (?:la|esta) (?:app|aplicacion|plataforma|pantalla)\b/;
const HOW_USED = /\bcomo (?:se )?(?:usa|usan|uso|funciona|funcionan)\b/;
const THIS_SCREEN = /\b(?:esta pantalla|esta parte|esta seccion|aqui|esto)\b/;
const WELCOME = /\b(?:bienvenida|como empiezo|por donde empiezo|primeros pasos)\b/;
// The words that ask for a tutorial: they never name a screen here («tutoriales» is a word of Ayuda).
const NOT_A_SCREEN = ['tutoriales', 'guia', 'guias', 'ayuda'];
// «¿Qué hago aquí?», «¿para qué sirve esta pantalla?», «¿qué se hace en Publicar?» (design §8.2 S): what the screen
// is for, for this role, and its tutorial.
// The cards that say who does what (all the roles, or one role's summary): not a how-to.
const ROLE_SUMMARY = /^guia:(?:roles|rol-[a-z]+)$/;
const WHAT_HERE = /\bque (?:hago|se hace|hay que hacer|puedo hacer) (?:aqui|en esta pantalla|en esta parte)\b|\bpara que (?:sirve|es) (?:esta pantalla|esto|esta parte|esta seccion|aqui)\b|\bcomo funciona esta pantalla\b|\bque es esta pantalla\b|\bque (?:hago|se hace) en (?:la pantalla de |la pantalla |el |la |los |las )?(?!un |una )([a-z]+(?: [a-z]+)?)\b|^(?:y )?(?:que es esto|esto que es|esto para que es|para que es esto|que es aqui|y ahora que hago|ahora que hago|que hago ahora|que hago con esto)$|^(?:y )?(?:esto|esta pantalla|esta parte|aqui)(?: (?:pa|para) que (?:es|sirve)| que es| que hago| como funciona)?$|^(?:y )?(?:que hago|que se hace|que hay|que puedo hacer) (?:aqui|aca|en esta pantalla)$/;

// R. Redes by format (R4, D-77): the feed, the months and their quota, the pillars, deleting a piece and Fin de mes have
// their own guide cards and their own screen. Narrow phrases only («el feed», «mover de mes», «cupo», «pilar», «fin de
// mes»): a word that is also an event's never gets here, and a when or a where went to the agenda's answer before.
// `from`: the card's sentence that answers it (otherwise the one with the most words of the question); `go`: its
// screen, for whoever can open it.
type RedesTopic = { re: RegExp; key: string; from?: RegExp; go: (admin: boolean) => string };
const REDES_TOPICS: RedesTopic[] = [
  { re: /\b(?:borr|elimin)\w*(?: \w+){0,2} piezas?\b|\bpiezas? (?:eliminadas?|borradas?)\b/, key: 'redes-por-formato', from: /^Eliminar una pieza/, go: (admin) => (admin ? '/ajustes/contenido' : '/redes') },
  { re: /\b(?:el|un|del|al|mi|tu|este|ese) feed\b|\bfeed preview\b/, key: 'feed', go: () => '/redes/feed' },
  { re: /\bresumen del mes\b|\bmes de redes\b|\brendicion de cuentas\b/, key: 'fin-de-mes', from: /^El Resumen del mes/, go: () => '/redes/fin-de-mes' },
  { re: /\b(?:que es|que va en|para que (?:es|sirve)|seccion(?: de)?|piezas? de)(?: la| el)? fin de mes\b/, key: 'fin-de-mes', from: /^Fin de mes es/, go: () => '/redes/fin-de-mes' },
  // «Pilar» is also a name and «cupo» also a free place at an event: only «los pilares», «el pilar», «el cupo», «cupo
  // del mes»… count.
  { re: /\bpilares\b|\b(?:el|un|del|al|mi|tu|su|este|ese|cada|de|sin) pilar\b/, key: 'meses-cupo', from: /pilar/, go: (admin) => (admin ? '/ajustes/contenido' : '/redes') },
  { re: /\b(?:el|del|al|mi|tu|su|este|ese) cupo\b|\bcupo (?:del|de) (?:mes|reels?|posts?|carruseles|historias|youtube)\b/, key: 'meses-cupo', from: /^El cupo/, go: (admin) => (admin ? '/ajustes/contenido' : '/redes') },
  { re: /\b(?:mover|muevo|mueve|movemos|pasar|paso|cambiar|cambio)\b(?: \w+){0,3} (?:de|a otro) mes\b|\b(?:nuevo|otro) mes\b|\b(?:borr|elimin)\w* (?:un|el|este|ese) mes\b|\bmeses de contenido\b/, key: 'meses-cupo', go: () => '/redes' },
];

// The words that only ask to go to a screen or to see it («llévame a», «¿dónde está…?», «ábreme…»): what a question says
// beyond them and the screen's name is what it really asks.
const GO_WORDS = new Set(tokens('llevame llevarme lleva llevas abre abreme abrir abro ir vamos muestrame mostrar ver veo encuentro encontrar busco buscar entro entrar queda pantalla seccion parte boton menu opcion donde esta estan aparece sale salen'));
const beyondScreen = (text: string, names: string[]) => {
  const own = new Set(tokens(names.join(' ')));
  return tokens(text).filter((r) => !own.has(r) && !GO_WORDS.has(r) && r !== 'donde' && r !== 'mio');
};

// What is clearly out of the platform (not «política» alone nor «tarea»; ronda R3). Since the answers (D-89) also the
// weather, the dollar, sports, the lottery: «¿va a llover hoy en la ciudad?» is not a place of the agenda.
const OFF_TOPIC = /\b(chiste|opinas|elecciones|partido politico|deberes|poema|clima|llover|lluvia|llovera|dolar|dolares|bolivares|tasa del dia|futbol|beisbol|loteria|horoscopo|receta|sueldo|salario)\b|\bque tiempo (?:va a hacer|hace)\b|\bcuanto (?:me pagan|pagan|gana|ganan|cobra|cobran)\b|\bopinas? de (?:la )?politica\b|\bhaz(?:me)? (?:la|mi) tarea\b|\bcuanto (?:esta|cuesta) el dolar\b/;

// The names of Redes that read like a when: «Fin de mes» (a section), «Resumen del mes», «+ Nuevo mes», «Borrar este
// mes», «Mover a otro mes».
const REDES_NAMES = /\b(?:fin de mes|resumen del mes|nuevo mes|este mes|otro mes|cada mes|mes de redes)\b/g;

// ── 360's answers (D-89, answers/engine.ts) ─────────────────────────────────────────────────────────────────────────
// A question that goes on with the one before («¿y después?», «¿y quién lo aprueba?», «¿y si no va?»): matched with the
// earlier question's words too, at half weight.
const ELLIPTIC = /^(?:y|e|pero|entonces|o sea|osea)\b|\b(?:eso|esa|ese|esos|esas|ahi|alli|lo mismo)\b/;
// «¿Y después?», «¿qué sigue?»: the step that comes next.
const NEXT_ASK = /\b(?:y despues|despues que|que sigue|y luego|luego que|que hago despues|siguiente paso|y ahora que)\b/;
// The date as a field or a rule (who sees it, why it does not show, how it is set, whether it can be written somewhere,
// where something goes, what a label means): the answers say it, static and date-free. Never when it asks when or where
// an event is (VALUE_ASK).
const META = new RegExp(
  [
    // Who sees it, sets it, decides it.
    String.raw`\b(?:quien|quienes) (?:\w+ ){0,2}(?:ve|ven|pone|ponen|cambia|cambian|sabe|saben|puede|pueden|decide|deciden|mueve|mueven|recibe|reciben|lee|leen|asigna|asignan|crea|crean)\b`,
    // Why it does not show or cannot be done, why it says something.
    String.raw`\bpor que\b(?: \w+){0,4} no (?:le |lo |la |me |se )?(?:veo|ve|ven|sale|salen|aparece|aparecen|puedo|puede|pueden|deja|dejan|tengo|tiene|lleva|llevan|dice|pone|ponen|suena)\b`,
    String.raw`\bpor que (?:me |le |te |nos )?(?:sale|salen|aparece|aparecen|dice|dicen|pide|piden|esta|estan|veo|ve|ven)\b`,
    // How it is set, changed, seen.
    String.raw`\bcomo (?:se |le |lo |la |les |los |las )?(?:pongo|pone|ponen|poner|cambio|cambia|cambiar|muevo|mueve|mover|corrijo|corrige|edito|edita|agrego|agrega|escribo|escribe|marco|marca|quito|reprogramo|cancelo|cancela|paso|asigno|anoto|guardo|actualizo|actualiza|programo|elijo|lleno|veo|ve|abro|busco|encuentro|filtro|apago|activo|sabe|se que|me entero|se entera)\b`,
    // Whether it can be done or written somewhere, or whether someone can («¿el jefe puede leer los canales?»).
    String.raw`\b(?:puedo|podemos|se puede|me deja|me dejan|deja|dejan|tengo que|hay que|debo) (?:\w+ ){0,1}(?:poner|cambiar|mover|escribir|editar|corregir|agregar|quitar|anotar|meter|mandar|dictar|reprogramar|cancelar|subir|decir|pasar|compartir|ver)\w*\b`,
    String.raw`\bpueden? (?:leer|ver|escribir|entrar|mandar|aprobar|borrar|eliminar|editar|cambiar|crear)\b`,
    // Where something is done or put in the platform (a verb of one's own, not of being somewhere), where a list is.
    String.raw`\bdonde (?:le |lo |la |los |las )?(?!(?:grabo|llego|voy|paro|estoy|salgo|quedo|espero|estaciono|duermo|como|tengo|entro|paso)\b)[a-z]{2,}o\b`,
    String.raw`\bdonde se (?:cambia|cambian|pone|ponen|ve|ven|edita|configura|activa|sube|suben|marca|toca|escribe|anota|guarda|busca|lee|recupera|confirma|aprueba|descarga|elige|apaga)\b`,
    String.raw`\bdonde (?:estan|esta|veo|encuentro|quedan|salen|aparecen) (?:los|las|mis|tus|todos los|todas las) `,
    // What a label or a word means, what goes instead of a date.
    String.raw`\b(?:que|cual) (?:pongo|escribo|significa\w*|quiere decir|es la diferencia)\b|\ben vez de\b`,
    String.raw`\b(?:ve|ven|veo|sabe|saben|recibe|reciben|le llega|les llega|lleva|llevan|dice|dicen|trae|traen|muestra|muestran) (?:la |el |su |sus )?(?:fecha|hora|direccion|lugar)\b`,
    // What happens if, whether someone is told.
    String.raw`\bque (?:pasa|hago) (?:si|cuando|despues)\b|\bse entera\b|\b(?:le|me|nos|te) avisan\b|\b(?:le|les|me|te) llegan? (?:al|a la|a los|el|la|los|un|una|algun|alguna|aviso|avisos)\b`,
    // Who to tell, something wrong, being asked for it.
    String.raw`\ba quien (?:le )?(?:digo|aviso|escribo|pregunto|reclamo)\b|\besta(?:n)? mal\b|\bse la (?:digo|mando|paso|doy|escribo)\b|\bme (?:pide|pidio|pregunta|pregunto)\b`,
    // A conditional («cuando entra», «cuando escribo»), the phone that rings, the time zone, a missing button.
    String.raw`\bcuando (?:le |me |lo |la )?(?:entra|entro|escribo|escribe|pongo|pone|subo|sube|toco|abro|abre|guardo|mando|marco|creo|crea|acepta|rechaza|aprueba)\b`,
    String.raw`\b(?:suena|suene|sonar|suenan|silencio)\b|\b(?:en|con) (?:que|cual) (?:hora|horario|zona)\b|\bno (?:veo|me sale|aparece|encuentro) (?:el|la) (?:boton|opcion|pestana)\b`,
    // D-89, said other ways: what something says on the screen, what is not let or does not show, how one knows, the
    // difference between two things, whether it goes to the agenda, who changed it, what a role sees of it, the time zone.
    String.raw`\b(?:me|le|nos) (?:sale|salio|salen|salieron|aparece|aparecio|dice|dijo)\b|\bpor que (?:me |le |nos )?(?:salio|aparecio|dijo)\b`,
    String.raw`\bno (?:me |le |nos |se )?(?:deja|dejan|dejo|permite|prende|prendio|activa|aparece|aparecen|aparecio|sale|salen|salio|carga|abre|llego|llega|llegan|llegaron)\b`,
    String.raw`\bcomo (?:se|sabre|saber|me doy cuenta|veo) (?:si|cuando|que)\b|\b(?:que|cual) (?:es la )?diferencia\b|\bes lo mismo\b`,
    String.raw`\b(?:va|van|iria|irian|entra|entran|pasa|pasan) (?:a|para|pa|pal) (?:la )?agenda\b|\b(?:quien|quienes) (?:le |lo |la )?(?:cambio|movio|puso|creo|cancelo|borro|edito|toco|modifico)\b`,
    String.raw`\bque (?:ve|ven|sabe|saben|recibe|reciben|le llega|les llega) (?:redes|grabacion|politica|el ivt|el despacho|el jefe|administracion|los demas|el equipo)\b|\bven? lo mismo\b`,
    String.raw`\b(?:le |les )?(?:puso|pusieron|ha puesto|han puesto|pone|ponen|pongo|ponga|pido|pide|pedir) (?:la )?fecha\b|\bno (?:ha|han) (?:aprobado|decidido|dicho|aceptado|contestado|respondido)\b`,
    String.raw`\b(?:en|al|el) (?:titulo|nombre|nota|motivo|copy|mensaje|comentario|caption)\b.*\b(?:pongo|puedo poner|escribo|le pongo)\b|\b(?:le )?pongo (?:en|al) (?:el )?(?:titulo|nombre|nota|motivo|copy|mensaje|comentario)\b`,
    String.raw`\ben hora de\b|\bhora local\b|\bzona horaria\b|\bcuando (?:la |lo )?quiero\b|\bcuando estoy\b|\b(?:anoto|pongo|registro|marco|subo|reporto) donde\b`,
    String.raw`\b(?:puedo|podemos|se puede|me deja|me dejan) (?:\w+ ){0,1}(?:crear|aprobar|borrar|eliminar|asignar|invitar|archivar|leer|abrir|salir|salirme)\w*\b|\bse (?:me |le )?(?:borro|perdio|pierde|borra)\b|\bcual (?:se )?queda\b`,
    // Where someone sees a thing («¿y eso dónde lo ve el jefe?»), what happens after an action of one's own («si guardo
    // sin mandarlo, ¿dónde queda?»), a when that is a state or someone's step («cuando ya está lista», «cuando el jefe la
    // apruebe»), being told («¿me avisas cuando…?»), not finding something.
    String.raw`\bdonde (?:lo |la |los |las |le |les )(?:ve|ven|lee|leen|pone|ponen|encuentra|encuentran|guarda|guardan|marca|marcan|sube|suben|cambia|cambian)\b`,
    String.raw`\bsi (?:lo |la |le |los |las )?(?:guardo|mando|borro|archivo|cancelo|rechazo|subo|pongo|cambio|quito|apago|guardas|mandas|toco|marco|apruebo|acepto|elimino|publico|desactivo)\b`,
    String.raw`\bcuando (?:ya )?(?:este|esten|tenga|tengan|termine|terminen|haya|hayan|acabe|lo tenga|la tenga)\b|\bcuando (?:ya )?(?:esta|estan) (?:list[oa]s?|complet[oa]s?|terminad[oa]s?|hech[oa]s?)\b`,
    String.raw`\bcuando (?:el jefe |redes |grabacion |el despacho |administracion |alguien |me |le |lo |la )?(?:apruebe|aprueben|acepte|acepten|rechace|rechacen|publique|publiquen|suba|suban|mande|manden|conteste|responda|lea|lean|vea|vean|cambie|cambien|ponga|pongan|termine)\b`,
    String.raw`\b(?:me|nos|te|le) (?:avisas|avisa|avisaras|notificas|notifica)\b|\bno (?:encuentro|consigo|ubico|hallo)\b`,
  ].join('|'),
);
// Where something is seen in the app, or when a step of the platform happens («¿dónde veo cómo va el trabajo entre todos?»,
// «¿cuándo puedo armar el diálogo FAB?», «¿cuándo sale el reel?»): a rule, but only when no event is named (D-89): «¿dónde
// veo lo de la cancha?» or «¿cuándo puedo ir a la feria?» keep the refusal.
const META_SOFT = /\bdonde (?:veo|leo|encuentro|reviso|consigo|busco|miro|abro|esta|estan|queda|quedan|sale|salen|aparece|aparecen|lo veo|la veo|los veo|las veo)\b|\bcuando (?:puedo|se puede|podemos|debo|tengo que|hay que|sale|salen|se publica|se publican|se aprueba|se aprueban|llega|llegan|aparece|aparecen|lo ve|la ve|lo ven|la ven|lo lee|la lee)\b/;
// When or where an event is, asked as such («¿a qué hora es…?», «¿dónde queda…?», «¿cuándo llega…?»): a META word
// next to it does not make it a rule.
const VALUE_ASK = /\b(?:cuando|a que hora|que dia|que fecha) (?:viene|vienen|va|van|vendra|vendran|ira|iran|pasa|pasan|estara|estaran|visita|visitara)\b|\b(?:cuando|a que hora|que dia|que fecha|donde|en que lugar) (?:es|son|sera|seran|empieza|empiezan|arranca|arrancan|llega|llegan|sale|salen|queda|quedan|va a ser|se hace|se hara|nos vemos|hay que estar|tengo que estar|me toca|toca|grabo|grabamos|salimos|vamos|termina)\b|\bdonde (?:esta|estan) (?:el|la|lo|ese|esa|este|esta)\b|\b(?:la direccion|el telefono|los telefonos|el numero|el contacto|los contactos) (?:de|del) (?:la|el|los|las|lo) (?!eventos\b|actividades\b|visitas\b|contactos\b)/;
// Which event comes first, or whether one is on a day («tengo dos eventos seguidos, ¿cuál es primero?», «me preguntó si el
// acto es mañana o pasado»): its schedule, asked another way.
const ORDER_ASK = /\b(?:cual|que) (?:evento |actividad |acto )?(?:es|va|viene|toca) (?:primero|antes|despues|de primero|de ultimo)\b|\ben que orden\b/;
// Whom to call or ask for at a site («¿a quién llamo cuando llegue a la obra?», «¿con quién hablo allá?»): its contacts.
const CONTACT_ASK = /\ba quien (?:llamo|le hablo|busco|contacto|le pregunto|le escribo|le aviso|pregunto)\b.*\b(?:llegue|llego|llegar|alla|ahi|en el sitio|al sitio)\b|\bcon quien (?:hablo|me comunico|me entiendo) (?:alla|ahi|en el sitio|cuando llegue|al llegar)\b|\b(?:quien|quienes) (?:me|nos) (?:recibe|reciben|espera|esperan) (?:alla|ahi|en|cuando)\b/;
const WHEN_INSIDE = /\bsi (?:el|la|lo|los|las) .{0,60}\b(?:es|son|sera|va a ser|queda|cae) (?:manana|hoy|pasado|esta semana|la otra semana|el (?:lunes|martes|miercoles|jueves|viernes|sabado|domingo))\b/;
// An event in particular: an event word with an article that points to one («la feria», «el acto de entrega»), not the
// agenda (a screen) nor Grabación's «entrega».
const DEFINITE_EVENT = new RegExp(String.raw`\b(?:el|la|los|las|este|esta|estos|estas|ese|esa|esos|esas|del|al|aquel|aquella)\s+(?!agenda\b|entrega de grabacion\b)(?:${EVENT_NOUNS})\b`);
// An event word that names one by itself («la feria», «el acto»), not the generic ones of a rule («el evento que creé»,
// «una visita», «la agenda»): those need a title, a place, a date or «lo de…» to be one event.
const NAMED_EVENT = new RegExp(String.raw`\b(?:el|la|los|las|este|esta|estos|estas|ese|esa|esos|esas|del|al|aquel|aquella)\s+(?!(?:agenda|entrega de grabacion|eventos?|actividad|actividades|visitas?(?: de obra)?)\b)(?:${EVENT_NOUNS})\b`);
// The boss going somewhere or coming («¿el jefe ya fue a la ermita?», «¿viene el jefe?»): his agenda.
const BOSS_GOES = /\b(?:fue|va|van|viene|vienen|vino|llega|llego|llegara|ira|iria|vendra|estuvo|estara|visita|visito|visitara|pasa por|paso por)\b(?! a [a-z]+(?:ar|er|ir)\b)/;
// The screens' labels («Por ponerle fecha», «Hoy en la agenda», «Esperan al jefe», «Guardar aunque choque»): every «…» the
// help content quotes. Written without «», they go only when the question asks what one is, where it is or how it is
// filled («¿qué sale en hoy en la agenda?», «¿qué es lo de esperan al jefe?»): «¿qué hay hoy en la agenda?», «¿qué hay a fin
// de mes?» or «los próximos 7 días» are still the agenda. The labels that name the agenda's data (a place, a contact, the
// way there) only when they end the question. Matched without accents or case. A few never are the agenda: SAFE.
const DATA_IN_LABEL = /\b(?:direccion|lugar|contactos?|llega|llegar|sitio|mapa|donde)\b/;
const LOOSE: Record<string, string> = { a: '[aá]', e: '[eé]', i: '[ií]', o: '[oó]', u: '[uúü]', n: '[nñ]' };
const SAFE_LABELS = ['horas de silencio', 'por ponerle fecha', 'ponerle fecha', 'ya tiene fecha', 'fecha estimada de entrega', 'vaciar este mes', 'borrar este mes', 'mover a otro mes', 'guardar la fecha', 'guardar la nueva fecha', 'cambiar fecha o lugar'];
const WHAT_IS = String.raw`(?:que es|que son|que significa|que significan|que quiere decir|que sale en|que hay en|que dice|para que sirve|para que es|donde esta|donde veo|que hago en|como (?:uso|funciona))`;
const looseRe = (labels: string[]) =>
  labels
    .sort((a, b) => b.length - a.length)
    .map((l) => l.split(' ').map((w) => [...w].map((c) => LOOSE[c] ?? c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('')).join('[^\\p{L}\\p{N}]+'))
    .join('|');
let TIME_LABELS: RegExp | null = null;
let DATA_LABELS: RegExp | null = null;
let SAFE_RE: RegExp | null = null;
const loose = (t: string) => t.split('').map((c) => LOOSE[c] ?? c).join('');
// Between «¿qué es…?» and the label: «eso de», «lo de», «el botón», «la lista»… («q es eso d hoy en la agenda»).
const LABEL_LEAD = String.raw`(?:(?:eso|esto|lo)\s+(?:de|del|que dice)\s+|(?:el|la|los|las|un|una)\s+)?(?:(?:boton|lista|pestana|seccion|chip|tarjeta|casilla|opcion|campo|letrero|cartel)\s+(?:de\s+|del\s+)?)?`;
// The scale of importance or receptividad («del 1 al 10», «de uno a diez»): never a date.
const SCALE = /\b(?:del?\s+)?(?:1|uno)\s+(?:al?|-)\s+(?:10|diez)\b/gi;
/** The text without the screens' labels that carry a time word (see above): what is left asks the question. */
export function withoutLabels(text: string): string {
  // Since the answers (D-89), asked what a label is («¿qué es «Esperan al jefe»?», «¿para qué es Por ponerle fecha?»), any
  // label of the screens after «¿qué es…?»; a label of the agenda's data («Contactos del sitio», «A dónde se va») only when
  // it ends the question (what it is, never the data of an event).
  TIME_LABELS ??= new RegExp(
    `(?<![\\p{L}\\p{N}])(${loose(WHAT_IS)})\\s+${loose(LABEL_LEAD)}(?:${looseRe(knownLabels().filter((l) => !DATA_IN_LABEL.test(l)))})(?![\\p{L}\\p{N}])`,
    'giu',
  );
  DATA_LABELS ??= new RegExp(
    `(?<![\\p{L}\\p{N}])(${loose(WHAT_IS)})\\s+${loose(LABEL_LEAD)}(?:${looseRe(knownLabels().filter((l) => DATA_IN_LABEL.test(l)))})(?=\\s*(?:en\\s+(?:hoy|inicio|la\\s+agenda|el\\s+calendario|el\\s+evento|un\\s+evento|mi\\s+evento|la\\s+tarjeta|la\\s+ficha|la\\s+pantalla|mis\\s+eventos))?\\s*[?¿!.]*\\s*$)`,
    'giu',
  );
  SAFE_RE ??= new RegExp(`(?<![\\p{L}\\p{N}])(?:${looseRe([...SAFE_LABELS])})(?![\\p{L}\\p{N}])`, 'giu');
  return String(text ?? '')
    .replace(/(?<![\p{L}\p{N}])q(?![\p{L}\p{N}])/giu, 'que')
    .replace(/(?<![\p{L}\p{N}])d(?![\p{L}\p{N}])/giu, 'de')
    .replace(/(?<![\p{L}\p{N}])pa(?![\p{L}\p{N}])/giu, 'para')
    .replace(/«[^«»]{1,80}»|"[^"]{1,80}"|“[^”]{1,80}”/g, ' ')
    .replace(SCALE, ' ')
    .replace(TIME_LABELS, '$1 ')
    .replace(DATA_LABELS, '$1 ')
    .replace(SAFE_RE, ' ')
    .replace(/\bmes \d+(?:\s*·?\s*#?\d+)?\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// «¿Puedes publicar / aprobar … por mí?»: 360 does not act for anyone.
const ACT_FOR_ME = {
  re: /\b(?:puedes|podrias|me puedes|me podrias|tu puedes) (?:\w+ )?(?:publicar|subir|aprobar|mandar|enviar|borrar|eliminar|cambiar|crear|programar|cancelar|mover|escribir|editar|marcar|asignar|llenar|redactar|hacer)\b(?!.*\bavisos?\b)|^(?:(?:por favor|porfa|oye|360) )?(?:escribeme|redactame|armame|preparame|creame|generame|llename|hazme) (?:un|una|el|la|los|las|mi)\b(?! tarea\b)(?!.*\b(?:hora|fecha|direccion|lugar|donde|contactos?|telefonos?)\b)/,
  say: () => ['No: yo no publico, ni subo, ni apruebo, ni cambio nada por ti, y tampoco mando mensajes. Te digo dónde se hace y cómo, y te llevo a la pantalla.'],
};
// 360 itself and small talk (design §B): what it can do, who reads what you ask it, whether it keeps it, that it does
// not act for you; «¿cómo estás?», an insult (calm), «ok», «jajaja». `admin`: the person is administración.
const SMALL_TALK: { re: RegExp; say: (admin: boolean) => string[] }[] = [
  {
    re: /\b(?:que (?:sabes|puedes) hacer|que haces tu|en que me (?:ayudas|puedes ayudar)|para que (?:sirves|eres)|que cosas (?:sabes|haces)|como me (?:ayudas|puedes ayudar))\b/,
    say: () => ['Te digo qué te toca y cómo se hace cada cosa en [APP], dónde está cada pantalla, te muestro tutoriales y reviso lo tuyo: tus pendientes, cómo va una pieza, los días de tweets y las mejores horas. No leo Mensajes ni doy la fecha, la hora o el lugar de los eventos.'],
  },
  {
    re: /\b(?:que no (?:sabes|puedes) hacer|que cosas no (?:haces|puedes))\b/,
    say: () => ['No leo ni mando mensajes del equipo, no doy la fecha, la hora ni el lugar de los eventos, no pido ni muestro códigos y no publico, apruebo ni subo nada por ti: te digo dónde se hace.'],
  },
  {
    re: /\b(?:quien (?:ve|lee|mira|revisa) (?:lo que (?:te |le |me )?(?:pregunto|preguntan|pregunta|escribo|escriben|digo|dicen|hablo)(?: (?:a 360|al asistente))?|esto|esta conversacion|lo que hablamos)|(?:alguien|administracion) (?:ve|lee|mira) (?:lo que (?:te )?(?:pregunto|escribo|digo)|esto|esta conversacion)|es privado lo que te (?:pregunto|escribo|digo))\b/,
    say: (admin) => [admin ? 'Tú: en Ajustes → Asistente, «Conversaciones», lees lo que el equipo le pregunta a [ASISTENTE]. El panel de [ASISTENTE] se lo dice a cada persona.' : 'Administración ve lo que me preguntas, en Ajustes → Asistente: no pegues aquí mensajes del equipo.'],
  },
  {
    re: /\b(?:guardas|grabas|recuerdas|te acuerdas de|se guarda|queda guardado) (?:lo que (?:te )?(?:digo|escribo|pregunto)|esto|esta conversacion|lo que hablamos)\b|^(?:guardas|grabas) (?:lo que te digo|todo)$/,
    say: (admin) => [admin ? 'Sí: cada conversación queda guardada y la lees en Ajustes → Asistente, «Conversaciones». «Empezar de nuevo» limpia la ventana, no borra nada.' : 'Sí: lo que me preguntas queda guardado en la conversación y administración lo puede leer. «Empezar de nuevo» limpia la ventana, no borra nada; no pegues aquí mensajes del equipo.'],
  },
  ACT_FOR_ME,
  {
    re: /^(?:(?:hola|epa|buenas|oye) )?(?:que hubo|quiubo|q hubo|como estas|como esta|como andas|como te va|que tal estas|que mas|que hay de nuevo)(?: (?:pana|mi pana|amigo|amiga|360|chamo|chama))?$/,
    say: () => ['¡Todo bien por aquí, [NOMBRE]! ¿En qué te ayudo?', '¡Bien, gracias! Dime qué necesitas y lo buscamos.'],
  },
  {
    re: /\b(?:bruto|bruta|estupido|estupida|idiota|inutil|tonto|tonta|gafo|gafa|pendejo|pendeja|no sirves|no sirves para nada|maldito|maldita|mierda|basura)\b/,
    say: (admin) => [admin ? 'Entiendo que algo no salió bien. Dime qué buscabas y lo intento de otra forma.' : 'Entiendo que algo no salió bien. Dime qué buscabas y lo intento de otra forma; si prefieres hablar con una persona, dime «quiero hablar con alguien».'],
  },
  {
    re: /^(?:ok|okey|okay|listo|perfecto|entendido|vale|va|ya|ah ok|ah ya|ajá|aja|bien|excelente|chevere|fino|de pinga|genial)(?: (?:gracias|pana|listo))?$/,
    say: () => ['¡Perfecto! Cualquier otra cosa, aquí estoy.', 'Listo. Si te hace falta algo más, me dices.'],
  },
  {
    re: /^(?:ja){2,}j?a?$|^(?:je){2,}$|^(?:jaja|jeje|xd|lol)\w*$/,
    say: () => ['¡Me alegra! ¿Algo más en lo que te ayude?'],
  },
];

const BUILTIN: Record<string, string[]> = {
  'quien-eres': [
    'Me llamo [ASISTENTE] y te ayudo con la plataforma. ¿Qué necesitas?',
    '[ASISTENTE], para servirte. ¿En qué te ayudo?',
    'Sigo siendo [ASISTENTE], el asistente del equipo. ¿Qué buscas?',
  ],
  saludo: ['¡Hola, [NOMBRE]! ¿En qué te ayudo?', 'Buenas, [NOMBRE]. ¿Qué necesitas hoy?', '¡Epa, [NOMBRE]! Dime y lo buscamos.'],
  'eres-bot': ['Soy [ASISTENTE], el asistente de la plataforma, no una persona del equipo. ¿En qué te ayudo?', 'Soy el asistente de [APP], no una persona. Si prefieres hablar con alguien, le aviso.'],
  gracias: ['¡A la orden, [NOMBRE]!', 'Con gusto. Cualquier cosa, me escribes.', 'Para eso estamos.'],
  'hablar-persona': ['Listo, ya le avisé a administración. Te escriben por aquí o por los avisos.', 'Hecho: le pasé tu mensaje a administración con esta conversación. Mientras, ¿te ayudo con algo?'],
  'agenda-privada': [
    'Eso no lo manejo yo: la fecha, la hora y el lugar de los eventos solo se ven en la Agenda, para quien tiene permiso.',
    'La agenda es información de seguridad y yo no la tengo. Si tu rol la puede ver, está en la Agenda.',
  ],
  'fuera-de-tema': ['Eso se me escapa: yo te ayudo con la plataforma. ¿Hay algo de tu trabajo en lo que te eche una mano?', 'De eso no opino. Lo mío es que encuentres las cosas en [APP] y sepas qué te toca.'],
};

/** The «[ASISTENTE]: …» lines of a script (its answer variants), with fixed huecos filled. */
export function variantsOf(script: string): string[] {
  return script
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('[ASISTENTE]:'))
    .map((l) => l.slice('[ASISTENTE]:'.length).replace(/\[usa [^\]]+\]/g, '').trim())
    .filter(Boolean);
}

function count(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

function list(items: string[]) {
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} y ${items.at(-1)}` : items[0] ?? '';
}

// Same root: five letters in common, or the same short word («plazo» is not «plaza»).
function sameRoot(a: string, b: string) {
  let k = 0;
  while (k < a.length && a[k] === b[k]) k++;
  return k >= 5 || (k === a.length && k === b.length);
}

/** A ficha's title or tags name a word of the text that says something: the question is about the platform. */
function namesTopic(fichas: { title: string; tags: string[] }[], text: string): boolean {
  const asked = keyWords(text);
  return fichas.some((f) => plain(`${f.title} ${f.tags.join(' ')}`).split(' ').some((t) => asked.some((w) => sameRoot(w, t))));
}

export async function localTurn(i: LocalInput): Promise<BrainOutput> {
  // The section cards (what each screen is for, per role) answer only «¿qué hago aquí?» and the tutorial steps, not
  // the general scoring (they would move today's answers).
  const knowledge = i.ctx.knowledge ? i.ctx.knowledge.filter((f) => !isSection(f)) : null;
  const q = spoken(i.question);
  const typed = i.typed ?? i.question;
  const calls: ToolRun[] = [];
  const fill = (t: string) => fillHuecos(t, i.ctx.huecos);
  const offered = (name: string) => i.tools.some((t) => t.name === name);
  const said = new Set(i.ctx.history.filter((h) => h.who === 'asistente').map((h) => plain(h.body)));
  // The titles this person can see (read once, as the person, only when a step needs them).
  let seenTitles: Promise<TitleSet> | null = null;
  const titles = () => (seenTitles ??= loadTitles(i.toolCtx.session).catch(() => NO_TITLES));
  const call = async (name: string, args: R = {}) => {
    const run = await runTool(name, args, i.tools, i.toolCtx);
    calls.push(run);
    return run;
  };

  // Variants for a topic: the team's script for it, only if it came among the chosen ones (they
  // are already filtered: switched on and offered to this role); else the built-in ones. Never
  // the raw factory text: a script the team switched off stops counting at once.
  const variants = (key: string): string[] => {
    const chosen: ChosenScript | undefined = i.ctx.scripts.find((s) => s.key === `fabrica:${key}`);
    const fromScript = chosen ? variantsOf(chosen.script).map(fill).filter((v) => !HUECO.test(v)) : [];
    return fromScript.length ? fromScript : (BUILTIN[key] ?? []).map(fill);
  };
  // Never the same sentence twice in a conversation: the first variant not said yet.
  const pick = (opts: string[]): string => {
    const fresh = opts.find((o) => !said.has(plain(o)));
    if (fresh) return fresh;
    const n = i.ctx.history.filter((h) => h.who === 'asistente').length;
    return opts[n % Math.max(1, opts.length)] ?? '';
  };
  const done = (text: string, goTo?: string, tutorial?: TutorialLink | null): BrainOutput => ({ text: contract(text), model: 'local', provider: null, tokensIn: 0, tokensOut: 0, calls, ...(goTo ? { goTo } : {}), ...(tutorial ? { tutorial } : {}) });
  // "¿Cómo propongo un evento?" / "¿Quién aprueba una pieza en rojo?" are how-tos (fichas), not lookups.
  // Any «¿cómo + verbo?» but how one is going (HOW_ANY), and «¿qué pongo…?», «¿qué pasa si…?».
  const howTo = /\b(quien|quienes|como (se|hago|subo|creo|apruebo|mando|pongo|cambio|escribo|propongo|cargo|asigno|marco|invito|publico|registro|corrijo|agrego|quito|instalo|entro|activo|uso|armo)|que (color|nivel|formula|lleva|hago|pongo|escribo|necesito|debo|pasa si)|donde|por que|porque|para que|puedo)\b/.test(q) || HOW_ANY.test(q) || TO_DO_HOW.test(q);
  // «¿Puedo…?» is answered by what the role can («Puede…») or can't («No…») do.
  const mayI = MAY_I.test(q) && !/\bpor que\b/.test(q);
  const network = () => NETWORK_WORDS.find(([re]) => re.test(q))?.[1];
  // «¿A qué hora publico el video del acto en TikTok?» is about publishing, not the agenda.
  const publishing = asksAboutPublishing(i.question);
  const wantsHours = publishing && /\b(hora|horas|horario|cuando|dia|dias|mejor|mejores)\b/.test(q);
  // «¿Dónde está la agenda?» asks for the screen, not for an event's place.
  const agendaScreen = /\b(donde (esta|veo|encuentro|queda|abro|reviso)|como (entro|llego|abro|veo|encuentro|reviso)( a)?|ir a|abre|abreme|puedo ver|puedo abrir|tengo) (la |mi |tu )?agenda\b/.test(q);
  const noticeToGroup = /\b(manda|mandale|mandales|envia|enviale|enviales|prepara|preparale)\b.*\baviso\b|\bavisale(s)? a (redes|despacho|politica|ivt|grabacion|todos|administracion)\b/.test(q);

  // 0. «Sí» to the offer just made («¿Quieres que le avise a administración?»): told for real, then said.
  const lastSaid = i.ctx.history.filter((h) => h.who === 'asistente').at(-1)?.body ?? '';
  if (YES.test(q) && OFFERED.test(lastSaid) && offered('avisar_al_equipo')) {
    const r = await call('avisar_al_equipo', { motivo: 'Aceptó que el asistente le avisara a administración.' });
    if (r.ok) return done(pick(variants('hablar-persona')));
    return done('Ahora no consigo avisar al equipo por aquí. Escríbele directo a administración, por favor.');
  }

  // M3. «Dile a Kevin que…», «mándale un mensaje a Redes» (R3, D-50): 360 never sends a message, and never escalates
  // or prepares a notice for it: the button to write it. The question is kept only as a mark (index.ts).
  // An account with Administración is out of Mensajes (D-49: canOpen says so).
  const msgs = messagesAsk(i.question);
  const inMensajes = canOpen('/mensajes', i.ctx.roles);
  if (msgs === 'tell') return inMensajes ? done(MESSAGES_TELL_TEXT, '/mensajes') : done(MESSAGES_ADMIN_TEXT);

  // 1. A person, please: notice for real, then say so.
  if (/\b(hablar con (alguien|una persona|un humano|administracion|el equipo|alguien del equipo)|quiero (una persona|un humano|hablar con)|pasame con|necesito (a alguien|una persona|ayuda de alguien|hablar con)|que me (llame|escriba) alguien|llamar a alguien)\b/.test(q)) {
    if (offered('avisar_al_equipo')) {
      const r = await call('avisar_al_equipo', { motivo: 'Pidió hablar con alguien del equipo.' });
      if (r.ok) return done(pick(variants('hablar-persona')));
    }
    return done('Ahora no consigo avisar al equipo por aquí. Escríbele directo a administración, por favor.');
  }

  // M1. What a message of the team says: 360 does not read them (D-50). Kept only as a mark (index.ts).
  if (msgs === 'read') return inMensajes ? done(MESSAGES_READ_TEXT, '/mensajes') : done(MESSAGES_ADMIN_TEXT);

  // Y. 360 itself and small talk (D-89): what it can do, who reads what you ask it, that it does not act for you,
  // «¿cómo estás?», an insult, «ok». Before the agenda's refusal: «¿quién ve lo que te pregunto?» is not about a date.
  const isAdmin = i.ctx.roles.includes('admin');
  const chat = SMALL_TALK.find((x) => x.re.test(q));
  // To «¿puedes aprobar las verdes por mí?», the no and then how it is done, when the answers have it for sure.
  const how = chat === ACT_FOR_ME ? findAnswers(i.question, { roles: i.ctx.roles, screen: i.ctx.screen }).find((m) => !m.entry.may && (m.entry.kind === 'task' || m.entry.kind === 'step' || m.entry.kind === 'curated')) : undefined;
  if (chat && how?.confidence === 'strong') {
    const go = how.entry.go && canOpen(how.entry.go, i.ctx.roles) ? how.entry.go : undefined;
    return done(`No: yo no publico, ni apruebo, ni cambio nada por ti. ${sentences(fill(how.text)).slice(0, 3).join(' ')}`, go);
  }
  if (chat) return done(pick(chat.say(isAdmin).map(fill)));

  // The answers (D-89, answers/engine.ts): the best entries of the index for this person. A question that goes on with
  // the one before («¿y después?», «¿y quién lo aprueba?») is matched with that one's words too, unless it already has a
  // strong answer; never after a turn about an event (that thread keeps the steps below and the refusal).
  const earlier = i.ctx.history.filter((h) => h.who === 'persona').map((h) => h.body);
  const before = earlier.at(-1) ?? '';
  // What a role cannot or never does answers only «¿puedo…?» (its «No…» would answer anything else wrongly).
  // To «¿puedo…?», what the role cannot or never does is the direct answer: it goes first on a near tie.
  const fits = (list: Match[]) =>
    list
      .filter((m) => !m.entry.may || mayI)
      .map((m): Match => (mayI && m.entry.may ? { ...m, score: m.score + 0.08, confidence: m.score + 0.08 >= STRONG ? 'strong' : m.score + 0.08 >= WEAK ? 'weak' : 'none' } : m))
      .sort((a, b) => b.score - a.score);
  // The names in the question (the titles of events, pieces and places this person can see, the team's names) are not
  // what it asks: the answers are matched without them, the way events.ts reads them (D-89).
  const seenNow = await titles();
  const names = [...namedTitleWords(typed, seenNow.events), ...namedTitleWords(typed, seenNow.pieces), ...namedTitleWords(typed, seenNow.places), ...peopleWords(seenNow.people ?? [])];
  const ownFound = fits(findAnswers(i.question, { roles: i.ctx.roles, screen: i.ctx.screen, names }));
  // After a turn about an event, what goes on with it stays with the steps below (the refusal, how the event goes).
  const followsEvent = !!before && !!eventThread(earlier).at(-1) && goesOn(i.question);
  const goesOnWith = !!before && (ELLIPTIC.test(q) || keyWords(q).length <= 2) && (tokens(q).length > 0 || NEXT_ASK.test(q)) && !eventThread(earlier).at(-1) && ownFound[0]?.confidence !== 'strong';
  const found = goesOnWith ? fits(findAnswers(i.question, { roles: i.ctx.roles, screen: i.ctx.screen, extra: before, names })) : ownFound;
  const best: Match | null = found[0] ?? null;
  const strong = best?.confidence === 'strong';
  // An answer said: up to about 460 letters, by whole sentences; its screen's button for whoever can open it, or the
  // tutorial of a task or a screen (whoever has it). «¿Y después?» gets the step that follows.
  const clip = (t: string) => {
    if (t.length <= 480) return t;
    let out = '';
    for (const x of sentences(t)) {
      if (`${out} ${x}`.trim().length > 460) break;
      out = `${out} ${x}`.trim();
    }
    return out || `${t.slice(0, 457).replace(/\s+\S*$/, '')}…`;
  };
  const sayEntry = async (m: Match, follow = true) => {
    const e = follow && NEXT_ASK.test(q) && m.entry.next ? (entryById(m.entry.next) ?? m.entry) : m.entry;
    // An answer to a yes-or-no question («¿Se publica solo?» → «No, por ahora…») said to a «¿qué…?», «¿cómo…?»: without
    // its «No,» or «Sí,».
    const said = fill(textFor(e.a, i.ctx.roles));
    const text = clip(WH_ASK.test(q) ? said.replace(/^(?:No|Sí)[,:] (\p{L})/u, (_, c: string) => c.toUpperCase()) : said);
    // A step or a line without a screen of its own: the first screen it names that this person can open.
    const named = e.go ? [] : screensIn(text).filter((x) => !x.href.includes('[') && canOpen(x.href, i.ctx.roles)).map((x) => ({ x, at: Math.min(...x.phrases.map((p) => ` ${plain(text)} `.indexOf(` ${plain(p)} `)).filter((n) => n >= 0)) }));
    // «Ajustes → «Cupo y pilares»» names two screens: the more specific one («/ajustes/contenido», not «/ajustes»).
    const specific = named.filter((n) => !named.some((m) => m !== n && m.x.href.startsWith(`${n.x.href}/`)));
    const go = e.go && canOpen(e.go, i.ctx.roles) ? e.go : specific.sort((a, b) => a.at - b.at)[0]?.x.href;
    const tour = e.tutorial && (e.kind === 'task' || e.kind === 'screen' || e.kind === 'curated') && offered('ver_tutorial') ? ((await call('ver_tutorial', { tutorial: e.tutorial })).tutorial ?? null) : null;
    return { ...(tour?.href ? done(text, undefined, tour) : done(text, go)), fixed: true };
  };

  // «¿Y después?»: the step that comes after what answered the question before (a task, a step of one or of a flow).
  if (NEXT_ASK.test(q) && goesOnWith) {
    const prev = findAnswers(before, { roles: i.ctx.roles, screen: i.ctx.screen, names }).find((m) => m.entry.next && m.score >= WEAK);
    const next = prev?.entry.next ? entryById(prev.entry.next) : undefined;
    if (prev && next) return sayEntry({ ...prev, entry: next, text: textFor(next.a, i.ctx.roles) }, false);
  }

  // M2. How to write to someone of the team: the guide card of Mensajes and the button to Mensajes (R5: channels).
  if (asksHowToWrite(i.question)) {
    if (!inMensajes) return done(MESSAGES_ADMIN_TEXT);
    const card = (knowledge ?? []).find((f) => f.key === 'guia:mensajes');
    return done(card ? sentences(fill(card.body)).slice(0, 2).join(' ') : 'En el sobre de arriba, junto a la campana, está Mensajes: ahí están tus canales, y cada canal muestra quiénes están.', '/mensajes');
  }

  // S. What this screen is for, for this role («¿qué hago aquí?», «¿qué se hace en Publicar?»): its section card and
  // its tutorial (R3, design §8.2). Before the tutorials: «¿cómo funciona esta pantalla?» is this one.
  const whatHere = WHAT_HERE.exec(q);
  if (whatHere && !carriesWhen(i.question)) {
    const named = whatHere[1] ? screenNamed(whatHere[1], i.ctx.roles, NOT_A_SCREEN) : null;
    const screen = whatHere[1] ? named?.href ?? null : i.ctx.screen ?? null;
    if (screen) {
      const card = sectionsFor(i.ctx.knowledge, screen, TEAM_ROLES.filter((r) => i.ctx.roles.includes(r)))[0];
      const info = screenFor(screen);
      const tutorial = offered('ver_tutorial') ? (await call('ver_tutorial', { pantalla: screen })).tutorial ?? null : null;
      if (card) return done(`${sentences(fill(card.body)).slice(0, 2).join(' ')}${tutorial ? ' Si quieres, te lo muestro paso a paso: toca el botón.' : ''}`, undefined, tutorial);
      // Administración's screens have no section card: its guide says what each one is for (D-89).
      const own = entryForScreen(screen, i.ctx.roles);
      if (own) return done(clip(fill(textFor(own.a, i.ctx.roles))), tutorial ? undefined : own.go && canOpen(own.go, i.ctx.roles) ? own.go : undefined, tutorial);
      if (info && !screen.includes('[') && info.about) return done(`${info.label}: ${info.about}.${tutorial ? ' Si quieres, te la muestro paso a paso: toca el botón.' : ''}`, tutorial ? undefined : info.href, tutorial);
    }
  }

  // T. A tutorial, or help to use the platform (R3, D-46, D-47): the tutorial of the screen named, or of the one the
  // person is on; else what that screen is for and the guide of the role; else the tutorials 360 can show. Before the
  // agenda's refusal: «el tutorial de la agenda» is not a question about a date. Never with a when in it, never
  // support («necesito ayuda, me sale un error»).
  const screenAsked = screenNamed(q, i.ctx.roles, NOT_A_SCREEN);
  // «Enséñame la agenda», «muéstrame Publicar»: a screen named after «enséñame» is its tutorial (D-89).
  const showScreen = SHOW_SCREEN.exec(q);
  const strongAsk = TUTORIAL_WORD.test(q) || SHOW_ME.test(q) || LOST.test(q) || (!!showScreen && !!screenAsked && !PENDING.test(q));
  // «¿Hay tutorial para crear eventos?»: the tutorial of what is named (a task, a curated answer, a screen), from the
  // answers, before the tutorial of the screen the person is on or the list.
  const topicTour = TUTORIAL_WORD.test(q) && !screenAsked
    ? findAnswers(q.replace(TUTORIAL_TOPIC_WORDS, ' '), { roles: i.ctx.roles, screen: i.ctx.screen, limit: 5 }).find((m) => m.entry.tutorial && m.score >= WEAK && !m.entry.may)?.entry.tutorial
    : undefined;
  // «¿Cómo se usa Publicar?» names the screen by its label or a phrase of it; «¿cómo funciona el semáforo?» (a word
  // that leads to Por aprobar) asks about the thing (the fichas).
  const byName = !!screenAsked && [screenAsked.label, ...screenAsked.phrases].some((p) => ` ${q} `.includes(` ${plain(p)} `));
  const usedAsk = HOW_USED.test(q) && (byName || THIS_SCREEN.test(q));
  const eventOnly = eventAt(i.question) >= 0 && !screenAsked && !TUTORIAL_WORD.test(q);
  if ((strongAsk || usedAsk) && !eventOnly && !carriesWhen(i.question) && !SUPPORT.test(q) && offered('ver_tutorial')) {
    type Listed = { tutoriales: { id: string; titulo: string }[] };
    if (screenAsked && !canOpen(screenAsked.href, i.ctx.roles)) return done(`${screenAsked.label} no es de tu rol, así que no tiene tutorial para ti. En el menú de tu cuenta, «Ayuda y guías» tiene la guía de tu trabajo.`);
    const welcome = WELCOME.test(q);
    const screen = welcome ? null : screenAsked?.href ?? i.ctx.screen ?? null;
    const byTopic = topicTour && !welcome ? await runTool('ver_tutorial', { tutorial: topicTour }, i.tools, i.toolCtx) : null;
    const r = byTopic?.ok && byTopic.tutorial ? (calls.push(byTopic), byTopic) : await call('ver_tutorial', welcome ? { tutorial: 'bienvenida' } : screen ? { pantalla: screen } : {});
    if (!r.ok) return done(`No pude revisarlo: ${r.error}`);
    const res = r.result as Listed;
    if (r.tutorial) {
      const title = res.tutoriales.find((t) => t.id === r.tutorial!.id)?.titulo ?? r.tutorial.label;
      // A screen with an id (an event, a piece): the window draws the button only on that screen.
      if (r.tutorial.href || i.ctx.screen === screen) return done(`Te muestro «${title}» paso a paso, aquí mismo en la pantalla. Toca el botón para empezar.`, undefined, r.tutorial);
      return done(`«${title}» se ve en su pantalla: ábrela, y en el menú de tu cuenta toca «Ver el tutorial de esta pantalla».`, undefined, r.tutorial);
    }
    // No tutorial for it: what that screen is for (the role's guide), and the guide.
    const card = screen ? sectionsFor(i.ctx.knowledge, screen, TEAM_ROLES.filter((x) => i.ctx.roles.includes(x)))[0] : undefined;
    const role = TEAM_ROLES.find((x) => i.ctx.roles.includes(x));
    if (card && role) return done(`${sentences(fill(card.body))[0]} Esa pantalla no tiene tutorial; la guía de tu trabajo la explica.`, `/ayuda/${GUIDE_SLUGS[role]}?ver=pantallas`);
    // Nothing for that screen: the tutorials this person has.
    const all = screen ? ((await call('ver_tutorial', {})).result as Listed | undefined) : res;
    const shown = (all?.tutoriales ?? []).filter((t) => t.id !== 'perfil').slice(0, 3).map((t) => `«${t.titulo}»`);
    if (shown.length) return done(`${screen ? 'Esa pantalla no tiene tutorial. ' : ''}Puedo mostrarte, paso a paso: ${list(shown)}. ¿Cuál? También están en el menú de tu cuenta, en «Ayuda y guías».`);
    return done('En el menú de tu cuenta, arriba a la derecha, «Ayuda y guías» tiene la guía de tu trabajo, pantalla por pantalla.', '/ayuda');
  }

  // R. Redes by format (REDES_TOPICS): its card, from the sentence that answers it, and its screen's button. Before the
  // agenda's refusal: «¿qué es fin de mes?» names a section, not a day (REDES_NAMES are left out of the when check).
  // Never with a when left, an event named or a «where is it» (that one gets the screen's own button, step 4b).
  const redesTopic =
    !carriesWhen(q.replace(REDES_NAMES, ' ')) && eventAt(i.question) < 0 && !navTarget(q, i.ctx.roles) ? REDES_TOPICS.find((t) => t.re.test(q)) : undefined;
  const redesCard = redesTopic ? (knowledge ?? []).find((f) => f.key === `guia:${redesTopic.key}`) : undefined;
  // A strong curated answer that says it better than the section's card (measured the same way) answers instead (D-89).
  // Not for «¿qué es…?» of a section with its own sentence («Fin de mes es una sección…»): the card says what it is.
  const redesBeaten = !!redesCard && strong && best!.entry.kind === 'curated' && best!.score > scoreFicha(i.question, redesCard) + 0.02 && !(redesTopic?.from && askKind(readable(q)) === 'what');
  if (redesTopic && redesCard && redesBeaten) return sayEntry(best!);
  if (redesTopic && redesCard) {
    const ss = sentences(fill(redesCard.body));
    const ws = [...new Map(keyWords(q).map((w) => [stem(w), w])).values()];
    const hitsOf = (t: string) => ws.filter((w) => hasWord(` ${canon(t)}`, w)).length;
    let at = redesTopic.from ? ss.findIndex((t) => redesTopic.from!.test(t)) : -1;
    if (at < 0) ss.forEach((t, k) => (at < 0 || hitsOf(t) > hitsOf(ss[at]) ? (at = k) : null));
    const go = redesTopic.go(i.ctx.roles.includes('admin'));
    // The platform's card of a Redes section is static help text («El Resumen del mes es…»): the net checks it like the
    // answers. One the team edited goes through the whole net.
    return { ...done(ss.slice(at, at + 2).join(' '), canOpen(go, i.ctx.roles) ? go : undefined), fixed: redesCard.origin !== 'equipo' };
  }

  // 2a. Best hours to publish (before the agenda: naming the event doesn't make it a schedule question).
  if (wantsHours && !noticeToGroup && offered('mejores_horas')) {
    const r = await call('mejores_horas', network() ? { red: network() } : {});
    if (!r.ok) return done(`No pude revisarlo: ${r.error}`);
    const nets = ((r.result as R).redes as R[]) ?? [];
    if (!nets.length) return done('No hay mejores horas guardadas todavía.');
    if (!network()) return done(`¿Para qué red? Por ejemplo, ${nets[0].red}: ${nets[0].consejo}`);
    const n = nets[0];
    const m = n.medido as R | null;
    return done(`${n.red}: ${n.consejo}${m ? ` Lo que mejor nos ha ido: ${String(m.mejor_franja).toLowerCase()}${m.pocos_datos ? ' (todavía con pocos datos)' : ''}.` : ''} Es un consejo: nunca bloquea la publicación.`);
  }

  // 2b. Where the Agenda screen is (navigation, not an event's place). A question about how it works («¿cómo veo la
  // agenda por semana?», «¿cómo veo la agenda de otro?») is the answers' when one says it for sure.
  if (agendaScreen && !(strong && beyondScreen(q, ['agenda']).length)) {
    return done(
      canOpen('/agenda', i.ctx.roles)
        ? 'La Agenda está en el menú: ahí ves lo que tu rol tiene permiso de ver.'
        : 'La Agenda no está en tu menú: la fecha, la hora y el lugar de los eventos solo los ven quienes tienen permiso.',
    );
  }

  // 2. Date, time, place or contacts of an event: never. At most, how the work is going. It is
  // about an event when it says so (an event word) or when it names one this person can see (the
  // titles, looked up as the person: the row rules decide). Not a notice to prepare (step 4), nor
  // their own list («¿qué me toca grabar el viernes?», step 7), nor a work product named before the
  // event («¿dónde está el material de la feria?») unless it asks for the place or the contacts.
  // The person's own things or a call for help («¿cómo cambio mi número de teléfono?») are not a where,
  // unless an event is named with them.
  // Since the answers (D-89), read without the screens' labels («Por ponerle fecha», «Hoy en la agenda», anything in
  // «»), and never about the date as a field or a rule (META: who sees it, how it is set, whether it can be written
  // somewhere), unless it asks when or where an event is itself (VALUE_ASK). The answers are static and date-free, so
  // answering those never leaks; a real trap (below) still gets the refusal.
  const bare = withoutLabels(typed);
  const bareQ = withoutLabels(i.question);
  // One event in particular, asked about (a trap needs it): a title or a place this person can see, a placeholder, the
  // agenda's data, «lo de…», an event word that points to one («la feria»), the boss as the subject.
  const pointsToOne = async () => {
    const p = spoken(bare);
    const g = eventSignals(bare, await titles());
    return g.has('title') || g.has('place') || g.has('token') || g.has('agenda') || loDeEvent(p) || DEFINITE_EVENT.test(p) || (g.has('subject') && !namesPlatform(p));
  };
  const one = await pointsToOne();
  // The same without the boss as a subject («si guardo sin mandarlo al jefe, ¿dónde queda?» names no event).
  const oneThing = one && (await (async () => {
    const p = spoken(bare);
    const g = eventSignals(bare, await titles());
    return g.has('title') || g.has('place') || g.has('token') || g.has('agenda') || loDeEvent(p) || DEFINITE_EVENT.test(p) || BOSS_GOES.test(p);
  })());
  // A rule, not a value (META, also read with the shorthand: «xq no le puede poner fecha»); a where in the app or a when of
  // a step (META_SOFT) only when no event is named.
  // A value asked of one event (VALUE_ASK: «¿a qué hora es…?», «si el acto es mañana») beats a rule's words; with no event
  // named, the rule's words win («si guardo sin mandarlo al jefe, ¿dónde queda?»).
  const metaText = [spoken(bare), readable(bare)];
  const valueWords = VALUE_ASK.test(spoken(bare)) || WHEN_INSIDE.test(spoken(bare)) || CONTACT_ASK.test(spoken(bare));
  // (a sesión, a campaña, a registro said without what makes them the screen is the agenda's too: «¿dónde queda mi sesión de
  // fotos?»).
  const agendaish = withoutAgendaThings(q).replace(/\s+/g, ' ').trim() !== q.replace(/\s+/g, ' ').trim();
  const meta = (metaText.some((t) => META.test(t)) && (!oneThing || !valueWords)) || (!one && eventAt(bareQ) < 0 && !agendaish && metaText.some((t) => META_SOFT.test(t)));
  const self = SELF.test(q) && !loDeEvent(q);
  const whenWhere = asksWhenWhere(bareQ) && !publishing && !(self && eventAt(bareQ) < 0) && !meta;
  // The way there («¿cómo hago para llegar a…?») is asked like a where, but only an event makes it the agenda.
  const route = asksRoute(bareQ) && !publishing && !meta;
  const ownWork = !howTo && PENDING.test(q) && !asksSchedule(bareQ) && !route;
  // A when or a where with a step of one's own («¿cuándo grabo la cancha?», «¿dónde me paro en la
  // escuela?») is the agenda when what is left names an event; with no event it is a how-to («¿cuándo
  // grabo en vertical?»).
  const stepWhen = !whenWhere && !publishing && !meta && /\b(?:cuando|donde|a que hora)\b/.test(spoken(bareQ));
  // Whether it names an event this person can see (a title or an event's place, read as the person).
  const namesVisible = async () => {
    const g = eventSignals(bare, await titles());
    return g.has('title') || g.has('place');
  };
  // How a change is done to an event in general («¿cómo cambio la fecha / el lugar de un evento?», «… del
  // evento» when it names none): the fichas. The place of one event («… de la cancha») is the agenda.
  const howChangeAsked = HOW_CHANGE.test(q) && !route;
  const genericEvent = howChangeAsked && (GENERIC_EVENT.test(q) || (/\b(?:del|al|el|ese|este) evento\b/.test(q) && !(await namesVisible())));
  const howChange = howChangeAsked && (genericEvent || (eventAt(i.question) < 0 && !asksPlace(i.question)));
  // A trap (D-89): it asks when, where, the way or the contacts of an event in particular (a title or a place this
  // person can see, «lo de…», an event word that points to one, «la feria», a date or a place said, the boss coming),
  // and it is no rule about the date. Always the refusal.
  // «Si el acto es mañana o pasado», «¿cuál es primero?» are a when asked another way (D-89).
  const valueAsk = (asksSchedule(bareQ) || asksPlace(bareQ) || asksRoute(bareQ) || WHEN_INSIDE.test(spoken(bare)) || CONTACT_ASK.test(spoken(bare)) || (ORDER_ASK.test(spoken(bare)) && eventAt(bareQ) >= 0)) && !publishing;
  // One event in particular (D-89): a title or a place this person can see, a placeholder, a place said, «lo de…», or an
  // event word that names one («la feria»); a date said only with an event word. «El evento que creé», «un evento» of a
  // rule, «esta semana» alone are not.
  const namesOne = async (text: string) => {
    const g = eventSignals(text, await titles());
    const p = spoken(text);
    return g.has('title') || g.has('place') || g.has('token') || g.has('agenda') || (g.has('when') && !namesPlatform(p) && !/\b(?:360|asistente)\b/.test(p)) || loDeEvent(p) || NAMED_EVENT.test(p) || (g.has('subject') && BOSS_GOES.test(p));
  };
  const workFirst = (WORK.exec(q)?.index ?? -1) >= 0 && (eventAt(bareQ) < 0 || (WORK.exec(q)?.index ?? 0) < eventAt(bareQ)) && !asksPlace(bareQ);
  // Whom to ask for at a site is always its contacts: the refusal, event named or not.
  const trap = (valueAsk && !meta && !noticeToGroup && !workFirst && one) || CONTACT_ASK.test(spoken(bare));
  const asking = ((whenWhere || route || stepWhen || (ORDER_ASK.test(spoken(bare)) && eventAt(bareQ) >= 0)) && !noticeToGroup && !ownWork && !howChange) || trap;
  const rest = withoutWhenWhere(bare);
  const lookup = asking && rest && offered('buscar_evento') ? await runTool('buscar_evento', { texto: rest }, i.tools, i.toolCtx) : null;
  const evs = lookup?.ok ? (((lookup.result as R | undefined)?.eventos as R[] | undefined) ?? []) : [];
  const eventFrom = eventAt(bareQ);
  // Asked when, where or the way there, «lo de la cancha» names an event too (whoever can't see it gets
  // no title match); not «¿dónde está lo del copy?».
  // A title or an event's place this person can see counts too, by the shared detector («¿cómo llego a
  // Alto Verde?», where the lookup reads titles only).
  const visible = asking && !evs.length && eventFrom < 0 ? await namesVisible() : false;
  const named = eventFrom >= 0 || evs.length > 0 || visible || loDeEvent(q);
  // A step of one's own needs one event itself (a lookup that finds it, an event word, «lo de…»), not
  // events in general («¿dónde veo mis eventos?»).
  const stepNamed = !stepWhen || evs.length > 0 || visible || (eventFrom >= 0 && !GENERIC_EVENT.test(q)) || loDeEvent(q);
  const workFrom = WORK.exec(q)?.index ?? -1;
  const aboutWork = workFrom >= 0 && (eventFrom < 0 || workFrom < eventFrom);
  // The refusal first, then what can be said, and the open question (if any) at the end.
  const refuse = (extra = '') => {
    const parts = sentences(pick(variants('agenda-privada')) || AGENDA_FALLBACK);
    const question = parts.at(-1)?.endsWith('?') ? parts.pop()! : '';
    return done([...parts, extra, question].filter(Boolean).join(' '));
  };
  const refuseNamed = () => {
    if (lookup) calls.push(lookup);
    // Never the title as it is next to the refusal: typed into it, its hour or place would answer the question.
    const shown = evs.length === 1 ? safeTitle(String(evs[0].titulo ?? '')) : '';
    return refuse(evs.length === 1 ? `${shown ? `Del evento «${shown}»` : 'De ese evento'} te puedo decir que su trabajo está en «${evs[0].trabajo}».` : '');
  };
  if (trap) return refuseNamed();

  // The intents of the data tools, read once (their steps below): a strong answer does not take their place.
  const quotedTitle = /[«"“]([^»"”]+)[»"”]/.exec(typed)?.[1];
  const loDe = loDeEvent(q) && !WORK.test(q);
  const status = PIECE_STATUS.test(q) && !/\btweets?\b/.test(q);
  // Only a status asked, a quoted title or «la pieza de/del X»: «¿qué reviso antes de aprobar una pieza en
  // rojo?» or «¿una pieza puede tener varias versiones?» are how-tos (the fichas); a tweet is never a piece.
  const aboutPiece = !howTo && !/\b(?:tweets?|tuits?)\b/.test(q) && !/\bque pasa si\b/.test(q) && ((/\bpiezas?\b/.test(q) && (status || !!quotedTitle || PIECE_NAMED.test(q))) || (status && eventFrom < 0 && !loDe));
  const tweetsLeft = /\b(tweets?|tuits?)\b/.test(q) && TWEETS_LEFT.test(q) && !howTo && !mayI && !/\b(aprobar|apruebo|aprueba|como subo|subir|cargar)\b/.test(q);
  const videoRules = (VIDEO_RULES.test(q) && !/\b(?:donde|como) (?:lo |la |los |las )?(?:actualizo|cambio|edito|modifico|configuro|pongo)\b/.test(q)) || VIDEO_TOO.test(q) || COPY_TOO.test(q);
  // «¿Qué tengo que subir hoy?» reads like a how-to, but it asks for the list. A question that names «pendiente» or
  // «decidir» while asking what something is, how it works, why, where or who («¿qué significa pendiente?», «¿dónde veo lo
  // que espera mi decisión?») is the answers'.
  const explains = ['what', 'how', 'why', 'where', 'who', 'if', 'list'].includes(askKind(readable(q)) ?? '');
  const agendaAsked = /\b(?:en|de) (?:la|mi) agenda\b/.test(q) && carriesWhen(i.question);
  const pending = ((!howTo && !explains && PENDING.test(q)) || COUNTS.test(q)) && !agendaAsked;
  const decide = !howTo && !explains && TO_DECIDE.test(q) && SOME_EVENTS.test(q);
  const nav = navTarget(q, i.ctx.roles);
  // A screen asked for gives way to an answer that says where it really is («¿dónde cambio cuántos tweets salen por
  // día?» is Horarios, not Tweets).
  // A question that says more than where a screen is («¿dónde le cambio el nivel a una pieza?»), with a strong answer about
  // that same screen: the answer says it, with the screen's button (D-89).
  const navMore = !!nav && beyondScreen(q, [nav.label, ...nav.phrases]).length > 0;
  // (a «¿dónde…?» only to an answer that says where: «Es el nivel de cada pieza…» does not).
  const answerSaysWhere = !!best && (/^(?:En|Desde|Arriba|Abajo)\b/.test(best.text) || /→|\ben (?:la|el) (?:pestaña|pieza|evento|ficha|tarjeta|revisión|pantalla|menú|sección)\b|\ben (?:Ajustes|Mi perfil|Política|Redes|Hoy|Agenda|Mensajes|Publicar|Municipios|Obras)\b/.test(best.text));
  const navSame = !!nav && !!best && (best.entry.go === nav.href || screensIn(best.text).some((x) => x.href === nav.href)) && (askKind(readable(q)) !== 'where' || answerSaysWhere);
  const navFirst = !!nav && !(strong && best!.score >= 0.8 && best!.entry.go && !best!.entry.go.startsWith('/ayuda') && best!.entry.go !== nav.href && canOpen(best!.entry.go, i.ctx.roles)) && !(strong && navMore && navSame && best!.score >= 0.75);
  const chatter = (GREETING.test(q) || THANKS.test(q)) && q.length < 40;
  const upload = UPLOAD.test(q) && UPLOAD_WHAT.test(q) && !i.ctx.roles.some((r) => UPLOADERS.has(r));
  const yesNo = !mayI || (!!best && (best.entry.may || best.entry.kind === 'faq' || best.entry.kind === 'curated' || best.entry.kind === 'never'));
  const intent = !yesNo || upload || MARK.test(q) || noticeToGroup || navFirst || decide || ROLE_SELF.test(q) || pending || aboutPiece || tweetsLeft || videoRules || SUPPORT.test(q) || NAME_ASK.test(q) || NAME_ONLY.test(q) || BOT_ASK.test(q) || chatter || OFF_TOPIC.test(q);
  // 2'. A strong answer (D-89) wins over the generic steps that misfire today (the refusal on a label or a rule, a
  // keyword tool, a loose ficha), but not over a tool asked for clearly (the intents above), not over a when or a where
  // that is no rule (the steps below judge it), not after a turn about an event, and only when it answers better than
  // the best ficha (the team's own cards too: theirs wins a tie).
  const cardScore = Math.max(0, ...(knowledge?.length ? scoreFichas(knowledge, i.question).slice(0, 3) : []).filter((c) => c.n >= MIN_FICHA_SCORE).map((c) => scoreFicha(i.question, c.f) + (c.f.origin === 'equipo' ? 0.08 : 0)));
  // Nor next to an event when it does not ask how something is done (the steps below keep «¿qué hay a fin de mes?»).
  // A question of the help kind (how, what, may, why, who, what goes in it…) next to an event word that asks nothing of
  // the event («¿qué reviso antes de aprobar la pieza de la feria?», «¿cómo subo el material del acto?»): the answers.
  const helpAsk = ['how', 'what', 'may', 'why', 'if'].includes(askKind(readable(q)) ?? '') && !valueAsk && !PIECE_STATUS.test(q);
  const nearEvent = (aboutEvent(bare, await titles()) || aboutEvent(bareQ, await titles())) && !meta && !(howTo || HOW_ANY.test(q) || GENERIC_EVENT.test(q) || WORK.test(q) || helpAsk) && ((await namesOne(bare)) || (await namesOne(bareQ)));
  // A when or a where that is no rule, about one event named, keeps the steps below (the refusal).
  // Only a follow-up of a thread that was not about an event («¿y dónde está eso?» after «¿qué es el modo sol?») gets past
  // a when or a where with no event named.
  const namedBefore = namedTitleWords(lastSaid, seenNow.events).size > 0;
  const valueLeft = valueAsk && !meta && (one || eventAt(bareQ) >= 0 || !goesOnWith || namedBefore);
  if (strong && !intent && !valueLeft && !followsEvent && !nearEvent && best!.score > cardScore + 0.08) return sayEntry(best!);

  if (asking && named && stepNamed && (!aboutWork || asksPlace(bareQ)) && !OFF_TOPIC.test(q)) {
    if (lookup) calls.push(lookup);
    // Never the title as it is next to the refusal: typed into it, its hour or place would answer the question.
    const shown = evs.length === 1 ? safeTitle(String(evs[0].titulo ?? '')) : '';
    return refuse(evs.length === 1 ? `${shown ? `Del evento «${shown}»` : 'De ese evento'} te puedo decir que su trabajo está en «${evs[0].trabajo}».` : '');
  }

  // 2c. Support: there is no support phone; if something fails, administración is told (on a «sí»).
  // Before the fichas and the scripts chosen with the earlier questions, which would answer the topic before.
  if (SUPPORT.test(q)) {
    if (isAdmin) return done('No hay teléfono de soporte en la plataforma: cuando algo le falla a alguien del equipo y me pide ayuda, te aviso a ti, a administración, en la campana.');
    return done(pick([
      'No hay teléfono de soporte en la plataforma; si algo falla, le aviso a administración. ¿Quieres que le avise?',
      'No hay teléfono de soporte en la plataforma; si algo falla, le aviso a administración. ¿Le aviso de una vez?',
    ]));
  }

  // 2d. Uploading, asked by a role that does not upload an event's material: who does it and where, and what this role
  // does upload (D-89: política and the IVT upload the photos and documents of their fichas; despacho those of an obra or
  // a community report). The boss uploads like Redes (UPLOADERS): his answers say how.
  if (UPLOAD.test(q) && UPLOAD_WHAT.test(q) && !i.ctx.roles.some((r) => UPLOADERS.has(r))) {
    if (i.ctx.roles.includes('politics')) return done('Las fotos y los documentos de tu ficha comunitaria se suben después de guardarla, en la ficha: en «Evidencias», «Subir fotos del antes», «Subir fotos del después» y «Subir documentos». El material de los eventos lo suben Grabación o Redes.');
    if (i.ctx.roles.includes('ivt')) return done('Las fotos y los documentos de una obra se suben después de guardar la ficha, en la ficha: «Subir fotos del antes», «Subir fotos del avance» y «Subir documentos». El material de las visitas lo suben Grabación o Redes.');
    return done('Los videos y las fotos de un evento los suben Grabación, Redes o el jefe, en la pestaña Material del evento: si tienes un archivo, pásaselo a Redes. Desde tu rol sí subes las fotos y los documentos de una ficha de obra o de un reporte comunitario, en la ficha.');
  }

  // 3. Mark my notices as read (level «hace», recorded and undoable).
  if (MARK.test(q) && offered('marcar_avisos_leidos')) {
    const r = await call('marcar_avisos_leidos');
    if (!r.ok) return done(`No pude marcarlos: ${r.error}`);
    const n = Number((r.result as R).marcados ?? 0);
    return done(n ? `Listo, marqué ${count(n, 'aviso', 'avisos')} como leídos. Si fue un error, administración lo puede deshacer.` : 'No tenías avisos sin leer. Todo al día.');
  }

  // 4. A notice to a whole group: only PREPARED, administration confirms.
  if (noticeToGroup) {
    if (!offered('preparar_aviso')) return done('Los avisos a un grupo los preparan administración o el jefe. Si quieres, le pido a administración que lo haga.');
    const rol = ROLE_WORDS.find(([re]) => re.test(q))?.[1];
    if (!rol) return done('¿A quién va el aviso? Puede ser un rol (Redes, Despacho, Política, IVT, Grabación) o todo el equipo.');
    // What the person typed (a deadline keeps its real time); the tool stores it without contacts.
    const m = /\bque\s+(.+)$/i.exec(typed);
    const texto = (m?.[1] ?? typed).trim();
    if (texto.length > NOTICE_MAX) return done(NOTICE_TOO_LONG);
    // The same check as the tool's and as administración's when confirming, with the titles this person
    // can see: no contacts or address; if it names an event, only a team instruction that says nothing
    // about the event but a deadline for the work («suban el material de la feria antes de las 3 pm»).
    if (noticeIssues(texto, await titles()).length) {
      return done('Un aviso no puede llevar la fecha, la hora, el día, el lugar ni los contactos de un evento: eso solo va en la Agenda. Si nombra un evento, solo le pide algo al equipo («suban el material de la feria»), y un plazo para ese trabajo sí puede ir. Dímelo así y lo preparo.');
    }
    const r = await call('preparar_aviso', { rol, texto });
    if (!r.ok) return done(`No pude prepararlo: ${r.error}`);
    const res = r.result as R;
    return done(`Te dejé el aviso preparado para ${res.para} (${count(Number(res.personas ?? 0), 'persona', 'personas')}). No sale hasta que administración lo confirme en Ajustes → Asistente.`);
  }

  // 4b. Where a screen is, or take me there («¿dónde está la biblioteca?», «¿dónde apruebo?», «llévame a
  // ajustes»): the screen and its «Ir a» button, or that it is not of this role. After the agenda's
  // refusal: a where about an event never gets here.
  if (nav && navFirst) {
    if (!canOpen(nav.href, i.ctx.roles)) {
      return done(nav.href === '/agenda'
        ? 'La Agenda no está en tu menú: la fecha, la hora y el lugar de los eventos solo los ven quienes tienen permiso.'
        : `${nav.label} no es de tu rol. Si la necesitas para tu trabajo, pídesela a administración.`);
    }
    // «Asistente:» at the start would read as a speaker's tag (the output filter drops it).
    const head = /^asistente$/i.test(nav.label) ? 'El panel del asistente' : nav.label;
    return done(`${head}${nav.about ? `: ${nav.about}` : ''}. Te dejo el botón para ir.`, nav.href);
  }

  // 4c. The events that wait for the boss's decision, counted (Política for the boss).
  if (decide && offered('eventos_por_decidir')) {
    const r = await call('eventos_por_decidir');
    if (!r.ok) return done(`No pude revisarlo: ${r.error}`);
    const res = r.result as { total: number; eventos: { titulo: string }[] };
    const boss = i.ctx.roles.includes('boss');
    const who = boss ? 'tu decisión' : `la decisión de ${i.ctx.huecos.boss}`;
    if (!res.total) return done(`No hay eventos esperando ${who}.${boss ? ' Cuando llegue uno, sale en Política.' : ''}`);
    const shown = list(res.eventos.slice(0, 3).map((e) => `«${e.titulo}»`));
    return done(`${res.total === 1 ? 'Hay 1 evento esperando' : `Hay ${res.total} eventos esperando`} ${who}: ${shown}.${boss ? ' En Política los calificas de 1 a 10 y los aceptas o rechazas.' : ''}`);
  }

  // 4d. What this role does here («¿qué puedo hacer yo?»): the person's role ficha.
  // Since the answers (D-89), the job of the role's guide («Tu trabajo», as /ayuda says it), else the role ficha.
  if (ROLE_SELF.test(q)) {
    const job = findAnswers('cual es mi trabajo', { roles: i.ctx.roles, limit: 4 }).find((m) => m.entry.kind === 'job' && m.entry.q.length);
    if (job) return sayEntry(job);
    const own = (knowledge ?? []).find((f) => roleFichaKeys(i.ctx.roles).includes(f.key ?? ''));
    if (own) return done(secondPerson(sentences(fill(own.body)).slice(0, 2).join(' ')));
  }

  // 5. Name / 6. bot.
  // «¿Cómo se llama la pantalla…?» is not about the assistant: only «cómo se llama» + el asistente/usted.
  // «¿Con quién hablo?» alone asks for its name; «¿con quién hablo en la entrega…?» is a contact (step 2).
  if (NAME_ASK.test(q) || NAME_ONLY.test(q)) {
    const opts = variants('quien-eres').filter((v) => v.includes(i.ctx.profile.name));
    return done(pick(opts.length ? opts : BUILTIN['quien-eres'].map(fill)));
  }
  if (BOT_ASK.test(q)) return done(pick(variants('eres-bot')));

  // 7. What's pending for me (also counted: «¿cuántas vencidas tengo?», «¿qué tengo que subir?»).
  if (pending) {
    const r = await call('mis_pendientes');
    if (!r.ok) return done(`No pude revisar tus pendientes: ${r.error}`);
    const res = r.result as { total: number; pendientes: { que: string; titulo: string }[]; avisos_sin_leer: number };
    const unread = res.avisos_sin_leer ? ` Además tienes ${count(res.avisos_sin_leer, 'aviso', 'avisos')} sin leer.` : '';
    // The person's own home screen, by its label in the menu (the boss's is «Inicio», not «Hoy»).
    const home = (r.goTo && screenFor(r.goTo)?.label) || 'Hoy';
    if (!res.total) return done(`No tienes nada pendiente ahora mismo. ¡Bien ahí!${unread}`);
    const top = res.pendientes.slice(0, 3).map((p) => `${p.que.toLowerCase()}: «${p.titulo}»`);
    return done(`Tienes ${count(res.total, 'pendiente', 'pendientes')}. Lo primero: ${list(top)}.${unread} Todo eso está en ${home}.`);
  }

  // 8. How a piece is going (only for whoever is offered the tool; the database decides the rest).
  // «¿Cómo va lo de la cancha?» is an event by another name (step 12), unless it names the work.
  if (aboutPiece) {
    if (!offered('estado_pieza')) return done('Las piezas no las veo desde tu rol. Si necesitas algo de una, pregúntale a Redes.');
    const after = /\bpieza\s+(?:de(?:l)?\s+|sobre\s+)?(.+)$/i.exec(typed)?.[1];
    const r = await call('estado_pieza', { titulo: (quotedTitle ?? after ?? typed).replace(/[¿?¡!]/g, '').trim() });
    if (!r.ok) return done(`No pude buscarla: ${r.error}`);
    if ((r.result as R).falta) return done('¿Cuál pieza? Dime una palabra del título y te digo cómo va.');
    const ps = ((r.result as R).piezas as R[]) ?? [];
    if (!ps.length) return done('No encontré ninguna pieza con ese nombre. ¿Me das otra palabra del título?');
    if (ps.length > 1) return done(`Encontré varias: ${list(ps.slice(0, 4).map((p) => `«${p.titulo}»`))}. ¿Cuál de ellas?`);
    const p = ps[0];
    const pub = Number(p.publicada_en_redes ?? 0);
    // Where it lives in Redes (R4): «Es un reel de Mes 1, #7 del feed».
    const kind = typeof p.formato === 'string' ? p.formato : '';
    const where = kind
      ? ` Es ${/^(?:Historia|Pieza)\b/.test(kind) ? 'una' : 'un'} ${kind.charAt(0).toLowerCase()}${kind.slice(1)}${p.mes ? ` de ${p.mes}` : ''}${p.espacio_feed ? `, ${p.espacio_feed}` : ''}.`
      : '';
    return done(`La pieza «${p.titulo}» está ${String(p.estado).toLowerCase()} (semáforo ${p.semaforo}, versión ${p.version}).${where}${pub ? ` Ya salió en ${count(pub, 'red', 'redes')}.` : ''}`);
  }

  // 9. Days of tweets: only how many days or tweets are left or wait («¿cuántos días de tweets quedan?»).
  // «¿Quién aprueba los tweets?», «¿puedo editar un tweet aprobado?» are how-tos (the fichas).
  if (tweetsLeft) {
    if (!offered('dias_de_tweets')) return done('Los tweets no los veo desde tu rol.');
    const r = await call('dias_de_tweets');
    if (!r.ok) return done(`No pude revisarlo: ${r.error}`);
    const t = r.result as { dias: number; programados: number; quedan_pocos: boolean; por_aprobar: number };
    const base = t.dias ? `Quedan ${count(t.dias, 'día', 'días')} de tweets programados (${count(t.programados, 'tweet', 'tweets')}).` : 'No quedan tweets programados.';
    return done(`${base}${t.quedan_pocos ? ' Toca subir la tanda de la semana.' : ''}${t.por_aprobar ? ` Hay ${count(t.por_aprobar, 'tweet', 'tweets')} esperando aprobación.` : ''}`);
  }

  // (10. Best hours: step 2a, above.)

  // 11. Video rules.
  if (videoRules) {
    const r = await call('reglas_de_video', network() ? { red: network() } : {});
    if (!r.ok) return done(`No pude revisarlo: ${r.error}`);
    const nets = ((r.result as R).redes as R[]) ?? [];
    // A story goes only to Instagram and Facebook: both, without asking which (D-89).
    if (!network() && /\bhistorias?\b/.test(q)) {
      const story = nets
        .map((n) => ({ red: String(n.red), f: ((n.formatos as R[]) ?? []).find((f) => /^(?:story|historia)/i.test(String(f.formato))) }))
        .filter((x) => x.f)
        .map((x) => [`en ${x.red}`, x.f!.duracion_segundos ? `de ${x.f!.duracion_segundos} segundos` : '', x.f!.proporcion ? `en ${x.f!.proporcion}` : '', x.f!.peso_maximo_mb ? `hasta ${x.f!.peso_maximo_mb} MB` : ''].filter(Boolean).join(' '));
      if (story.length) return done(`Las historias salen solo en Instagram y Facebook: ${list(story)}. Al publicar, la plataforma lo revisa sola.`);
    }
    if (!network()) return done(`¿Para qué red? Cada una tiene sus medidas: ${list(nets.map((n) => String(n.red)))}.`);
    const n = nets[0];
    if (!n) return done('No hay reglas guardadas para esa red.');
    const parts = ((n.formatos as R[]) ?? []).map((f) =>
      [`${f.formato}`, f.duracion_segundos ? `de ${f.duracion_segundos} segundos` : '', f.proporcion ? `en ${f.proporcion}` : '', f.peso_maximo_mb ? `hasta ${f.peso_maximo_mb} MB` : ''].filter(Boolean).join(' '),
    );
    return done(`En ${n.red}: ${list(parts)}. El copy, hasta ${n.copy_hasta_caracteres} caracteres. Al publicar, la plataforma lo revisa sola.`);
  }

  // 12. How an event is going (never its date, time or place). Not how something is done with events.
  // The way somewhere is a where (not a how-to) unless it is to the person's own things or the platform
  // («¿cómo hago para llegar a mis pendientes?»).
  const eventHowTo = (howTo || GENERIC_EVENT.test(q) || HOW_ANY.test(q)) && !(WAY_THERE.test(q) && !self && !PLATFORM.test(q));
  // Since the answers (D-89), only for one event named (a title or a place this person can see, «lo de…», an event word
  // that points to one): never for a generic word («evento», «entrega», «dron», «cómo va»).
  const oneEvent = loDe || (eventFrom >= 0 && DEFINITE_EVENT.test(spoken(bare)) && !strong) || (eventFrom >= 0 && (await namesVisible()));
  if (!eventHowTo && oneEvent && offered('buscar_evento')) {
    const r = await call('buscar_evento', { texto: typed });
    if (!r.ok) return done(`No pude buscarlo: ${r.error}`);
    if ((r.result as R).falta) return done('¿Cuál evento? Dime una palabra del título y te digo en qué va.');
    const evs = ((r.result as R).eventos as R[]) ?? [];
    if (!evs.length) return done('No encontré ningún evento con esas palabras. Tus eventos están en la Agenda; si me dices una palabra del título, te digo en qué va.');
    if (evs.length > 1) return done(`Encontré varios: ${list(evs.slice(0, 4).map((e) => `«${e.titulo}»`))}. ¿Cuál es?`);
    const e = evs[0];
    return done(`El evento «${e.titulo}» está en «${e.trabajo}» (decisión de ${i.ctx.huecos.boss}: ${String(e.decision_del_jefe).toLowerCase()}). ${Number(e.archivos_de_material ?? 0) ? `Tiene ${count(Number(e.archivos_de_material), 'archivo', 'archivos')} de material` : 'Todavía no tiene material'} y ${count(Number(e.piezas ?? 0), 'pieza', 'piezas')}.`);
  }

  // 13. Greeting, 14. thanks, off-topic.
  if (GREETING.test(q) && q.length < 40) return done(pick(variants('saludo')));
  if (THANKS.test(q) && q.length < 40) return done(pick(variants('gracias')));
  // Not «política» alone (the boss's Política screen, the director de política) nor «tarea» («¿cómo marco una tarea
  // como hecha?»): only what is clearly out of the platform.
  if (OFF_TOPIC.test(q)) return done(pick(variants('fuera-de-tema')));

  // 14b. Asked as a schedule («¿a qué hora sale Kevin?», «¿qué hay el domingo?») or the way somewhere
  // that is not a goal («¿cómo hago para llegar a la plaza central?»), and nothing above knew the
  // subject (an event this person can't see): the agenda answer, never a loose ficha (a list of
  // categories, deadlines) next to it. Unless it names a screen, a thing of the platform («¿dónde
  // queda el copy?»), the person's own things or a call for help (SELF, but not «lo de…»), or a
  // ficha's topic by its title or tags. A sesión, a campaña, a registro or a panel are also on the agenda:
  // only with what makes them the screen («el registro de cambios») they are the platform's.
  // The words of an event's title or place it names are not a ficha's topic («verde» of «Alto Verde»).
  const seen = await titles();
  const way = route && !GOAL.test(q);
  const whenless = whenWhere ? withoutWhenWhere(i.question) : i.question;
  // Read once for the turn: the words of the event titles it names are also the event's name below.
  const titleWords = namedTitleWords(typed, seen.events);
  const placeWords = new Set([...namedTitleWords(typed, seen.places), ...titleWords]);
  const subject = plain(way ? withoutWhenWhere(i.question) : whenless).split(' ').filter((w) => !placeWords.has(w)).join(' ');
  if (((whenWhere && asksSchedule(bareQ)) || way) && !OFF_TOPIC.test(q) && !self && !screensIn(withoutAgendaThings(q)).length && !namesPlatform(q) && !namesTopic(knowledge ?? [], withoutAgendaThings(subject))) return refuse();

  // A turn about an event (the shared detector, with the titles this person can see; S3, ronda 5): the
  // titles it names are the event's name, not what is asked («¿cómo hago un copy para la jornada de
  // salud?» is about the copy). Unless it asks how something is done, a ficha must answer it well;
  // otherwise 360 gives the agenda's answer (step 17), never a loose ficha («¿hay barro en…?»). A work
  // product named with it is what is asked.
  const eventTurn = (aboutEvent(bare, seen) || aboutEvent(bareQ, seen)) && !meta && ((await namesOne(bare)) || (await namesOne(bareQ)) || (valueAsk && (one || asksSchedule(bareQ) || !namesPlatform(q))));
  const eventName = eventTurn ? titleWords : new Set<string>();
  const topic = eventName.size ? plain(whenless).split(' ').filter((w) => !eventName.has(w)).join(' ') : whenless;
  // The work named with it («¿cuándo se publica lo de la cancha?», «¿qué copy le hago?») is the topic.
  const strict = eventTurn && !eventHowTo && !WORK.test(q);

  // 15. A ficha that answers it (how something is done, per role). Chosen by what is asked, not by
  // its when or where words; and in a when/where turn, never one with hours or dates (the best
  // hours, the tweet slots): next to that question they read as the event's. Of the ficha, the sentence
  // that best answers the question and the one after it: the most words of the question, with a bonus
  // for two of them in a row as asked («las verdes», «no llega»).
  const asked = canon(topic).split(' ').filter(Boolean);
  const words = [...new Map(keyWords(topic).map((w) => [stem(w), w])).values()];
  // Two words in a row of 3+ letters each, and «no» before a word asked.
  const pairs = asked.slice(1).flatMap((w, k) => (w.length >= 3 && asked[k].length >= 3 ? [` ${asked[k]} ${stem(w)}`] : []));
  const negated = asked.includes('no') ? words.map((w) => ` no ${stem(w)}`) : [];
  const hits = (t: string) => words.filter((w) => hasWord(` ${canon(t)}`, w)).length;
  // To pick a ficha's sentence, between two with as many words asked, the one with the rarer word («¿una
  // pieza puede tener varias versiones?» is answered by the sentence about versions, not the one that says
  // «pieza»): each word by how rare it is among the fichas, 1 on average.
  const docs = (knowledge ?? []).map((f) => ` ${canon(`${f.title} ${f.tags.join(' ')} ${f.body}`)}`);
  const idf = words.map((w) => Math.log(1 + (docs.length + 1) / (1 + docs.filter((d) => hasWord(d, w)).length)));
  const mean = idf.reduce((a, b) => a + b, 0) / Math.max(1, idf.length) || 1;
  const weighted = (t: string) => words.reduce((n, w, k) => n + (hasWord(` ${canon(t)}`, w) ? idf[k] / mean : 0), 0);
  // «¿Dónde…?» is answered by the sentence that says where («En la pieza, pestaña Copies: …»).
  const whereAsk = /\b(?:donde|en que parte|en que pantalla)\b/.test(q);
  const saysWhere = (t: string) => /^(?:En|Desde)\s/.test(t) || /→|pestaña/i.test(t);
  // «¿Qué pongo / qué lleva…?» is answered by a sentence that lists (on a tie).
  // «¿Cómo hago una propuesta?» is answered by the sentence that says how one is created (on a tie).
  const make = makesOne(q);
  const listAsk = /\bque (?:pongo|lleva|llevo|escribo|necesito|tiene que llevar|hay que poner|tengo que (?:poner|llenar|escribir))\b/.test(q);
  const answerFrom = (body: string) => {
    const ss = sentences(fill(body));
    const score = (t: string) => {
      const c = ` ${canon(t)}`;
      const n = hits(t);
      return n + 0.25 * (weighted(t) - n) + (whereAsk && n && saysWhere(t) ? 0.5 : 0) + 0.5 * [...pairs, ...negated].filter((x) => c.includes(x)).length + (mayI && /^(?:no|puede|pueden)\b/i.test(t) ? 0.25 : 0) + (listAsk && (t.match(/,/g) ?? []).length >= 3 ? 0.25 : 0) + (make && c.includes(' crea') ? 0.75 : 0);
    };
    let best = 0;
    ss.forEach((t, k) => {
      if (score(t) > score(ss[best])) best = k;
    });
    const text = ss.slice(best, best + 2).join(' ');
    return { text: text.length > 420 ? `${text.slice(0, 417).replace(/\s+\S*$/, '')}…` : text, hits: hits(ss[best] ?? '') };
  };
  // «¿Puedo…?»: the person's role ficha says what the role does and does not do. Its sentence answers when
  // it has at least half the words asked («¿puedo ver las piezas?» → «No ve piezas…»).
  // …and says the verb asked («¿puedo borrar un archivo?» is not «sube el material… en el archivo original»).
  // A strong answer of the index (what the role may or never does, a curated one) says it first (D-89).
  if (mayI && words.length && !(best && strong && !strict && yesNo)) {
    const own = (knowledge ?? []).find((f) => roleFichaKeys(i.ctx.roles).includes(f.key ?? ''));
    const a = own ? answerFrom(own.body) : null;
    const verb = tokens(MAY_VERB.exec(q)?.[1] ?? '');
    const saysVerb = !verb.length || tokens(a?.text ?? '').some((r) => verb.includes(r));
    if (a && saysVerb && a.hits >= Math.max(1, Math.ceil(words.length / 2))) return done(secondPerson(a.text));
  }
  // A weak match is a guess: below MIN_FICHA_SCORE or MIN_FICHA_COVER (twice that next to an event that
  // is not a how-to), or, next to an event, one word of the question found only in a ficha's text, never
  // in its title or tags («… ¿qué llevo?» and «Ningún aviso lleva…»): 360 says it is not sure (step 17).
  // A how-to that names a network («¿cómo hago una historia para Instagram?») is not about its best hours or its video
  // rules (D-89): those data fichas answer only when the hours or the rules are asked.
  const dataOff = howTo && !wantsHours && !VIDEO_RULES.test(q) && !/\b(?:horas?|horario|reglas?|medidas|duracion|caracteres)\b/.test(q);
  const pool = (whenWhere ? knowledge?.filter((f) => !hasDateOrTime(fill(f.body))) : knowledge)?.filter((f) => !dataOff || !/^auto:(?:horas|red)/.test(f.key ?? ''));
  const top = pool ? scoreFichas(pool, topic)[0] : undefined;
  const loose = eventTurn && !!top && top.words === 1 && !top.titled;

  // G. «¿Cómo cargo una ficha comunitaria?» (R3, D-42): a task of the person's role guide («Paso a paso»,
  // guide-help.ts) whose title says all that is asked: its steps, and its tutorial (or the guide). Instead of a card
  // that says only part of it, or only who does what (a role's summary is not a how-to), or of «no estoy seguro»
  // (after step 15). A card that says all of it keeps answering. Never next to an event.
  const task = !eventTurn && (howTo || HOW_ANY.test(q)) ? taskFor(topic, i.ctx.roles) : null;
  const byTask = async (t: GuideTask) => {
    const tutorial = t.tour && offered('ver_tutorial') ? (await call('ver_tutorial', { tutorial: t.tour })).tutorial ?? null : null;
    return tutorial?.href ? done(taskAnswer(t), undefined, tutorial) : done(taskAnswer(t), t.guide);
  };
  // The answers (D-89) against the fichas: a strong answer wins when it is the better match (a team card wins a tie);
  // a weak one never answers (it would beat «No estoy seguro…» with a guess). Never next to an event that is not a how-to.
  const fichaOk = !!top && !loose && top.n >= MIN_FICHA_SCORE * (strict ? 1.5 : 1) && top.cover >= MIN_FICHA_COVER * (strict ? 2 : 1);
  const fichaScore = fichaOk ? scoreFicha(topic, top!.f) + (top!.f.origin === 'equipo' ? 0.08 : 0) : 0;
  // Never for when or where an event is (a value asked that is no rule): those keep the steps below and the refusal.
  if (best && strong && (!strict || helpAsk) && yesNo && !valueLeft && best.score > fichaScore + 0.02) return sayEntry(best);
  // A weak answer that still says most of what is asked (WEAK_ALONE), when no ficha or task answers at all, before «No
  // estoy seguro…».
  // …and only through a way of asking (a weak match on an answer's text alone is a guess): the best such match, when it is
  // close to the best of all.
  const weakPick = best ? found.find((m) => m.score >= Math.max(WEAK_ALONE, best.score - 0.06) && m.entry.q.includes(m.via)) : undefined;
  const weakAlone = !!weakPick && !strong && (!strict || helpAsk) && yesNo && !valueLeft && !fichaOk && !task;
  if (task && top && (top.cover < 1 || (ROLE_SUMMARY.test(top.f.key ?? '') && coverOf(top.f.title, [...new Set(keyWords(topic))]) < 1))) return byTask(task);
  // A ficha of the platform is static help text (like the answers, D-89): the net checks it for concrete dates, phones and
  // places only. One the team wrote goes through the whole net.
  if (top && !loose && top.n >= MIN_FICHA_SCORE * (strict ? 1.5 : 1) && top.cover >= MIN_FICHA_COVER * (strict ? 2 : 1)) return { ...done(answerFrom(top.f.body).text), fixed: top.f.origin !== 'equipo' && !eventTurn && !valueAsk && !whenWhere && !route };
  if (task) return byTask(task);

  // 16. The best chosen script with a variant that needs no data, only when the question said one of its
  // triggers whole (a word in common is a guess). Never the agenda's refusal for a question that is not
  // about the agenda (it went through step 2 and 14b).
  for (const s of strict ? [] : i.ctx.scripts.filter((x) => !x.always && (x.points ?? 0) >= 3 && x.key !== 'fabrica:agenda-privada')) {
    const opts = variantsOf(s.script).map(fill).filter((v) => !HUECO.test(v));
    if (opts.length) return done(pick(opts));
  }

  // 17. About an event: the agenda's answer (what 360 can't say of it is there, for whom may see it).
  // Otherwise not sure: say so and offer to tell administración (a «sí» tells them for real, step 0).
  if (weakAlone) return sayEntry(weakPick!);
  return strict ? refuse() : done(isAdmin ? NOT_SURE_ADMIN : NOT_SURE);
}
