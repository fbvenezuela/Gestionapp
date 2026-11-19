// 360 explains (design §4(c), 12/11; Juan: «asegúrate que el bot sepa todo … y cómo poder explicarlo»): «no entendí»,
// «más fácil», «paso a paso», «dame un ejemplo», «¿y después?», «¿para qué sirve?», «¿por qué?», «¿qué significa eso?»,
// «dime más». Pure: no database, no I/O.
// - explainAsk(question): whether the whole question is one of those asks (dictated and short forms, accents optional,
//   courtesy words allowed), the facet it asks for and the «lo de X» it names. «Lo de X» is a topic here, never an event,
//   unless X names an event, a title, a place or a day: the event detectors of events.ts decide, as they are.
// - explainAnswer(facet, topic, ctx): that facet of the topic (the index entry that answered the turn before), for this
//   person's role, from the guides (src/lib/guides) and «Explicado fácil» (src/lib/guides/explain.ts): never a text 360
//   already said in the thread, never after a turn about an event, and null when there is nothing new to say (then the
//   caller goes on with the steps of today, the agenda's refusal included).
// The hook is step E of local.ts: it stores `entryId` and `cursor` with each answer (assistant_messages.go_to) and passes
// them back here.
import { TEAM_ROLES, type Role, type TeamRole } from '../roles';
import { ADMIN_GUIDE, FLOWS, GLOSSARY, SHARED, allGuides, glossaryLine, sharedFor, toursForRoles } from '../guides';
import { quotedLabels } from '../guides/check';
import { facetsOf, type FacetText } from '../guides/explain';
import { everyoneSections } from '../guides/sections';
import type { Flow, FlowStep, GlossaryTerm, RoleGuide, SharedTopic, Task } from '../guides/types';
import { entryById, findAnswers, readable, textFor, tokens, WEAK, type Entry } from './answers/engine';
import { asksAgendaData, asksPlace, asksWhenIndirect, eventSignals, eventThread, goesOn, type EventSignal } from './events';
import { canOpen } from './screens';
import { plain } from './text';
import type { TitleSet } from './titles';

// ── What is asked ──────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * What an explain ask wants of the topic (design §4(c)1). WF-C2 (a follow-up of the thread, «y …» first): `whatif`, «¿y si
 * …?» (what the topic says happens then); `who`, «¿y quién lo hace?»; `when`, «¿y cuándo lo hago?» (a task's «Cuándo», the
 * person's own work: never an event's date); `mine`, «¿y yo qué hago ahí?» (the person's own part of the topic).
 */
export type Facet = 'simpler' | 'steps' | 'example' | 'next' | 'purpose' | 'why' | 'meaning' | 'more' | 'whatif' | 'who' | 'when' | 'mine';
/**
 * The facet asked and, when the ask names it («no entendí lo de X», «¿qué significa X?», «¿y después de X?»), what of the
 * topic; `pair`: the two things of «no entendí la diferencia entre A y B».
 */
// `doer`: the verb of «¿y después quién lo publica?» (the step of the flow where someone does it). `of`: «¿y qué pasa con
// X?», what the topic itself says of X (no answer written for another follow-up takes it). `verb`: the verb of a yes or
// no («¿y se borra?»): what the topic says of X must say that verb itself («nada se borra», not «el borrador»).
export type ExplainAsk = { facet: Facet; about?: string; pair?: [string, string]; doer?: string; of?: true; verb?: string };
/**
 * `titles`: what this person can see (the event detectors read titles and places with it). `last`: 360's last answer in
 * the thread, so a bare «sí» or «dale» after its «¿Sigo?» goes on with the steps. `withoutLabels`: how the agenda's
 * checks read a question (local.ts withoutLabels: the screens' labels with a time word taken out, «ya tiene fecha»,
 * «ponerle fecha», «cambiar fecha o lugar»), so a label is read as the app's and never as an event's date; without it
 * every such label stops the ask (the safe side).
 */
// `afterWord`: 360's last answer was a word of the glossary (local.ts): «¿y por qué es obligatorio?» is then that word's why.
export type AskOptions = { titles?: TitleSet; last?: string; withoutLabels?: (text: string) => string; afterWord?: boolean };

const NO_TITLES: TitleSet = { events: [], pieces: [], places: [] };

// The words around an ask that ask nothing: openers and courtesy before it, courtesy after it. «Entonces» opens a
// question only before something else («entonces, ¿cómo lo hago?»): alone it asks what comes next.
const LEAD = /^(?:(?:y|e|o|pero|ok|okey|okay|ya|aja|bueno|mira|oye|chamo|chama|pana|hola|epa|epale|disculpa|disculpe|perdon|perdona|360|ah|eh|mmm|vale|listo|gracias|muchas gracias|a ver|por favor|amigo|amiga|oiga|bro|mano|mana|si|entonces(?= \S))(?: |$))+/;
const TAIL = /(?: (?:por favor|gracias|muchas gracias|ok|ya|chamo|chama|pana|360|mejor|rapido|rapidito|bien|ahi|aqui|otra vez|de nuevo|amigo|amiga|bro|pues|entonces|si))+$/;
// What a «lo de X» says before its X.
const LO_DE = String.raw`(?:lo|eso|esto|la parte|el paso|el tema|la cosa) (?:de|del|que dice|que dijiste de|que dijiste del)`;
// Said more simply.
const SIMPLE = String.raw`(?:facil|facilito|sencillo|sencillito|simple|clarito|claro|despacio|despacito|en palabras sencillas|en palabras simples|en palabras faciles|con palabras sencillas|de otra forma|de otra manera|en cristiano|como (?:a|para) un nino|para un nino|sin palabras raras|sin tanto enredo|mas corto|en corto|resumido)`;
const UNDERSTOOD = '(?:entendi|entiendo|entendio|capte|capto|comprendi|comprendo|agarre|pille|cache)';
const DO_VERB =
  '(?:hago|hace|hacemos|activo|activa|uso|usa|lleno|llena|pongo|pone|subo|sube|armo|arma|mando|manda|reviso|revisa|apruebo|aprueba|cambio|cambia|veo|ve|marco|marca|quito|quita|agrego|agrega|abro|abre|leo|lee|consigo|saco|preparo|prepara|cargo|carga|creo|crea|escribo|escribe|configuro|configura|instalo|instala|programo|programa|publico|publica|elimino|elimina|archivo|archiva|muevo|mueve|pido|pide|bajo|baja|guardo|guarda)';
const ROLE_NAMES = '(?:el jefe|jefe|el despacho|despacho|politica|el ivt|ivt|grabacion|redes|administracion)';
// What one asks to be told how to do, said around «paso a paso» («qué hago», «cómo lo hago», «cómo cambio algo ahí»).
const HOW_DO = String.raw`(?:que (?:hago|hacemos|tengo que hacer|debo hacer|se hace|hay que hacer)|como (?:(?:lo|la|los|las|le|se) )?(?:hago|hace|le hago|${DO_VERB}))(?: (?:eso|esto|algo|ahi|alli|aqui|entonces|yo))*`;

// Each ask, whole (after the openers and the courtesy): its facet, and its X in the group named `about`.
const ASKS: [Facet, RegExp][] = [
  // simpler: «no entendí», «no te entendí», «no capté», «¿cómo así?», «explícamelo más fácil», «en palabras sencillas».
  ['simpler', new RegExp(String.raw`^no (?:te |le |lo |la )?${UNDERSTOOD}(?: (?:bien|muy bien|nada|ni papa|mucho|casi nada|todo|eso|esto|esa parte|lo que dijiste|lo que me dijiste|tu respuesta|la respuesta|lo ultimo|eso ultimo|ni media|nada de nada))*$`)],
  ['simpler', new RegExp(String.raw`^no (?:te |le )?${UNDERSTOOD} (?:${LO_DE}|la diferencia entre) (?<about>.+)$`)],
  ['simpler', new RegExp(String.raw`^no (?:te |le )?${UNDERSTOOD} (?<about>(?:el|la|los|las) .+)$`)],
  ['simpler', new RegExp(String.raw`^no me (?:quedo|queda) (?:muy |bien )?claro(?: (?:eso|esto))?$`)],
  ['simpler', new RegExp(String.raw`^no me (?:quedo|queda) claro ${LO_DE} (?<about>.+)$`)],
  ['simpler', /^(?:como asi|como es eso|como es la cosa|como como|que quieres decir|que quisiste decir|a que te refieres|no se que es eso|no se de que hablas|no entiendo que es eso)$/],
  ['simpler', new RegExp(String.raw`^(?:que quisiste decir|que quieres decir|a que te refieres) con (?:${LO_DE} )?(?<about>.+)$`)],
  ['simpler', new RegExp(String.raw`^(?:explica\w*|dime\w*|dilo|decirlo|ponlo|ponmelo|repite\w*|cuenta\w*|echame el cuento)(?: (?:eso|esto|lo|todo|eso mismo|otra vez|de nuevo|pero|mas|un poco mas|un poquito mas|bien|de forma|de manera|en forma))* ${SIMPLE}(?: (?:${LO_DE}|sobre) (?<about>.+))?$`)],
  ['simpler', /^(?:mas|bien|super|muy) (?:facil|facilito|sencillo|simple|claro|clarito|corto)$/],
  ['simpler', new RegExp(String.raw`^${SIMPLE}$`)],
  ['simpler', /^(?:explica|explicame|explicamelo|explicamela|explicanos|explicate)$/],
  ['simpler', new RegExp(String.raw`^(?:explica|explicame|explicamelo) ${LO_DE} (?<about>.+)$`)],
  // steps: «paso a paso (porfa)», «por pasos», «¿qué hago primero?», «¿y cómo lo hago?».
  ['steps', new RegExp(String.raw`^(?:(?:dimelo|dime|explicamelo|explicame|explica|dame|damelo|ponmelo|ensename|ensenamelo|muestramelo|cuentamelo)(?: (?:lo|eso|esto|todo))? )?(?:paso a paso|por pasos|pasito a pasito|en pasos|punto por punto)(?: (?:como (?:lo|la|los|las|se) ${DO_VERB}(?: (?:eso|esto))?|${LO_DE} (?<about>.+)))?$`)],
  // («¿Qué hago, paso a paso?», «¿y cómo lo hago, paso a paso?», «paso a paso cómo cambio algo ahí»: the same, WF-C2.)
  ['steps', new RegExp(String.raw`^${HOW_DO} (?:paso a paso|por pasos|pasito a pasito)$`)],
  ['steps', new RegExp(String.raw`^(?:paso a paso|por pasos|pasito a pasito) ${HOW_DO}$`)],
  ['steps', /^(?:(?:dime|dame|cuales son) )?(?:los )?pasos$/],
  ['steps', /^(?:que hago primero|por donde empiezo|como empiezo|con que empiezo|que hago de primero)$/],
  ['steps', new RegExp(String.raw`^como (?:lo |la |los |las |se )${DO_VERB}(?: (?:eso|esto))?$`)],
  ['steps', /^(?:como (?:hago|se hace|le hago) (?:eso|esto)|(?:eso|esto) como se hace)$/],
  // example: «dame un ejemplo», «¿por ejemplo?», «¿cómo sería?».
  ['example', /^(?:(?:dame|deme|da|danos|ponme|pon|ponnos|dime|muestrame|ensename|me das|me da|me pones|me puedes dar|me podrias dar|puedes dar|puedes darme|podrias dar|podrias darme|tienes|hay|regalame|echame|quiero|necesito|con) )?(?:un |algun |unos |otro |un buen )?(?:ejemplo|ejemplito|ejemplos|caso)(?: (?:de|del|con|sobre|para) (?<about>.+))?$/],
  ['example', /^(?:por ejemplo|como por ejemplo|como seria|como seria eso|como seria en la practica|en la practica|en la vida real|con un ejemplo|(?:explica\w*|dime\w*|dimelo) con un ejemplo|ponme un caso|un caso real|como cual|como que)$/],
  // next: «¿y después?», «¿y luego?», «¿qué sigue?», «¿y entonces?».
  ['next', /^(?:despues|luego|entonces|ahora)(?: (?:de eso|de esto|de ahi|de alli))?(?: que(?: (?:sigue|pasa|hago|viene|toca|hacemos|sucede|se hace))?(?: con (?:eso|esto|ella|ellas|el|ellos|esa|ese|esas|esos))?)?$/],
  ['next', /^(?:que sigue|que viene|que toca|cual es el siguiente paso|el siguiente paso|siguiente paso|el siguiente|que mas sigue|que pasa despues|que hago despues|que viene despues|que sigue despues|luego que|despues que|que pasa luego|que pasa entonces|que hago luego|luego que hago)$/],
  ['next', new RegExp(String.raw`^(?:despues|luego|entonces) que hace (?<about>${ROLE_NAMES})$`)],
  // («¿Y después quién los publica?»: the step of its flow where someone does that, WF-C2.)
  ['next', /^(?:despues|luego) quien (?:lo|la|los|las) (?<doer>usa|lee|ve|recibe|aprueba|hace|sigue|revisa|publica|graba)$/],
  ['next', /^(?:despues|luego) de (?<about>.+?)(?: que(?: (?:sigue|pasa|hago|viene|toca|hacemos|sucede|se hace))?)?$/],
  ['next', /^que (?:pasa|sucede) (?:despues|luego) de (?<about>.+)$/],
  // purpose: «¿para qué sirve (eso)?», «¿pa' qué?».
  ['purpose', /^(?:(?:eso|esto) )?paraque(?: (?:sirve|sirven|es|son|me sirve|nos sirve|se usa|existe|seria))?(?: (?:eso|esto))?$/],
  ['purpose', /^(?:eso|esto|lo) de (?<about>.+?) paraque(?: (?:sirve|sirven|es|son|se usa))?$/],
  ['purpose', /^paraque (?:sirve|sirven|es|son|se usa|me sirve) (?:eso de |lo de |esto de )?(?<about>.+)$/],
  ['purpose', /^(?:de que (?:sirve|me sirve|nos sirve)(?: (?:eso|esto))?|con que fin|(?:cual es )?(?:el|su) (?:objetivo|proposito|chiste|punto)(?: de (?:eso|esto))?)$/],
  // why: «¿por qué?», «¿y eso por qué?», «¿por qué es así?».
  ['why', /^(?:(?:eso|esto) )?por que(?: (?:eso|esto|asi|es asi|sera|seria|no|tanto|es eso|pasa eso|pasa))*$/],
  ['why', /^por que (?:es|se hace|funciona|tiene que ser|hay que hacerlo|lo hacen|esta|quedo) (?:asi|de esa forma|de esa manera)$/],
  ['why', /^(?:(?:cual es|dime) )?(?:la|el) (?:razon|motivo)(?: de (?:eso|esto))?$|^(?:por que razon|por que motivo|por cual razon|a que se debe)$/],
  ['why', new RegExp(String.raw`^por que ${LO_DE} (?<about>.+)$`)],
  // meaning: «¿qué significa (eso | X)?».
  ['meaning', /^que (?:significa|significan|quiere decir|quieren decir) (?:eso|esto|esa palabra|esas palabras|eso que dijiste|lo que dijiste)$/],
  ['meaning', /^que (?:es|son) (?:eso|esa palabra|eso que dijiste)$|^(?:eso|esa palabra) que (?:significa|quiere decir|es)$|^que (?:significa|quiere decir)$/],
  ['meaning', new RegExp(String.raw`^que (?:significa|significan|quiere decir|quieren decir) (?:${LO_DE} |la palabra |el |la |los |las |lo |un |una )?(?<about>.+)$`)],
  ['meaning', new RegExp(String.raw`^que (?:es|son) (?:${LO_DE}|eso de|esto de) (?<about>.+)$`)],
  ['meaning', /^(?:eso|lo|esto) de (?<about>.+?) que (?:es|son|significa|significan|quiere decir)$/],
  // («¿Y la denuncia en qué se diferencia?», «¿y en qué se diferencia una queja?»: what the topic says X is, WF-C2.)
  ['meaning', /^(?<about>(?:el|la|los|las|un|una) [a-z]+(?: [a-z]+){0,3}) (?:en que se diferencia|en que se diferencian|que tiene de distinto|que tiene de diferente|que es|que son|que significa)$/],
  ['meaning', /^en que se (?:diferencia|diferencian|distingue|distinguen) (?<about>(?:el|la|los|las|un|una) [a-z]+(?: [a-z]+){0,3})$/],
  // more: «dime más», «¿algo más?», «sigue».
  ['more', /^(?:sigue|siga|continua|continue|seguimos|sigamos|dale sigue|sigue pues|adelante|continuemos|sigue sigue|termina|terminalo)$/],
  ['more', /^(?:dime|cuentame|explicame|dame|di|ensename|muestrame|quiero saber) (?:mas|algo mas|un poco mas|mas cosas|mas detalles|el resto|lo demas|lo que falta|todo)(?: (?:de eso|sobre eso|de esto|sobre esto))?$/],
  ['more', /^(?:algo mas|mas|mas detalles|mas informacion|el resto|lo demas|lo que falta|los demas pasos|el resto de los pasos|los otros pasos|que otros pasos|faltan pasos|hay mas|que mas hay|que otra cosa)$/],
];
// «¿Y por qué es obligatorio?», «¿por qué hacen falta?»: why what was just explained is so, only right after a word of the
// glossary (AskOptions.afterWord), whose own `why` says it (WF-C). After anything else the answers written for it say it
// better («¿y por qué es obligatorio?» after the doble factor: whose accounts it protects and what it opens).
const WHY_SO = /^por que (?:es|son) (?:obligatori[oa]s?|necesari[oa]s?)$|^por que (?:hace|hacen) falta$|^por que se (?:necesita|necesitan)$/;
// The follow-ups of a thread (WF-C2): said with «y» first («¿y si…?», «¿y quién…?», «¿y cuándo lo hago?», «¿y por qué
// X?»), they ask that of the topic; without it, the same words are a question of its own («¿quién aprueba los tweets?»),
// and the answers of today take it.
const FOLLOW = '(?:(?:y|e|pero|entonces|o sea|osea) )+';
// «¿Y si se va la señal?», «¿y si no hay piezas aprobadas?», «¿y qué pasa si lo quito?»: what the topic says happens then.
const WHAT_IF = new RegExp(String.raw`^${FOLLOW}(?:(?:eso|esto) )?(?:(?:que pasa|que hago|que sucede|que se hace|como hago) )?(?:si|en caso de que|cuando no) (?<about>.+)$`);
// «¿Y quién lo hace?», «¿y quién puede archivar?», «¿y quién lee las notas internas?», «¿y eso quién lo decide?»: whose
// step or rule it is.
const WHO_ASK = new RegExp(String.raw`^${FOLLOW}(?:(?:eso|esto) )?(?:quien|quienes) (?:(?:lo|la|los|las|le|les|se) )?(?<about>[a-z]+(?: [a-z]+){0,5})$|^${FOLLOW}(?:quien|quienes)$`);
// «¿Y cuándo lo hago?», «¿y cuándo las subo?», «¿y cuándo tengo que hacer eso?»: when a task of one's own is done (its
// «Cuándo»), never when an event is: only a verb of one's work, about the topic («lo», «eso»), and no event in the ask.
const OWN_WHEN = new RegExp(
  String.raw`^${FOLLOW}(?:cuando|en que momento) (?:(?:lo|la|los|las|le|les|se) )?(?:(?:tengo|tenemos|hay|debo|puedo|se tiene) (?:que )?)?(?<about>${DO_VERB}|hacer\w*|subir\w*|cargar\w*|mandar\w*|marcar\w*|completar\w*|llenar\w*|bajar\w*|poner\w*|revisar\w*)(?: (?:eso|esto|lo|la|los|las|yo))?$`,
);
// «¿Y por qué tengo que decidir rápido?», «¿y por qué no se publica sola?», «¿y redes por qué no?»: the reason the topic
// gives for X.
const WHY_ABOUT = new RegExp(String.raw`^${FOLLOW}(?:(?:eso|esto) )?por que (?<about>.+)$|^${FOLLOW}(?<about2>[a-z]+(?: [a-z]+){0,2}) por que(?: no)?$`);
// «¿Y qué pasa con el repetido?», «¿y qué hago con las fotos?», «¿y cómo queda el viejo?»: what the topic says of X
// (WF-C2). X said with «esa», «esos» or a pronoun is the topic's own thing: «¿y después qué pasa con esos tweets?» asks
// what comes next.
const WITH_X = new RegExp(String.raw`^${FOLLOW}(?:(?:despues|luego) )?(?:que (?:pasa|sucede|ocurre|hago|hacemos|se hace) con|como (?:queda|quedan)) (?<about>[a-z]+(?: [a-z]+){0,5})$`);
const POINTS_BACK = /^(?:eso|esto|ella|ellas|el|ellos)$|^(?:esa|ese|esas|esos|esta|este|estas|estos)(?: |$)/;
// «¿Y se borra lo que tenía?», «¿y la persona la ve?», «¿y ya sale así en la web?», «¿o sea que la app no la sube sola?»,
// «¿y cuál cambio queda?»: a yes or no, or a «which» of it, about the topic: what the topic says of it (WF-C2). A verb
// people ask that way, with what it is said of; not after «qué», «cómo», «por qué», «para qué» or «si» (those asks are
// read above, or are questions of their own).
const YES_NO_VERB =
  '(?:borra|borran|borro|borrar|pierde|pierden|perder|ve|ven|veo|ver|sale|salen|salir|queda|quedan|llega|llegan|cambia|cambian|cambiar|puede|pueden|puedo|sube|suben|subir|guarda|guardan|guardar|publica|publican|aparece|aparecen|avisa|avisan|entera|enteran|lee|leen|recibe|reciben|devuelve|devuelven|vuelve|vuelven|tiene|tienen|lleva|llevan|cierra|cierran|abre|abren|quita|quitan|quitar|vence|vencen|deja|dejan|cuenta|cuentan|necesita|necesitan|manda|mandan)';
const YES_LEAD = String.raw`(?:(?:(?:y|e|pero|entonces) )*(?:o sea|osea)(?: que)? |(?:(?:y|e|pero|entonces) )+)`;
const YES_NO = new RegExp(String.raw`^${YES_LEAD}(?!(?:que|como|quien|quienes|por|para|paraque|pa|si|en que|de que|a que|con que|despues|luego|ahora|entonces)\b)(?<about>(?:(?!que )[a-z]+ ){0,5}(?<verb>${YES_NO_VERB})(?: [a-z]+){0,5})$`);
/** Whether a text says that verb itself: its stem with a short ending («borra», «borran», «borrado»), never a longer word
 * that only starts like it («borrador»). A stem too short to tell («ve») says it always. */
export function saysVerb(text: string, verb: string): boolean {
  const stem = readable(verb).replace(/(?:ar|er|ir|an|en|a|e|o)$/, '');
  if (stem.length < 3) return true;
  return new RegExp(String.raw`\b${stem}[a-z]{0,3}\b`).test(readable(text));
}
// What a yes or no says around its X and asks nothing of it («lo que tenía», «así», «también»).
const YES_NO_FILLER = /\b(?:lo que (?:tenia|tenian|habia|habian|hay|estaba|estaban)|ya|asi|tambien|igual|todavia|aun|de una|solo|sola|solos|solas|adentro|dentro|ahi|alli)\b/g;
// «¿Y yo qué hago ahí?», «¿y qué hago yo?», «¿y entonces qué sí puedo hacer ahí?», «¿y a mí qué me toca?»: the person's
// own part of the topic (WF-C2). With a «y», a «yo» or an «ahí» (a bare «¿qué hago?» is a question of its own).
const MINE_ASK = new RegExp(String.raw`^(?=(?:(?:y|e|pero|entonces) |.*\b(?:yo|a mi|ahi|alli|aqui)\b))(?:(?:y|e|pero|entonces) )*(?:(?:yo|a mi) )?que (?:(?:si|entonces) )?(?:hago|puedo hacer|me toca|me toca hacer|tengo que hacer|debo hacer|hacemos)(?: (?:yo|ahi|alli|aqui|con eso|en eso|entonces|de eso))*$`);
// A bare yes after 360's «¿Sigo?»: go on.
const YES = /^(?:si|dale|ok|okey|claro|va|vale|si por favor|si dale|si claro|por favor|aja|listo|de una|sigue|si sigue|perfecto|bueno|esta bien|si porfa)$/;
const ASKED_TO_GO_ON = /¿Sigo\?\s*$/;
// «¿Y qué más?» is «what else?»; «¿qué más?» alone is a greeting (local.ts small talk).
const WHAT_ELSE = /^y (?:que mas|que otra cosa)$/;

// The event detectors: a «lo de X» or a whole ask that names an event, a title, a place, a day or an hour is not an
// explain ask (the agenda's steps answer it). Whoever records or the boss named alone («lo del jefe», «lo de quién
// graba») is not an event.
const BLOCK: EventSignal[] = ['word', 'title', 'place', 'token', 'ask', 'agenda', 'when'];
const blocked = (text: string, titles: TitleSet) => {
  const s = eventSignals(text, titles);
  return BLOCK.some((b) => s.has(b)) || asksPlace(text) || asksWhenIndirect(text);
};
// What «no entiendo …» says about the app itself (local.ts LOST: the tutorials), not about the topic. Only there: «un
// ejemplo de esa aplicación» is the one 360 just named (the codes' app).
const ABOUT_THE_APP = /^(?:(?:la|esta|tu|esa) (?:app|pantalla|parte|seccion)|nada|como (?:se )?usa\w*|que hacer|que hago)$/;

/**
 * The explain ask a question is, or null: the whole question is one (see ASKS), with no event in it. `about`: the X of a
 * «lo de X», a «¿qué significa X?» or a «¿y después de X?», as plain words (at most eight).
 */
export function explainAsk(question: string, o: AskOptions = {}): ExplainAsk | null {
  const titles = o.titles ?? NO_TITLES;
  const raw = String(question ?? '');
  if (raw.length > 160) return null;
  const t = readable(raw);
  if (!t) return null;
  // As the agenda's checks read it (the screens' labels with a time word out, when the caller says how).
  const bare = (x: string) => (o.withoutLabels ? o.withoutLabels(x) : x);
  // «¿Y cuándo lo subo?»: when a task of one's own is done (OWN_WHEN), read before the agenda's checks, which take any
  // «cuándo» for an event's; still nothing with an event, a title, a place, a placeholder or the agenda's shape in it.
  const own = OWN_WHEN.exec(t.replace(TAIL, '').replace(SOFT_LEAD, ''));
  if (own) {
    if (asksAgendaData(raw) || asksPlace(raw)) return null;
    const s = eventSignals(bare(raw), titles);
    return OWN_WHEN_BLOCK.some((b) => s.has(b)) ? null : { facet: 'when', about: own.groups!.about };
  }
  // The agenda asked as such, or any event signal in the whole ask (but its «lo de», read below on its own X). A follow-up
  // that says the topic's own thing again with «esa», «ese», «la» («¿y si esa visita no va?», «¿y si el evento se
  // cancela?») is read without those two words: they name no event of their own; anything else of an event (a title, a
  // place, a day, an hour, «¿y quién va a esa visita?») still stops it (WF-C2).
  const again = SAID_AGAIN.exec(t.replace(TAIL, '').replace(SOFT_LEAD, ''));
  const probe = again ? `${again[1]} ${again[2]}`.trim() : raw;
  if (asksAgendaData(probe) || blocked(bare(probe).replace(/\blo\s+del?\b/gi, ' '), titles)) return null;
  const tail = t.replace(TAIL, '');
  if (o.last && ASKED_TO_GO_ON.test(o.last) && YES.test(tail)) return { facet: 'more' };
  if (WHAT_ELSE.test(tail)) return { facet: 'more' };
  let core = tail.replace(LEAD, '').replace(TAIL, '').trim() || t.replace(LEAD, '').trim() || tail;
  if (!core) return null;
  // «No entendí, dame un ejemplo»: the second ask says what is wanted.
  const after = /^no (?:te |le )?(?:entendi|entiendo|capte|comprendi)(?: nada| bien)? (.+)$/.exec(core)?.[1];
  if (after && ASKS.some(([, re]) => re.test(after))) core = after;
  for (const [facet, re] of ASKS) {
    const m = re.exec(core);
    if (!m) continue;
    const about = m.groups?.about?.trim();
    if (m.groups?.doer) return { facet, doer: m.groups.doer };
    if (!about) return { facet };
    if (about.split(' ').length > 8 || about.length > 70 || (facet === 'simpler' && ABOUT_THE_APP.test(about))) return null;
    if (blocked(bare(about), titles)) return null;
    // «La diferencia entre A y B»: both (A, at its first «y»).
    const pair = /\bla diferencia entre\b/.test(core) ? /^(.+?) y (.+)$/.exec(about) : null;
    return { facet, about, ...(pair ? { pair: [pair[1], pair[2]] as [string, string] } : {}) };
  }
  if (o.afterWord && WHY_SO.test(core)) return { facet: 'why' };
  // The follow-ups of a thread, «y …» first (WF-C2): what the topic says happens if X, who does it, the reason for X.
  const follow = tail.replace(SOFT_LEAD, '');
  if (MINE_ASK.test(follow)) return { facet: 'mine' };
  for (const [facet, re] of [['whatif', WHAT_IF], ['who', WHO_ASK], ['why', WHY_ABOUT]] as [Facet, RegExp][]) {
    const m = re.exec(follow);
    if (!m) continue;
    // (Its X without the «¿… qué pasa?» it may end with: «¿y si lo rechazo qué pasa?» is about «lo rechazo»; and without
    // the topic's own thing said again: «¿y si esa visita no va?» is about «no va».)
    const about = (m.groups?.about ?? m.groups?.about2)?.replace(/ (?:que pasa|que hago|que sucede|que se hace|entonces)$/, '').replace(THING_AGAIN, '').trim();
    if (!about) return { facet };
    if (about.split(' ').length > 8 || about.length > 70 || YES.test(about)) return null;
    if (blocked(bare(about), titles)) return null;
    return { facet, about };
  }
  // What happens with X; X the topic's own («esos tweets»), what comes next.
  const withX = WITH_X.exec(follow);
  if (withX) {
    const about = withX.groups!.about.trim();
    if (POINTS_BACK.test(about)) return { facet: 'next' };
    if (blocked(bare(about), titles)) return null;
    return { facet: 'whatif', about, of: true };
  }
  // A yes or no about the topic: its X without what asks nothing of it.
  const yesNo = YES_NO.exec(follow);
  if (yesNo) {
    const about = yesNo.groups!.about.replace(YES_NO_FILLER, ' ').replace(/\s+/g, ' ').trim();
    if (!about || about.split(' ').length > 8 || blocked(bare(about), titles)) return null;
    return { facet: 'whatif', about, verb: yesNo.groups!.verb };
  }
  return null;
}
// The topic's own thing said again in a follow-up («esa visita», «el evento»): an event word with a demonstrative or an
// article and nothing after it but what is said of it.
const THING = String.raw`(?:ese|esa|este|esta|el|la) (?:evento|visita|actividad|acto|reunion|jornada|entrega|asamblea)`;
const THING_AGAIN = new RegExp(String.raw`^${THING}\b\s*`);
const SAID_AGAIN = new RegExp(String.raw`^(${FOLLOW}(?:(?:eso|esto) )?(?:(?:que pasa|que hago|que sucede|que se hace|como hago) )?(?:si|en caso de que|cuando no|por que)) ${THING}\b ?(.*)$`);
// The openers that are not a follow-up's «y» (courtesy, fillers): left out before the follow-up's own shape is read.
const SOFT_LEAD = /^(?:(?:ok|okey|okay|ya|aja|bueno|mira|oye|chamo|chama|pana|hola|epa|epale|disculpa|disculpe|perdon|perdona|360|ah|eh|mmm|vale|listo|gracias|muchas gracias|a ver|amigo|amiga|bro|mano|mana)(?: |$))+/;
// What still stops «¿y cuándo lo hago?»: an event named or the agenda's shape (a title, a place, a date or an address).
const OWN_WHEN_BLOCK: EventSignal[] = ['word', 'title', 'place', 'token', 'agenda'];

// ── What it is about ───────────────────────────────────────────────────────────────────────────────────────────────

/**
 * `roles`: the person's menu roles. `screen`: the SCREENS pattern the person is on (the hook passes it; no facet depends
 * on it yet). `said`: 360's answers in this thread, oldest first (never said twice). `earlier`: the person's questions
 * before this one, oldest first, and `question`: this one, as written: a question that goes on with a thread about an
 * event gets no explain answer (local.ts followsEvent; without `question`, any thread about an event stops it).
 * `titles`: what this person can see. `cursor`: stored with the previous answer, the next step to say on «¿Sigo?».
 * `about` and `pair`: explainAsk()'s. `tours`: the tutorial ids this person has (default: those of `roles`).
 */
export type ExplainContext = {
  roles: Role[];
  screen?: string | null;
  said?: string[];
  earlier?: string[];
  question?: string;
  titles?: TitleSet;
  cursor?: number;
  about?: string;
  pair?: [string, string];
  tours?: string[];
  // The question the topic answered in this thread (the last one that was not an explain ask): a curated answer's unit.
  asked?: string;
  // The verb of «¿y después quién lo publica?» (explainAsk's `doer`).
  doer?: string;
  // The topic is 360's last answer, an entry of the index stored with it (local.ts): the thread is about how the app works
  // even when its questions named an event («¿cómo creo un evento nuevo?»). Without it, a thread about an event gets
  // nothing (followsEventThread).
  topicSaid?: boolean;
};

/**
 * This turn goes on with a thread about an event (the earlier questions as eventThread() reads them, and this one goes
 * on: goesOn()), exactly as local.ts decides followsEvent; with no `question`, a thread about an event is enough.
 */
export function followsEventThread(ctx: Pick<ExplainContext, 'earlier' | 'question' | 'titles'>): boolean {
  const earlier = ctx.earlier ?? [];
  if (!earlier.length || !eventThread(earlier, ctx.titles ?? NO_TITLES).at(-1)) return false;
  return ctx.question === undefined || goesOn(ctx.question);
}

/**
 * What 360 says. `entryId`: the topic to store with this answer (the next explain ask's topic; a flow's whole story is
 * `flujo:<id>`). `cursor`: where the steps go on («¿Sigo?»), unset when all were said. `goTo`: a SCREENS href this person
 * can open. `tutorial`: a tour id this person has (the caller offers it through ver_tutorial, as sayEntry does).
 */
export type ExplainAnswer = { facet: Facet; text: string; entryId: string; goTo?: string; tutorial?: string; cursor?: number };

type Section = { screen?: string; title: string; what: string; youDo: string[]; cannot?: string[]; tour?: string };
type Unit =
  | { kind: 'task'; id: string; role: TeamRole; guide: RoleGuide; task: Task; step?: number }
  | { kind: 'screen'; id: string; role: Role; guide?: RoleGuide; section: Section; item?: number }
  | { kind: 'flow'; id: string; flow: Flow; step?: number }
  | { kind: 'topic'; id: string; topic: SharedTopic; line?: number }
  | { kind: 'term'; id: string; term: GlossaryTerm }
  | { kind: 'job'; id: string; role: Role; guide?: RoleGuide }
  | { kind: 'entry'; id: string; entry: Entry };

const guideBySlug = (slug: string) => allGuides().find((g) => g.slug === slug);
const ADMIN_EVERYONE = () => everyoneSections('admin').filter((x) => x.screen === '/avisos' || x.screen === '/buscar' || x.screen === '/perfil');

/** The unit of the guides an entry id is (or is part of): a task and its step, a screen and its item, a flow and its step… */
function unitOf(id: string, e?: Entry): Unit | null {
  let m = /^([a-z]+):paso-a-paso:([a-z0-9-]+)(?::(\d+))?$/.exec(id);
  if (m) {
    const guide = guideBySlug(m[1]);
    const task = guide?.tasks.find((t) => t.id === m![2]);
    if (guide && task) return { kind: 'task', id: `${m[1]}:paso-a-paso:${m[2]}`, role: guide.role, guide, task, ...(m[3] ? { step: Number(m[3]) - 1 } : {}) };
  }
  m = /^([a-z]+):pantalla:(\d+)(?::(?:hace|no):(\d+))?$/.exec(id);
  if (m) {
    const guide = m[1] === 'admin' ? undefined : guideBySlug(m[1]);
    const section = m[1] === 'admin' ? ADMIN_GUIDE.sections[Number(m[2])] : guide?.sections[Number(m[2])];
    if (section) return { kind: 'screen', id: `${m[1]}:pantalla:${m[2]}`, role: guide?.role ?? 'admin', ...(guide ? { guide } : {}), section, ...(m[3] && /:hace:/.test(id) ? { item: Number(m[3]) } : {}) };
  }
  m = /^admin:todos:(\d+)(?::(?:hace|no):(\d+))?$/.exec(id);
  if (m) {
    const section = ADMIN_EVERYONE()[Number(m[1])];
    if (section) return { kind: 'screen', id: `admin:todos:${m[1]}`, role: 'admin', section, ...(m[2] && /:hace:/.test(id) ? { item: Number(m[2]) } : {}) };
  }
  m = /^flujo:([a-z-]+)(?::([a-z0-9-]+))?$/.exec(id);
  if (m) {
    const flow = FLOWS.find((f) => f.id === m![1]);
    const step = m[2] ? flow?.steps.findIndex((s) => s.id === m![2]) : undefined;
    if (flow && (step === undefined || step >= 0)) return { kind: 'flow', id: `flujo:${flow.id}`, flow, ...(step !== undefined ? { step } : {}) };
  }
  m = /^todos:([a-z0-9-]+)(?::(\d+))?(?::admin)?$/.exec(id);
  if (m) {
    const topic = SHARED.find((t) => t.id === m![1]);
    if (topic) return { kind: 'topic', id: `todos:${topic.id}`, topic, ...(m[2] ? { line: Number(m[2]) } : {}) };
  }
  m = /^palabra:([a-z0-9-]+)$/.exec(id);
  if (m) {
    const term = GLOSSARY.find((g) => g.id === m![1]);
    if (term) return { kind: 'term', id, term };
  }
  m = /^([a-z]+):trabajo(?::\d+)?$/.exec(id);
  if (m) {
    const guide = m[1] === 'admin' ? undefined : guideBySlug(m[1]);
    if (guide || m[1] === 'admin') return { kind: 'job', id: `${m[1]}:trabajo`, role: guide?.role ?? 'admin', ...(guide ? { guide } : {}) };
  }
  return e ? { kind: 'entry', id, entry: e } : null;
}

// The guide unit a curated answer is about (a task, a screen, a flow, a topic of «Para todos», a word), for this person:
// asked the way the curated answer is asked (its ways of asking and its own text), the guide's entries that come first
// after the curated ones vote for their unit (the first more than the next ones); the curated answer's tutorial votes
// for the task, or else the screen, of the person's guide that has it. The unit wins only by a clear margin: a wrong one
// would explain another thing.
const relatedCache = new Map<string, string | null>();
const UNIT_KINDS = new Set(['task', 'step', 'screen', 'item', 'flow', 'topic', 'line', 'term']);
const VOTE_MIN = 1.2;
const VOTE_MARGIN = 1.6;
function relatedOf(e: Entry, roles: Role[]): Unit | null {
  const key = `${e.id}|${[...roles].sort().join(',')}`;
  if (!relatedCache.has(key)) relatedCache.set(key, relatedId(e, roles));
  const id = relatedCache.get(key);
  return id ? unitOf(id, entryById(id)) : null;
}
function relatedId(e: Entry, roles: Role[]): string | null {
  const votes = new Map<string, number>();
  for (const q of [...e.q.slice(0, 8), textFor(e.a, roles)]) {
    const found = findAnswers(q, { roles, limit: 8 }).filter((x) => x.entry.kind !== 'curated' && UNIT_KINDS.has(x.entry.kind) && x.score >= WEAK);
    const seen = new Set<string>();
    let w = 1;
    for (const m of found) {
      const u = unitOf(m.entry.id, m.entry);
      if (!u || u.kind === 'entry' || seen.has(u.id)) continue;
      seen.add(u.id);
      votes.set(u.id, (votes.get(u.id) ?? 0) + w * m.score);
      w /= 2;
      if (seen.size >= 3) break;
    }
  }
  // The curated answer's tutorial: the one task that has it, else the one screen. When that does not tell a unit clearly,
  // of several tasks with it, the one the ways of asking voted most.
  const mine = allGuides().filter((g) => roles.includes(g.role));
  const task = e.tutorial ? mine.flatMap((g) => g.tasks.filter((t) => t.tour === e.tutorial).map((t) => `${g.slug}:paso-a-paso:${t.id}`)) : [];
  const screen = e.tutorial ? mine.flatMap((g) => g.sections.map((s, k) => (s.tour === e.tutorial ? `${g.slug}:pantalla:${k}` : null)).filter((x): x is string => !!x)) : [];
  const by = task.length === 1 ? task[0] : task.length === 0 && screen.length === 1 ? screen[0] : null;
  if (by) votes.set(by, (votes.get(by) ?? 0) + 1);
  const ranked = (v: Map<string, number>) => [...v.entries()].sort((a, b) => b[1] - a[1]);
  let [best, second] = ranked(votes);
  if (!best || best[1] < VOTE_MIN) return null;
  let pick: string | null = !second || best[1] >= second[1] * VOTE_MARGIN ? best[0] : null;
  if (!pick) {
    const voted = by ? [] : task.filter((id) => votes.has(id)).sort((a, b) => votes.get(b)! - votes.get(a)!);
    if (voted.length) [best, second] = ranked(new Map(votes).set(voted[0], votes.get(voted[0])! + 1));
    if (!second || best[1] >= second[1] * VOTE_MARGIN) pick = best[0];
    else {
      // Still too close: the one of the two that says more of the curated answer's labels («Tu decisión», «Aceptar»…),
      // two at least; else none.
      const labels = new Set(quotedLabels(textFor(e.a, roles)).map(readable));
      const shared = (id: string) => {
        const u = unitOf(id, entryById(id));
        const its = new Set(u ? quotedLabels(unitText(u, roles)).map(readable) : []);
        return [...labels].filter((l) => its.has(l)).length;
      };
      const [a, b] = [shared(best[0]), shared(second[0])];
      if (Math.max(a, b) < 2 || a === b) return null;
      pick = a > b ? best[0] : second[0];
    }
  }
  // And the unit says what the curated answer says: a fair share of its words («Cambiar nombre» of a month is not «¿cómo
  // cambio mi nombre?», answered with Mi perfil).
  const u = unitOf(pick, entryById(pick));
  const said = new Set(tokens(textFor(e.a, roles)).filter((w) => w.length >= 4));
  const has = new Set(u ? tokens(unitText(u, roles)) : []);
  const share = said.size ? [...said].filter((w) => has.has(w)).length / said.size : 0;
  return share >= OVERLAP ? pick : null;
}
// The share of a curated answer's words its unit must say.
const OVERLAP = 0.25;
/** All a unit says, for the overlap above. */
function unitText(u: Unit, roles: Role[]): string {
  if (u.kind === 'task') return [u.task.title, u.task.when, ...u.task.steps].join(' ');
  if (u.kind === 'screen') return [u.section.title, u.section.what, ...u.section.youDo, ...(u.section.cannot ?? [])].join(' ');
  if (u.kind === 'flow') return [u.flow.title, ...u.flow.steps.flatMap((s) => [s.text, ...(s.branches ?? []).map((b) => b.text)])].join(' ');
  if (u.kind === 'topic') return [u.topic.title, ...topicLines(u.topic, roles)].join(' ');
  if (u.kind === 'term') return [u.term.term, ...u.term.aka, u.term.text].join(' ');
  if (u.kind === 'job') return u.guide ? [u.guide.job.mission, ...u.guide.job.responsibilities, ...u.guide.job.never].join(' ') : ADMIN_GUIDE.mission;
  return textFor(u.entry.a, roles);
}

/**
 * The unit of the topic for this person: its own, or the one a curated answer is about (or its own text, when none).
 * `asked`: the question the curated answer answered in this thread (WF-C2): when its ways of asking do not tell its unit,
 * what the person asked does («¿cómo creo un evento nuevo?» is the despacho's task «Crear un evento…»).
 */
function unitFor(topic: Entry | string, roles: Role[], asked?: string): Unit | null {
  const id = typeof topic === 'string' ? topic : topic.id;
  const e = typeof topic === 'string' ? entryById(topic) : topic;
  // The web's and Atención's entries are explained from their own sections (assistant/web-explain.ts), not here.
  if (e?.domain && e.domain !== 'equipo') return null;
  if (e?.kind === 'curated') return relatedOf(e, roles) ?? relatedByAsk(e, roles, asked) ?? { kind: 'entry', id: e.id, entry: e };
  return unitOf(id, e);
}
// The task of this person's guide that the question asked (for «paso a paso» of a topic with no steps of its own): the
// one whose title says most of its words, then its «Cuándo» and steps, and whose title starts with the question's own verb
// («¿cómo publico…?» is «Publicar a mano», not «Cambiar algo de una pieza aprobada»; «hago», «pongo» say no task). Only
// when one task stands out.
const ANY_VERB = new Set(tokens('hago hace hacer hacen pongo pone poner uso usa usar veo ve ver tengo tiene doy da dar'));
// A question that asks how to do something («¿cómo publico…?», «¿cómo se hace…?»).
const HOW_ASKED = /\bcomo\b/;
function taskAsked(asked: string, roles: Role[]): Unit | null {
  const words = tokens(asked).filter((w) => w.length >= 3);
  if (!words.length) return null;
  const verb = /\bcomo (?:(?:lo|la|los|las|le|les|se|me) )?([a-z]+)/.exec(readable(asked))?.[1];
  const v = verb ? tokens(verb)[0] : undefined;
  const share = (text: string) => {
    const have = tokens(text);
    return words.filter((w) => have.some((h) => rootsLike(h, w))).length / words.length;
  };
  let best: { u: Unit; score: number } | null = null;
  let second = 0;
  for (const g of allGuides()) {
    if (!roles.includes(g.role)) continue;
    for (const task of g.tasks) {
      const head = tokens(task.title)[0];
      const score = share(task.title) + 0.5 * share([task.when, ...task.steps].join(' ')) + (v && !ANY_VERB.has(v) && head && rootsLike(head, v) ? 1 : 0);
      const u: Unit = { kind: 'task', id: `${g.slug}:paso-a-paso:${task.id}`, role: g.role, guide: g, task };
      if (!best || score > best.score) {
        second = best?.score ?? 0;
        best = { u, score };
      } else if (score > second) second = score;
    }
  }
  return best && best.score >= 0.75 && best.score >= second + 0.25 ? best.u : null;
}
// The guide's unit of what the person asked: among the first entries of the guide that answer it (no curated one), the
// first of this person's whose text says a fair share of the curated answer's words (OVERLAP), as relatedId() checks.
const askedCache = new Map<string, string | null>();
function relatedByAsk(e: Entry, roles: Role[], asked?: string): Unit | null {
  const q = plain(asked ?? '');
  if (!q) return null;
  const key = `${e.id}|${[...roles].sort().join(',')}|${q}`;
  if (!askedCache.has(key)) {
    const said = new Set(tokens(textFor(e.a, roles)).filter((w) => w.length >= 4));
    let pick: string | null = null;
    const found = findAnswers(q, { roles, limit: 10 }).filter((x) => x.entry.kind !== 'curated' && (UNIT_KINDS.has(x.entry.kind) || x.entry.kind === 'flowStory') && x.score >= WEAK && (!x.entry.domain || x.entry.domain === 'equipo'));
    for (const m of found.slice(0, 4)) {
      const u = unitOf(m.entry.id, m.entry);
      if (!u || u.kind === 'entry' || !allowed(u, roles)) continue;
      const has = new Set(tokens(unitText(u, roles)));
      const share = said.size ? [...said].filter((w) => has.has(w)).length / said.size : 0;
      if (share >= OVERLAP) {
        pick = u.id;
        break;
      }
    }
    askedCache.set(key, pick);
  }
  const id = askedCache.get(key);
  return id ? unitOf(id, entryById(id)) : null;
}

// ── Saying it ──────────────────────────────────────────────────────────────────────────────────────────────────────

const ucFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const lcFirst = (s: string) => (s.startsWith('«') || /^\p{Lu}[\p{Ll}]+ →/u.test(s) || /^(?:IVT|Redes|Grabación|Política|Digital|Municipios|Obras|Hoy|Publicar|Resultados|Biblioteca|Agenda|Mensajes|Tweets|X|Instagram)\b/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
const end = (s: string) => (/[.!?…»)]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);
const forRole = (t: FacetText | undefined, roles: Role[]): string | undefined => (t === undefined ? undefined : textFor(t, roles) || undefined);

// The roles a step of a flow names, said to this person: «Redes», «el jefe o el despacho», «tú».
const WHO: Record<TeamRole, string> = { boss: 'el jefe', dispatch: 'el despacho', politics: 'política', ivt: 'el IVT', camera: 'Grabación', social: 'Redes' };
const TO_WHO: Record<TeamRole, string> = { boss: 'al jefe', dispatch: 'al despacho', politics: 'a política', ivt: 'al IVT', camera: 'a Grabación', social: 'a Redes' };
const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} o ${xs.at(-1)}` : (xs[0] ?? ''));
/** «Después le toca a Redes: …», «Después te toca a ti: …» (the asker's own step), «Después: …» (everyone). */
function turnOf(step: FlowStep, roles: Role[]): string {
  const mine = step.roles.filter((r) => roles.includes(r));
  const others = step.roles.filter((r) => !roles.includes(r));
  if (step.roles.length >= 5) return 'Después';
  if (!others.length) return 'Después te toca a ti';
  return `Después le toca ${list([...others.map((r) => TO_WHO[r]), ...(mine.length ? ['a ti'] : [])])}`;
}
const stepText = (s: FlowStep) => lcFirst(end(s.text));

/** Whether this text was a whole answer of the thread already. */
function saidWhole(text: string, said: string[]): boolean {
  const core = plain(text.replace(/\s*¿Sigo\?\s*$/, ''));
  return !core || said.some((x) => plain(x.replace(/\s*¿Sigo\?\s*$/, '')) === core);
}

/** Whether this text (or most of it) was already said in the thread. */
function wasSaid(text: string, said: string[]): boolean {
  const core = plain(text.replace(/\s*¿Sigo\?\s*$/, ''));
  if (!core) return true;
  return said.some((x) => {
    const p = plain(x);
    return p === core || (core.length >= 40 && p.includes(core));
  });
}

// The person's tutorials and buttons.
const toursOf = (ctx: ExplainContext) => new Set(ctx.tours ?? toursForRoles(ctx.roles, { admin: ctx.roles.includes('admin') }).map((t) => t.id));
const opens = (href: string | undefined, roles: Role[]) => (href && canOpen(href, roles) ? href : undefined);
const guideHref = (u: Unit, roles: Role[]): string | undefined => {
  const slug = 'guide' in u && u.guide ? u.guide.slug : undefined;
  return opens(slug ? `/ayuda/${slug}` : roles.includes('admin') && !TEAM_ROLES.some((r) => roles.includes(r)) ? '/ayuda/administracion' : '/ayuda', roles);
};
const flowsHref = (roles: Role[]) => opens('/ayuda/flujos', roles);

// The steps of a unit: a task's, a flow's (who does each), a topic's lines.
function stepsOf(u: Unit, roles: Role[]): string[] {
  if (u.kind === 'task') return u.task.steps;
  if (u.kind === 'flow') return u.flow.steps.map((s) => `${ucFirst(s.roles.length >= 5 ? 'cada quien' : s.roles.every((r) => roles.includes(r)) ? 'tú' : list(s.roles.map((r) => WHO[r])))}: ${stepText(s)}`);
  if (u.kind === 'topic') return topicLines(u.topic, roles);
  return [];
}
const topicLines = (t: SharedTopic, roles: Role[]) => (roles.includes('admin') && !TEAM_ROLES.some((r) => roles.includes(r)) ? (sharedFor({ messages: false }).find((x) => x.id === t.id)?.body ?? t.body) : t.body);

// A page of steps: up to five, about 440 letters at most (three long ones fill it), «¿Sigo?» when more are left.
const PAGE = 5;
const PAGE_LETTERS = 440;
function stepsPage(title: string | null, steps: string[], from: number): { text: string; next?: number } {
  const out: string[] = [];
  let len = title ? title.length + 16 : 0;
  let k = from;
  for (; k < steps.length && out.length < PAGE; k++) {
    const line = `${k + 1}) ${end(steps[k])}`;
    if (out.length && len + line.length > PAGE_LETTERS) break;
    out.push(line);
    len += line.length + 1;
  }
  const more = k < steps.length;
  const head = title && from === 0 ? `${title}, paso a paso: ` : '';
  return { text: `${head}${out.join(' ')}${more ? ' ¿Sigo?' : ''}`, ...(more ? { next: k } : {}) };
}

// The steps said once more, one after the other (stepsFacet, when the list was already said), three at a time.
const RETELL = /^Primero: /;
function retellPage(steps: string[], from: number): { text: string; next?: number } {
  const out: string[] = [];
  let k = from;
  for (; k < steps.length && out.length < PAGE; k++) {
    const lead = k === 0 ? 'Primero' : k === steps.length - 1 ? 'Al final' : 'Luego';
    const line = `${lead}: ${lcFirst(end(steps[k]))}`;
    if (out.length && [...out, line].join(' ').length > PAGE_LETTERS) break;
    out.push(line);
  }
  const more = k < steps.length;
  return { text: `${out.join(' ')}${more ? ' ¿Sigo?' : ''}`, ...(more ? { next: k } : {}) };
}

// How far the steps were already said in the thread: an answer of the last ones that listed them («Cargar una ficha…,
// paso a paso: 1) … 2) …»), up to the last step it has, in order from the first (an answer that only tells the task in
// its own words said none of them).
function saidUpTo(steps: string[], said: string[]): number {
  let upTo = -1;
  for (const x of said.slice(-3)) {
    if (!/(?:^|\s)1\) /.test(x) && !/(?:^|\s)\d+\) /.test(x)) continue;
    const r = plain(x);
    for (let k = upTo + 1; k < steps.length; k++) {
      const p = plain(steps[k]);
      if (!p || !r.includes(p.slice(0, Math.min(p.length, 60)))) break;
      upTo = k;
    }
  }
  return upTo;
}

// The step of its flow a task is: one of the task's role, the one that shares most of its labels and words.
function flowStepOf(task: Task, role: TeamRole): { flow: Flow; index: number } | null {
  const flow = task.flow ? FLOWS.find((f) => f.id === task.flow) : undefined;
  if (!flow) return null;
  const labels = (t: string) => new Set([...t.matchAll(/«([^«»]+)»/g)].map((m) => plain(m[1])));
  const mine = [task.title, task.when, ...task.steps].join(' ');
  const myLabels = labels(mine);
  const myWords = new Set(tokens(mine));
  let best = -1;
  let bestScore = 0;
  flow.steps.forEach((s, k) => {
    if (!s.roles.includes(role)) return;
    const text = [s.text, ...(s.branches ?? []).map((b) => b.text)].join(' ');
    const score = [...labels(text)].filter((l) => myLabels.has(l)).length * 2 + tokens(text).filter((w) => myWords.has(w)).length * 0.25;
    if (score > bestScore) [best, bestScore] = [k, score];
  });
  return best >= 0 ? { flow, index: best } : null;
}

// The way out of a step of a flow that goes on: its «Sí» (or the first) that leads to a later step; a «Sí» that goes back
// («¿Se canceló?» → back to «Ponerle fecha») is not the way on.
// A step's question that asks who did it («¿Lo creó el jefe?»): its «Sí» is that role's way, its «No» everyone else's.
const DONE_BY = /^(?:lo|la|los|las) (?:creo|puso|propuso|hizo|mando|cargo) (?:el |la )?([a-z]+)$/;
function wayOn(flow: Flow, index: number, roles: Role[] = []): NonNullable<FlowStep['branches']>[number] | undefined {
  const s = flow.steps[index];
  const ahead = (b: { to?: string }) => !!b.to && flow.steps.findIndex((x) => x.id === b.to) > index;
  const by = s.question ? DONE_BY.exec(readable(s.question))?.[1] : undefined;
  const role = by ? ROLE_WORDS.find(([re]) => re.test(by))?.[1] : undefined;
  if (role && roles.length) {
    const mine = roles.includes(role);
    const b = s.branches?.find((x) => (mine ? /^S[ií](?![\p{L}])/u : /^No(?![\p{L}])/u).test(x.label));
    if (b && ahead(b)) return b;
  }
  return s.branches?.find((b) => /^S[ií](?![\p{L}])/u.test(b.label) && ahead(b)) ?? s.branches?.find(ahead);
}
// The step that comes after one of a flow: where its way on leads, else the next one.
function flowNext(flow: Flow, index: number, roles: Role[] = []): number | null {
  const way = wayOn(flow, index, roles);
  const to = way?.to ? flow.steps.findIndex((x) => x.id === way.to) : index + 1;
  return to > index && to < flow.steps.length ? to : null;
}
const POINTS_ON = /^(?:se )?sigue (?:con|en) (?:el )?paso \d+\.?$/i;
// What the way on of a step says happens right then («Si la puso el despacho, al jefe le llega «Por decidir»»), when the
// thread did not say any of it yet; null when it did. Only the «Sí» or «No» of a yes-or-no question:
// one of several ways («¿De qué color es?»: «Verde», «Amarillo»…) is no outcome of the step.
function wayOnSays(flow: Flow, index: number, said: string[], roles: Role[] = []): string | null {
  const way = wayOn(flow, index, roles);
  if (!way?.text || !/^(?:S[ií]|No)$/u.test(way.label.trim())) return null;
  // (A way that only points on, «Se sigue con el paso 5.», says nothing of its own: the step it leads to does.)
  if (POINTS_ON.test(way.text.trim())) return null;
  // (Said in part already, it was said: its sentences go together.)
  const all = sentencesOf(way.text);
  const told = (x: string) => wasSaid(x, said) || said.some((y) => plain(y).includes(plain(x).replace(/[.]$/, '')));
  return all.length && !all.some(told) ? all.join(' ') : null;
}
// After the asker's own steps: the next step of the flow that someone else does (design §4(c)3 next (i)).
function flowNextOther(flow: Flow, index: number, roles: Role[]): number | null {
  let k = flowNext(flow, index, roles);
  for (let n = 0; k !== null && n < flow.steps.length; n++) {
    if (!flow.steps[k].roles.every((r) => roles.includes(r))) return k;
    k = flowNext(flow, k, roles);
  }
  return k;
}

// A step of a flow said as what comes next: «Después le toca a Redes: …». When it is the asker's own, and `more`, who
// comes after it too («Después te toca a ti: … Luego le toca al jefe: …»), within about 360 letters.
function flowTurn(flow: Flow, n: number, roles: Role[], more: boolean): Candidate {
  const s = flow.steps[n];
  let text = `${turnOf(s, roles)}: ${stepText(s)}`;
  let last = s;
  const after = more && s.roles.every((r) => roles.includes(r)) ? flowNextOther(flow, n, roles) : null;
  if (after !== null) {
    const t = flow.steps[after];
    const line = `${turnOf(t, roles).replace(/^Después/, 'Luego')}: ${stepText(t)}`;
    if (text.length + line.length <= 360) {
      text = `${text} ${line}`;
      last = t;
    }
  }
  return { text, entryId: `flujo:${flow.id}:${last.id}`, ...(s.href && canOpen(s.href, roles) ? { goTo: s.href } : {}) };
}

// Whether X says what the task as a whole does («¿y después de aprobarla?» of «Aprobar una amarilla o una roja»).
function aboutTitle(title: string, about: string): boolean {
  const verb = tokens(title)[0];
  const want = tokens(about).filter((w) => w.length >= 3);
  return !!verb && want.length > 0 && want.length <= 2 && want.some((w) => w === verb || (w.length >= 4 && verb.length >= 4 && (w.startsWith(verb) || verb.startsWith(w))));
}

// The next step of the flow (from this one on) that this role does.
function flowNextBy(flow: Flow, index: number, role: TeamRole, roles: Role[] = []): number | null {
  let k = flowNext(flow, index, roles);
  for (let n = 0; k !== null && n < flow.steps.length; n++) {
    if (flow.steps[k].roles.includes(role)) return k;
    k = flowNext(flow, k, roles);
  }
  return null;
}
// The next step of the flow (from this one on) whose text says the verb asked («¿y después quién lo publica?»).
function flowNextDoing(flow: Flow, index: number, verb: string, roles: Role[] = []): number | null {
  const root = tokens(verb)[0];
  if (!root) return null;
  let k = flowNext(flow, index, roles);
  for (let n = 0; k !== null && n < flow.steps.length; n++) {
    const s = flow.steps[k];
    if (tokens([s.text, ...(s.branches ?? []).map((b) => b.text)].join(' ')).some((w) => rootsLike(w, root))) return k;
    k = flowNext(flow, k, roles);
  }
  return null;
}
const ROLE_WORDS: [RegExp, TeamRole][] = [
  [/\bjefe\b/, 'boss'],
  [/\bdespacho\b/, 'dispatch'],
  [/\bpolitica\b/, 'politics'],
  [/\bivt\b/, 'ivt'],
  [/\bgrabacion\b/, 'camera'],
  [/\bredes\b/, 'social'],
];
/** The team role a «¿y después qué hace X?» names, or null. */
function roleNamed(about: string): TeamRole | null {
  const a = readable(about);
  if (a.split(' ').length > 2) return null;
  return ROLE_WORDS.find(([re]) => re.test(a))?.[1] ?? null;
}

// The parts of a unit a «lo de X» can be about: its own (a task's steps, a screen's items, a flow's steps and ways out, a
// topic's lines), then what the guide says of the same around it (the screens of the task's tutorial, its flow, its
// role's questions) and its «Explicado fácil». `own`: a part of the unit itself (a task's step says «Es el paso N»).
type Part = { text: string; step?: number; own: boolean };
function partsOf(u: Unit, roles: Role[]): Part[] {
  const extra = (texts: (string | undefined)[]): Part[] => texts.filter((t): t is string => !!t).map((text) => ({ text, own: false }));
  const easy = [forRole(facetsOf(u.id)?.easy, roles)];
  const faq = (g?: RoleGuide) => (g ? g.faq.map((f) => `${f.q} ${f.a}`) : []);
  if (u.kind === 'task') {
    const own = u.task.steps.map((text, step) => ({ text, step, own: true }));
    // The task's screens and its flow say more of the same labels («Guardar borrador»: todavía no le llega al jefe).
    const fs = flowStepOf(u.task, u.role);
    const flow = fs ? fs.flow.steps.flatMap((s) => [s.text, ...(s.branches ?? []).map((b) => b.text)]) : [];
    const screens = u.guide.sections.filter((s) => s.tour && s.tour === u.task.tour).flatMap((s) => [...s.youDo, ...(s.cannot ?? [])]);
    return [...own, { text: u.task.when, own: true }, ...extra([...screens, ...flow, ...faq(u.guide), ...easy])];
  }
  if (u.kind === 'screen') return [{ text: u.section.what, own: true }, ...u.section.youDo.map((text) => ({ text, own: true })), ...(u.section.cannot ?? []).map((text) => ({ text: `No puedes: ${lcFirst(text)}`, own: true })), ...extra([...faq(u.guide), ...easy])];
  if (u.kind === 'flow') return [...u.flow.steps.flatMap((s, k) => [{ text: stepsOf(u, roles)[k], step: k, own: true }, ...(s.branches ?? []).map((b) => ({ text: `${b.label}: ${b.text}`, step: k, own: true }))]), ...extra(easy)];
  if (u.kind === 'topic') return [...topicLines(u.topic, roles).map((text, step) => ({ text, step, own: true })), ...extra(easy)];
  if (u.kind === 'term') return [{ text: u.term.text, own: true }, ...extra(easy)];
  if (u.kind === 'job') return [...(u.guide ? [u.guide.job.mission, ...u.guide.job.responsibilities, ...u.guide.job.never] : [ADMIN_GUIDE.mission]).map((text) => ({ text, own: true })), ...extra([...faq(u.guide), ...easy])];
  return sentencesOf(textFor(u.entry.a, roles)).map((text) => ({ text, own: true }));
}

// A part that says what X is (asked what it means or what it is for): the label or the word, then «:» within a few words
// («Arriba, «Vencidas en los municipios»: las que pasaron…», «Guardar borrador» si te falta algo: todavía no…»), X «es»
// or «son» right after it, or the guide's question «¿Qué es una ficha vencida?». Read lower case and without accents, with
// the punctuation.
const fold = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const definesWord = (text: string, w: string) => {
  const stem = w.slice(0, Math.max(4, w.length - 1)).replace(/[^a-z0-9]/g, '');
  if (stem.length < 3) return false;
  return new RegExp(String.raw`\b${stem}[a-z]*»?(?: \([^)]*\))?(?: [a-z]+){0,4}:|\b${stem}[a-z]* (?:es|son) |que (?:es|son) (?:una?|el|la|los|las) (?:[a-z]+ ){0,2}${stem}`).test(fold(text));
};

// Two roots of the same word: the same, one the other with an ending, or one verb said two ways whose roots part only at
// their last letters («equivoco» and «equivocaste»: «equibos» and «equibocast» once folded). A verb whose stem changes
// when stressed is the same verb too («devuelvo» and «devolver», «cierra» and «cerrar»: «ue» is «o», «ie» is «e»).
const unstressed = (w: string) => w.replace(/ue/g, 'o').replace(/ie/g, 'e');
function rootsLike(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4) return false;
  if (a.startsWith(b) || b.startsWith(a)) return true;
  let k = 0;
  while (k < a.length && k < b.length && a[k] === b[k]) k++;
  if (k >= 5 && Math.min(a.length, b.length) - k <= 1) return true;
  const [x, y] = [unstressed(a), unstressed(b)];
  return (x !== a || y !== b) && x.length >= 4 && y.length >= 4 && (x === y || x.startsWith(y) || y.startsWith(x));
}

const TURNS = new Set(['sin', 'no', 'nunca', 'menos', 'solo', 'nada']);
// The auxiliaries of an X, which say nothing of it («¿y si ya la había publicado?» is about «publicado»).
export const AUX = new Set(tokens('habia habian hubiera hubieran hubiese haya hayan hemos estaba estaban estuvo sido'));
/**
 * The part of the unit that says X best (its labels named whole first, then its words; what defines X, asked what it
 * means), or null. `bonus`: what the ask prefers of a part (a «si …» for «¿y si…?», someone named for «¿y quién…?»).
 */
function partAbout(u: Unit, about: string, roles: Role[], define = false, last = false, bonus?: (p: Part) => number, minShare = 0, ownFirst = false, pool?: Part[]): Part | null {
  const want = tokens(about).filter((w) => w.length >= 3 && !AUX.has(w));
  if (!want.length) {
    // (X with no word of its own, «no va»: the part that quotes it as a label, «No va».)
    const x = readable(about).replace(ARTICLES, '').trim();
    if (x.length < 3) return null;
    return (pool ?? partsOf(u, roles)).find((p) => [...p.text.matchAll(/«([^«»]+)»/g)].some((m) => readable(m[1]) === x)) ?? null;
  }
  const a = ` ${readable(about)} `;
  // A phrase with a word that turns its meaning around and that tokens() leaves out («sin programar» is «programar» to
  // it): the part must say the phrase itself.
  const phrase = readable(about).replace(ARTICLES, '').trim();
  const whole = phrase.split(' ').some((w) => TURNS.has(w)) ? phrase : null;
  // (A label names X when it says most of X: «Feed» alone does not name «la quito del feed».)
  const covers = (l: string) => {
    const its = tokens(l);
    return want.filter((w) => its.some((h) => rootsLike(h, w))).length / want.length >= 0.67;
  };
  // (A follow-up asks first of the topic itself, `ownFirst`: its own parts, then what is said around it.)
  const all = pool ?? partsOf(u, roles);
  if (ownFirst && all.some((p) => !p.own)) {
    const mine = partAbout(u, about, roles, define, last, bonus, minShare, false, all.filter((p) => p.own));
    if (mine) return mine;
  }
  const scored = all.filter((p) => !whole || ` ${readable(p.text)} `.includes(` ${whole} `)).map((p) => {
    const labels = [...p.text.matchAll(/«([^«»]+)»/g)].map((m) => readable(m[1]));
    const named = labels.some((l) => l.length >= 3 && (a.includes(` ${l} `) || ` ${l} `.includes(a)) && covers(l));
    const have = tokens(p.text);
    const like = (w: string) => have.some((h) => rootsLike(h, w));
    const share = want.filter(like).length / want.length;
    const defines = define && want.some((w) => definesWord(p.text, w));
    // (A preference counts only for a part that already says X: it orders, it never makes one.)
    const extra = bonus && share >= 0.5 ? bonus(p) : 0;
    // (A follow-up that names X wants a part that says most of X itself: `minShare`.)
    if (share < minShare && !named) return { p, score: 0 };
    return { p, score: share + (named ? 0.5 : 0) + (defines ? 0.4 : 0) + (p.own ? 0.1 : 0) + extra };
  });
  // The best (the last of the best, «¿y después de …?»: the step where it is done).
  let best: { p: Part; score: number } | null = null;
  for (const x of scored) if (!best || x.score > best.score || (last && x.score === best.score)) best = x;
  if (!best || best.score < 0.6) return null;
  // A part around it that says the same and more («Los teléfonos solo van en los contactos. Para ver los contactos…»).
  const said = plain(best.p.text);
  const fuller = best.p.own ? scored.find((x) => !x.p.own && plain(x.p.text).includes(said) && plain(x.p.text).length > said.length) : undefined;
  return fuller ? { ...fuller.p, step: best.p.step } : best.p;
}

// The colours of the semáforo, said alone («¿qué significa roja?»), and other names of a word the glossary does not list.
// Never «programado»: it is also the state of a ficha comunitaria (por hacerse), as the glossary says; the topic's own
// parts answer it.
const MORE_NAMES: Record<string, string[]> = {
  semaforo: ['rojo', 'roja', 'rojas', 'rojos', 'amarillo', 'amarilla', 'amarillas', 'amarillos', 'verde', 'verdes', 'el color', 'los colores'],
  trancado: ['trancada', 'trancadas', 'trancados'],
};
const namesOf = (g: GlossaryTerm) => [g.term, ...g.aka, ...(MORE_NAMES[g.id] ?? [])];
const ARTICLES = /^(?:(?:el|la|los|las|un|una|lo|eso|esa|ese|esto|esta|este|eso de|lo de) )+/;
/** A word of «Palabras de la app» that X names (one of its names, whole), and whether X is only that name. */
function termNamed(about: string): { g: GlossaryTerm; only: boolean } | null {
  const bare = readable(about).replace(ARTICLES, '').trim();
  for (const g of GLOSSARY) if (namesOf(g).map((n) => readable(n)).includes(bare)) return { g, only: true };
  // (Inside more words, only its own names: «la marca roja» of a network is not the semáforo.)
  for (const g of GLOSSARY) if ([g.term, ...g.aka].some((n) => ` ${bare} `.includes(` ${readable(n)} `))) return { g, only: false };
  return null;
}
/** The first word of «Palabras de la app» a text uses («¿qué significa eso?»: the word of the answer before). */
function termIn(text: string): GlossaryTerm | null {
  const t = ` ${readable(text.replace(/«[^«»]*»/g, ' '))} `;
  let best: { g: GlossaryTerm; at: number } | null = null;
  for (const g of GLOSSARY) {
    for (const n of [g.term, ...g.aka]) {
      const at = t.indexOf(` ${readable(n)} `);
      if (at >= 0 && (!best || at < best.at)) best = { g, at };
    }
  }
  return best?.g ?? null;
}

const facetText = (u: Unit, key: 'easy' | 'example' | 'why', roles: Role[]) => forRole(facetsOf(u.id)?.[key], roles);
const termFacet = (g: GlossaryTerm, key: 'easy' | 'example' | 'why', roles: Role[]) => forRole(facetsOf(`palabra:${g.id}`)?.[key], roles);
// A word's line as the index says it to this person («Programar» to whoever does not publish says who publishes).
const termLine = (g: GlossaryTerm, roles: Role[]) => textFor(entryById(`palabra:${g.id}`)?.a ?? glossaryLine(g), roles);

// What a unit is, in the guide's words (its «Para qué es», the task's title and «Cuándo», the word's meaning).
function guideText(u: Unit, roles: Role[]): string {
  if (u.kind === 'task') return `${u.task.title}: ${lcFirst(end(u.task.when))}`;
  if (u.kind === 'screen') return `${u.section.title.replace(/: /g, ', ')}: ${lcFirst(end(u.section.what))}`;
  if (u.kind === 'flow') return `${u.flow.title}: ${stepsOf(u, roles)[0] ?? ''}`;
  if (u.kind === 'topic') return topicLines(u.topic, roles)[0] ?? '';
  if (u.kind === 'term') return termLine(u.term, roles);
  if (u.kind === 'job') return u.guide ? u.guide.job.mission : ADMIN_GUIDE.mission;
  return textFor(u.entry.a, roles);
}
// What a unit is called: a task's or a screen's title; a curated answer's id, without its file's prefix («red-carrusel»
// is «carrusel»: the word of «Palabras de la app» it names is what it is about; its ways of asking name anything).
const nameOf = (u: Unit): string =>
  u.kind === 'task' ? u.task.title : u.kind === 'screen' ? u.section.title : u.kind === 'entry' ? u.entry.id.replace(/^curado:[a-z]+-/, '').replace(/-/g, ' ') : '';
const tourOfUnit = (u: Unit): string | undefined => (u.kind === 'task' ? u.task.tour : u.kind === 'screen' ? u.section.tour : u.kind === 'entry' ? u.entry.tutorial : undefined);

type Candidate = Omit<ExplainAnswer, 'facet'>;

// ── The facets ─────────────────────────────────────────────────────────────────────────────────────────────────────

function simpler(u: Unit, ctx: ExplainContext, tours: Set<string>): Candidate[] {
  const out: Candidate[] = [];
  const easy = facetText(u, 'easy', ctx.roles);
  if (easy) out.push({ text: easy, entryId: u.id });
  // The word of «Palabras de la app» its title names, said simply, and its first step (then only the word's first
  // sentence: an answer says two).
  const name = nameOf(u);
  const g = name ? termIn(name) : null;
  const first = stepsOf(u, ctx.roles)[0];
  const wordText = g ? (termFacet(g, 'easy', ctx.roles) ?? termLine(g, ctx.roles)) : undefined;
  const word = wordText && first ? sentencesOf(wordText)[0] : wordText;
  if (word) out.push({ text: [word, first ? `Lo primero: ${lcFirst(end(first))}` : ''].filter(Boolean).join(' '), entryId: u.id });
  // Its first sentence, and the tutorial when there is one.
  const tour = tourOfUnit(u);
  const all = sentencesOf(guideText(u, ctx.roles));
  const lead = all[0];
  if (lead && tour && tours.has(tour)) out.push({ text: `${lead} ¿Te lo muestro? Toca el botón.`, entryId: u.id, tutorial: tour });
  // Nothing simpler written and no tutorial (WF-C2): what it is in its first sentence, when the topic says more than that,
  // and where the guide explains it with calm (never «dime con tus palabras»: the topic is known).
  const go = guideHref(u, ctx.roles);
  if (lead && all.length > 1 && go) out.push({ text: `En corto: ${lcFirst(end(lead))} La guía lo explica con calma: toca el botón.`, entryId: u.id, goTo: go });
  return out;
}

function stepsFacet(u: Unit, ctx: ExplainContext, tours: Set<string>): Candidate[] {
  const said = ctx.said ?? [];
  const steps = stepsOf(u, ctx.roles);
  const tour = tourOfUnit(u);
  const tutorial = tour && tours.has(tour) ? tour : undefined;
  if (steps.length) {
    // From the cursor, else after what the last answers already said (the guide's «paso a paso» says the first ones).
    const from = ctx.cursor ?? saidUpTo(steps, said) + 1;
    const title = u.kind === 'task' ? u.task.title : u.kind === 'flow' ? u.flow.title : u.kind === 'topic' ? u.topic.title : null;
    if (from < steps.length) {
      const page = stepsPage(title, steps, from);
      return [{ text: page.text, entryId: u.id, ...(tutorial ? { tutorial } : {}), ...(page.next !== undefined ? { cursor: page.next } : {}), ...(u.kind === 'flow' ? { goTo: flowsHref(ctx.roles) } : {}) }];
    }
    // All of them were said as a list: once more, one after the other in plain words («Primero: … Luego: … Al final: …»),
    // with the tutorial when there is one (WF-C2: «paso a paso» asks for the steps, not for something else). After that
    // retell, the tutorial shows them on the screen, or else the guide has them (never the list of the tutorials: the
    // topic is this one).
    if (!said.some((x) => RETELL.test(x))) {
      const page = retellPage(steps, 0);
      return [{ text: page.text, entryId: u.id, ...(tutorial ? { tutorial } : {}), ...(page.next !== undefined ? { cursor: page.next } : {}), ...(u.kind === 'flow' ? { goTo: flowsHref(ctx.roles) } : {}) }];
    }
    if (tutorial) return [{ text: 'Ya te dije todos los pasos. Si quieres, te los muestro en la pantalla: toca el botón.', entryId: u.id, tutorial }];
    const go = u.kind === 'task' ? opens(`/ayuda/${u.guide.slug}?ver=pasos`, ctx.roles) : u.kind === 'flow' ? flowsHref(ctx.roles) : guideHref(u, ctx.roles);
    return go ? [{ text: 'Esos son todos los pasos. Para verlos con calma, están en «Ayuda y guías»: toca el botón.', entryId: u.id, goTo: go }] : [];
  }
  // No steps of its own (a screen, a word, a curated answer): a screen's task, the one that has its tutorial (of several,
  // the one the person asked about); else the task the person asked about, when their guide has one («¿cómo hago el
  // storyboard?» answered by the screen that shows it: «Armar el storyboard»); then the screen's tutorial.
  const out: Candidate[] = [];
  const asked = ctx.asked ? taskAsked(ctx.asked, ctx.roles) : null;
  const shared = u.kind === 'screen' && u.guide ? u.guide.tasks.filter((t) => t.tour && t.tour === u.section.tour) : [];
  const own = shared.length === 1 ? shared[0] : shared.find((t) => asked?.kind === 'task' && asked.task === t) ?? (asked ? undefined : shared[0]);
  if (own && u.kind === 'screen' && u.guide) out.push(...stepsFacet({ kind: 'task', id: `${u.guide.slug}:paso-a-paso:${own.id}`, role: u.guide.role, guide: u.guide, task: own }, { ...ctx, cursor: undefined }, tours));
  else if (asked && asked.id !== u.id) out.push(...stepsFacet(asked, { ...ctx, cursor: undefined }, tours));
  if (u.kind === 'screen' && tutorial) out.push({ text: `Te lo muestro paso a paso en la pantalla: toca el botón y te enseño ${lcFirst(u.section.title.replace(/: .*$/, ''))}.`, entryId: u.id, tutorial });
  return out;
}

function example(u: Unit, ctx: ExplainContext): Candidate[] {
  const out: Candidate[] = [];
  const ex = facetText(u, 'example', ctx.roles);
  if (ex) out.push({ text: ex, entryId: u.id });
  // The example of the word its title names.
  const name = nameOf(u);
  const g = name ? termIn(name) : null;
  const gx = g ? termFacet(g, 'example', ctx.roles) : undefined;
  if (gx && g) out.push({ text: gx, entryId: `palabra:${g.id}` });
  return out;
}

function next(u: Unit, ctx: ExplainContext): Candidate[] {
  const said = ctx.said ?? [];
  const roles = ctx.roles;
  // «¿Y después qué hace Grabación?»: the next step of the flow that role does.
  const who = ctx.about ? roleNamed(ctx.about) : null;
  if (u.kind === 'task') {
    const steps = u.task.steps;
    // Where the person is in the task: the step asked about, the cursor, the step the topic was, or what was said.
    const whole = ctx.about && !who ? aboutTitle(u.task.title, ctx.about) : false;
    const at = ctx.about && !who && !whole ? partAbout(u, ctx.about, roles, false, true)?.step : whole ? steps.length - 1 : undefined;
    const pos = at ?? (ctx.cursor !== undefined ? ctx.cursor - 1 : (u.step ?? (saidUpTo(steps, said) >= 0 ? saidUpTo(steps, said) : steps.length - 1)));
    if (pos + 1 < steps.length && !who) {
      const k = pos + 1;
      const left = k + 1 < steps.length;
      return [{ text: `Después: ${lcFirst(end(steps[k]))}${left ? ' ¿Sigo?' : ''}`, entryId: u.id, ...(left ? { cursor: k + 1 } : {}) }];
    }
    // At its end: what its step of the flow says happens then (its way on: «Si la puso el despacho, al jefe le llega «Por
    // decidir»»), then the next step of its flow that someone else does (or the one the role asked about does).
    const fs = flowStepOf(u.task, u.role);
    const did = fs && ctx.doer ? flowNextDoing(fs.flow, fs.index, ctx.doer, roles) : null;
    if (fs && did !== null) return [flowTurn(fs.flow, did, roles, false)];
    const then = fs && !who && !ctx.about ? wayOnSays(fs.flow, fs.index, [...said, unitText(u, roles)], roles) : null;
    if (fs && then) return [{ text: `Después: ${lcFirst(end(then))}`, entryId: `flujo:${fs.flow.id}:${fs.flow.steps[fs.index].id}` }];
    const n = fs ? (who ? flowNextBy(fs.flow, fs.index, who, roles) : flowNext(fs.flow, fs.index, roles)) : null;
    if (fs && n !== null) return [flowTurn(fs.flow, n, roles, !who)];
    return [];
  }
  if (u.kind === 'flow') {
    const from = (ctx.about && !who ? partAbout(u, ctx.about, roles)?.step : undefined) ?? u.step ?? (ctx.cursor !== undefined ? ctx.cursor - 1 : 0);
    const did = ctx.doer ? flowNextDoing(u.flow, from, ctx.doer, roles) : null;
    if (did !== null) return [flowTurn(u.flow, did, roles, false)];
    const then = !who && !ctx.about ? wayOnSays(u.flow, from, said, roles) : null;
    if (then) return [{ text: `Después: ${lcFirst(end(then))}`, entryId: `flujo:${u.flow.id}:${u.flow.steps[from].id}` }];
    const n = who ? flowNextBy(u.flow, from, who, roles) : flowNext(u.flow, from, roles);
    if (n === null) return [{ text: `Ahí termina el camino: ${lcFirst(u.flow.title)}. Lo ves completo en «Ayuda y guías», en «Cómo va el trabajo entre todos».`, entryId: u.id, ...(flowsHref(roles) ? { goTo: flowsHref(roles) } : {}) }];
    return [flowTurn(u.flow, n, roles, !who)];
  }
  if (u.kind === 'topic') return more(u, ctx);
  // A curated answer that declares what comes after it (design §4(c)3 next (ii)).
  const nx = u.kind === 'entry' && u.entry.next ? entryById(u.entry.next) : undefined;
  if (nx && allowed(unitOf(nx.id, nx) ?? { kind: 'entry', id: nx.id, entry: nx }, roles)) return [{ text: `Después: ${lcFirst(end(textFor(nx.a, roles)))}`, entryId: nx.id }];
  // A screen or a curated answer with nothing after it of its own (WF-C2): the task the person asked, by its title and its
  // verb, goes on («¿cómo publico una pieza aprobada?» → «¿y después de publicar?»: its flow's next step).
  const task = ctx.asked && HOW_ASKED.test(readable(ctx.asked)) && (u.kind === 'screen' || u.kind === 'entry') ? taskAsked(ctx.asked, roles) : null;
  if (task?.kind === 'task' && allowed(task, roles)) return next(task, ctx);
  return [];
}

function purpose(u: Unit, ctx: ExplainContext): Candidate[] {
  const roles = ctx.roles;
  const out: Candidate[] = [];
  const easy = facetText(u, 'easy', roles);
  if (u.kind === 'term') out.push({ text: termLine(u.term, roles), entryId: u.id });
  if (u.kind === 'screen') out.push({ text: guideText(u, roles), entryId: u.id });
  if (easy) out.push({ text: easy, entryId: u.id });
  if (u.kind === 'task') {
    const fs = flowStepOf(u.task, u.role);
    const n = fs ? flowNextOther(fs.flow, fs.index, roles) : null;
    const after = fs && n !== null ? ` Con eso, ${lcFirst(turnOf(fs.flow.steps[n], roles).replace(/^Después /, ''))}: ${stepText(fs.flow.steps[n])}` : '';
    out.push({ text: `${guideText(u, roles)}${after}`, entryId: u.id });
  }
  if (u.kind === 'flow' || u.kind === 'topic' || u.kind === 'job') out.push({ text: guideText(u, roles), entryId: u.id });
  // A curated answer: its sentence that says what it is for («… para que cuente en los resultados»), else its first one.
  if (u.kind === 'entry') {
    const s = sentencesOf(textFor(u.entry.a, roles));
    const forWhat = s.find((x) => /\b(?:para|paraque|sirve|sirven)\b/.test(readable(x)) && !/^para (?:verlo|ver|abrir)/.test(readable(x)));
    if (forWhat) out.push({ text: end(forWhat), entryId: u.id });
  }
  return out;
}

// What makes a sentence a reason: «porque…», «para que…», «así nadie…», «es información de seguridad»… (read plain).
// («Aun así, no escribas…» is no reason.)
const REASON = /\b(?:porque|por eso|paraque|(?<!\baun )asi nadie|(?<!\baun )asi no|para no|ya que|es informacion de seguridad|son informacion de seguridad)\b/;
/** «No: … no se prestan, porque con ellos se aprueba todo…» said as the reason: «Porque con ellos se aprueba todo…». */
function reasonText(t: string): string {
  const m = /(?:^|[,;:]\s*|\s)porque\s+(.+)$/i.exec(t);
  return m ? end(`Porque ${m[1]}`) : end(ucFirst(t));
}
/** The topic's own sentence that gives a reason (about X first, when the ask names X), or null. */
function reasonPart(u: Unit, roles: Role[], about?: string): Part | null {
  const reasons = partsOf(u, roles).filter((p) => REASON.test(readable(p.text)));
  // Without X, only the topic's own text («¿por qué?» of a task is never the reason of its guide's other questions).
  if (!about) return reasons.find((p) => p.own) ?? null;
  if (!reasons.length) return null;
  const want = tokens(about).filter((w) => w.length >= 3);
  if (!want.length) return reasons.find((p) => p.own) ?? null;
  const like = (have: string[], w: string) => have.some((h) => rootsLike(h, w));
  let best: Part | null = null;
  let top = 0;
  for (const p of reasons) {
    const share = want.filter((w) => like(tokens(p.text), w)).length / want.length;
    if (share > top) [best, top] = [p, share];
  }
  return top >= 0.4 ? best : null;
}

// ── The follow-ups of a thread (WF-C2) ─────────────────────────────────────────────────────────────────────────────

// «¿Y si…?»: the part of the topic about X that says what happens then (a «si …», a «cuando …», what cannot be done).
const IF_SAYS = /(?:^|[\s(«,:])(?:si|cuando|mientras|aunque)\s/i;
// (A «si» of a label the screen shows is no condition: «Qué cambia si lo publicas».)
export const saysIf = (t: string) => IF_SAYS.test(t.replace(/«[^«»]*»/g, '«»'));
const ifBonus = (p: Part) => (saysIf(p.text) ? 0.3 : 0) + (/^No puedes/.test(p.text) ? 0.1 : 0);
function whatIf(u: Unit, ctx: ExplainContext): Candidate[] {
  if (!ctx.about) return [];
  // (A curated answer's own sentence that says it first: «Sin área, …» to «¿y si no tiene área?».)
  const said = u.kind === 'entry' ? sentenceSaying('whatif', ctx.about, textFor(u.entry.a, ctx.roles)) : null;
  if (said) return [{ text: end(ucFirst(said)), entryId: u.id }];
  // (What goes on from the answer just said first: a part that quotes one of its labels, «No va» → «queda «Archivada»».)
  const lastLabels = new Set(quotedLabels(ctx.said?.at(-1) ?? '').map(readable));
  const goesOn = (p: Part) => ifBonus(p) + (quotedLabels(p.text).some((l) => lastLabels.has(readable(l))) ? 0.3 : 0);
  const part = partAbout(u, ctx.about, ctx.roles, false, false, goesOn, 0.6, true);
  return part ? [{ text: end(ucFirst(part.text)), entryId: u.id }] : [];
}

// «¿Y quién…?»: the part of the topic about X that names who does it; a task of one's own is the person's.
// («El editor» alone is the web's screen where one writes: the role is «el editor de la web».)
// («Tú», with its accent, is someone; «tu» is «your»: read on the text as written.)
const NAMES_ROLE = /\b(?:jefe|despacho|politica|ivt|grabacion|redes|administracion|coordinacion|coordinador\w*|aprobador\w*|editor(?:es)? de la web|editores|auditoria|responsables?|operador\w*|cada quien|nadie|todos)\b/;
const YOU = /(?:^|[^\p{L}])tú(?![\p{L}])/iu;
const whoBonus = (p: Part) => (saysFacet('who', p.text) ? 0.4 : 0);
function who(u: Unit, ctx: ExplainContext): Candidate[] {
  const roles = ctx.roles;
  const parts = partsOf(u, roles);
  const part = ctx.about ? partAbout(u, ctx.about, roles, false, false, whoBonus, 0.6, true) : (parts.find((p) => p.own && saysFacet('who', p.text)) ?? null);
  if (part && saysFacet('who', part.text)) {
    // With the sentence after it when that one goes on with the same (a curated answer: «El jefe: … Cuando lo acepta…»).
    const k = parts.findIndex((p) => p.text === part.text);
    const after = u.kind === 'entry' && k >= 0 ? parts[k + 1] : undefined;
    const text = after && part.text.length + after.text.length < 260 ? `${end(ucFirst(part.text))} ${end(ucFirst(after.text))}` : end(ucFirst(part.text));
    return [{ text, entryId: u.id }];
  }
  // A task of the person's own guide, asked who does it (no X, or X is what the task does): it is theirs.
  if (u.kind === 'task' && roles.includes(u.role) && (!ctx.about || aboutTitle(u.task.title, ctx.about))) return [{ text: `Lo haces tú: ${lcFirst(end(u.task.title))} ${ucFirst(lcFirst(end(u.task.when)))}`.trim(), entryId: u.id }];
  return [];
}

// «¿Y yo qué hago ahí?» (WF-C2): the person's own part of the topic. A task of their own: its steps; a screen of their
// own: what they do there; a flow: the steps that are theirs; a curated answer: what it says they do («tú»).
function mine(u: Unit, ctx: ExplainContext, tours: Set<string>): Candidate[] {
  const roles = ctx.roles;
  if (u.kind === 'task') return roles.includes(u.role) ? stepsFacet(u, ctx, tours) : [];
  if (u.kind === 'screen') return roles.includes(u.role) && u.section.youDo.length ? [{ text: u.section.youDo.slice(0, 3).map((t) => end(ucFirst(t))).join(' '), entryId: u.id }] : [];
  if (u.kind === 'flow') {
    const own = u.flow.steps.filter((x) => x.roles.length < 5 && x.roles.some((r) => roles.includes(r)));
    return own.length ? [{ text: `Lo tuyo ahí: ${own.slice(0, 3).map((x) => end(ucFirst(x.text))).join(' ')}`, entryId: u.id }] : [];
  }
  if (u.kind === 'entry') {
    const yours = sentencesOf(textFor(u.entry.a, roles)).filter((t) => YOU.test(t));
    return yours.length ? [{ text: yours.slice(0, 2).map(end).join(' '), entryId: u.id }] : [];
  }
  if (u.kind === 'job') return [{ text: end(u.guide ? u.guide.job.mission : ADMIN_GUIDE.mission), entryId: u.id }];
  return [];
}

// A sentence that starts with what happens when («Cuando el jefe la aprueba: …», «Si…», «Al publicar…»).
const WHEN_FIRST = /^(?:cuando|si|al|apenas|en cuanto)\b/;
// What a moment of one's own work reads like («cuando lo acepta…», «antes de publicar», «el mismo día»).
const WHEN_SAYS = /\b(?:cuando|antes|despues|apenas|cada|mismo dia|en cuanto|hasta que|al (?:terminar|subir|grabar|aprobar|publicar|enviar|mandar|guardar|llegar|volver))\b/;
/**
 * Whether a text says what a follow-up asks (WF-C2): a reason to «¿y por qué X?», someone to «¿y quién…?», a moment to
 * «¿y cuándo…?» (an answer of the index written for that follow-up must say it to answer it).
 */
export function saysFacet(facet: Facet, text: string): boolean {
  const t = readable(text);
  // («El porqué» is no reason: «De eso no tengo el porqué».)
  if (facet === 'why') return REASON.test(t.replace(/\b(?:el|un|su|del) porque\b/g, ' '));
  // (Who does X is said by someone named, not by what happens when it is done: «Cuando el jefe la aprueba: …».)
  if (facet === 'who') return (NAMES_ROLE.test(t) || YOU.test(text)) && !WHEN_FIRST.test(t);
  if (facet === 'when') return WHEN_SAYS.test(t);
  return true;
}
// «¿Y si una categoría no tiene área?» asks what the guide says as «Sin área, …»: the same condition, said the other way.
const LACKS = /\bno (?:tiene|tienen|tengo|tienes|hay|trae|traen|lleva|llevan) (?:(?:un|una|el|la|los|las|ningun|ninguna) )?([a-z]{3,})/;
// The verbs any follow-up says («¿y si dice que no?», «¿qué sale?»): X is its other words.
const SAYS_ANYTHING = new Set(tokens('dice dicen decir pasa pasan sale salen hace hacen tiene tienen queda quedan puede pueden hago haga quiero quiere va van hay'));
const wordsOf = (about: string) => tokens(about).filter((w) => w.length >= 3 && !SAYS_ANYTHING.has(w) && !AUX.has(w)).map(family);
// One word family said several ways: «de vuelta», «vuelve», «volver», «devolver», «regresar», «desarchivar».
const BACK = /^(?:vuelt|vuelv|volv|devuelv|devolv|regres|desarchiv)/;
export const family = (w: string) => (BACK.test(w) ? 'volv' : w);
/** The words of a follow-up's X that say something of their own («¿y si se pasan?» has none: «pasan» says nothing). */
export const followWords = (about: string | undefined): string[] => (about ? wordsOf(about) : []);
// A sentence that says what happens then: a «si …», a «cuando …», or what follows a label («Con «No, todavía no»
// escribe…», «Sin área, …»).
const IF_OR_WITH = (s: string) => saysIf(s) || /^(?:con|sin) «/i.test(s.trim());
// «Si lo quiero de vuelta», «si necesito cambiarlo»: a wish said as «si» (how it is done, not what happens then).
const WISH = /^(?:(?:lo|la|los|las|le|me) )?(?:quiero|quisiera|necesito|ocupo|toca)\b/;
/**
 * The sentence of a text (an answer already said) about X that says what the follow-up asks («Si te equivocaste, agrega
 * otra nota…» to «¿y si me equivoco?», «Sin área, la asigna la coordinación» to «¿y si no tiene área?»), or null.
 */
export function sentenceSaying(facet: Facet, about: string | undefined, text: string): string | null {
  const want = about ? wordsOf(about) : [];
  if (!want.length) return null;
  const lacks = facet === 'whatif' && about ? LACKS.exec(readable(about))?.[1] : undefined;
  const wish = facet === 'whatif' && !!about && WISH.test(readable(about));
  for (const s of sentencesOf(text)) {
    if (lacks && new RegExp(String.raw`(?:^|[\s(«,:])sin ${lacks}\b`).test(readable(s))) return s;
    const have = tokens(s).map(family);
    const share = want.filter((w) => have.some((h) => rootsLike(h, w))).length / want.length;
    if (share >= 0.6 && (facet === 'whatif' ? IF_OR_WITH(s) || wish : saysFacet(facet, s))) return s;
  }
  return null;
}
/**
 * Whether a text gives the reason for X: a reason (never «La guía no da el porqué…»), with a fair share of X's words (or
 * no X). «¿Y por qué no veo las denuncias?» is not answered by the reason of another thing.
 */
export function reasonFor(text: string, about?: string): boolean {
  if (/^(?:La guía no da el porqué|De eso no tengo el porqué)/.test(text) || !saysFacet('why', text)) return false;
  const want = about ? wordsOf(about) : [];
  if (!want.length) return true;
  const have = tokens(text);
  return want.filter((w) => have.some((h) => rootsLike(h, w))).length / want.length >= 0.4;
}
/**
 * How much an answer is about a topic (WF-C2): the best share, over its ways of asking `asks`, of their words (four
 * letters or more) that are words of the topic (`subject`: the roots of what was said and asked about it).
 */
export function topicalOf(subject: string[], asks: string[]): number {
  let best = 0;
  for (const q of asks) {
    const its = tokens(q).filter((w) => w.length >= 4);
    if (!its.length) continue;
    const share = its.filter((w) => subject.some((h) => rootsLike(h, w))).length / its.length;
    if (share > best) best = share;
  }
  return best;
}
// The shape of a way of asking that is that follow-up itself («¿Y si la devuelvo?», «¿quién publica?», «¿por qué…?»).
const FOLLOW_SHAPE: Partial<Record<Facet, RegExp>> = { whatif: /\b(?:si|sin|cuando)\b/, who: /\bquien(?:es)?\b/, when: /\bcuando\b/, why: /\bpor que\b/ };
/**
 * How an answer fits a follow-up that names X (WF-C2), to choose between the answers of the index and the topic's own
 * part: `cov`, the share of X's words it says (in its text or in one of its ways of asking `asks`), `said` the same in its
 * text alone; `says`, whether it says what the follow-up asks of X: a sentence of it (sentenceSaying(); a reason about X
 * for «¿por qué…?», reasonFor()), or a way of asking that is that same follow-up about X («¿Y si la devuelvo?» to «¿y si
 * lo devuelven?»: `asked`).
 */
export function followFit(facet: Facet, about: string | undefined, text: string, asks: string[] = []): { cov: number; said: number; says: boolean; asked: boolean } {
  const want = about ? wordsOf(about) : [];
  const share = (t: string) => {
    if (!want.length) return 0;
    const have = tokens(t);
    return want.filter((w) => have.some((h) => rootsLike(h, w))).length / want.length;
  };
  const said = share(text);
  const cov = Math.max(said, ...asks.map(share));
  const shape = FOLLOW_SHAPE[facet];
  const asked = !!shape && asks.some((q) => shape.test(readable(q)) && share(q) >= 0.6);
  const says = facet === 'why' ? reasonFor(text, about) || asked : !!sentenceSaying(facet, about, text) || asked;
  return { cov, said, says, asked };
}

// «¿Y cuándo lo hago?»: the task's «Cuándo» (the person's own work; never an event's date).
function when(u: Unit, ctx: ExplainContext): Candidate[] {
  if (u.kind === 'task' && ctx.roles.includes(u.role)) return [{ text: `Lo haces ${lcFirst(end(u.task.when))}`, entryId: u.id }];
  return [];
}

// Without a reason in the data: the guide does not give it (or, for a curated answer of 360, 360 does not have it).
const noWhy = (u: Unit) => (u.kind === 'entry' ? 'De eso no tengo el porqué.' : 'La guía no da el porqué de eso.');

function why(u: Unit, ctx: ExplainContext): Candidate[] {
  const roles = ctx.roles;
  const out: Candidate[] = [];
  const w = facetText(u, 'why', roles);
  if (w) out.push({ text: w, entryId: u.id });
  // The reason the topic itself gives («… porque con ellos se aprueba todo…»), about X first when the ask names it.
  const r = reasonPart(u, roles, ctx.about);
  if (r) out.push({ text: reasonText(r.text), entryId: u.id });
  // Without a reason in the guide: what the guide says, and the guide.
  const go = guideHref(u, roles);
  const says = sentencesOf(guideText(u, roles)).find((s) => !wasSaid(s, ctx.said ?? [])) ?? null;
  if (says) out.push({ text: `${noWhy(u)} ${u.kind === 'entry' ? 'Lo que sé es esto' : 'Lo que dice es esto'}: ${lcFirst(end(says))}`, entryId: u.id, ...(go ? { goTo: go } : {}) });
  if (go) out.push({ text: `${noWhy(u)} Tu guía completa está en «Ayuda y guías»: toca el botón.`, entryId: u.id, goTo: go });
  return out;
}

function meaning(u: Unit | null, ctx: ExplainContext): Candidate[] {
  const roles = ctx.roles;
  const said = ctx.said ?? [];
  const out: Candidate[] = [];
  // The word of the answer before (or of the question before).
  const g = termIn(said.at(-1) ?? '') ?? termIn(ctx.earlier?.at(-1) ?? '');
  if (u?.kind === 'term') {
    const easy = termFacet(u.term, 'easy', roles);
    if (easy) out.push({ text: easy, entryId: u.id });
  }
  if (g) {
    out.push({ text: termLine(g, roles), entryId: `palabra:${g.id}` });
    const easy = termFacet(g, 'easy', roles);
    if (easy) out.push({ text: easy, entryId: `palabra:${g.id}` });
  }
  return out;
}

function more(u: Unit, ctx: ExplainContext): Candidate[] {
  const roles = ctx.roles;
  const said = ctx.said ?? [];
  const out: Candidate[] = [];
  const steps = stepsOf(u, roles);
  // Steps: the next page (from the cursor, else after what was said). None said as a list yet (the topic was told in
  // its own words, a curated answer): its steps, from the first.
  if (steps.length) {
    const from = ctx.cursor ?? saidUpTo(steps, said) + 1;
    if (from > 0 && from < steps.length) {
      const page = stepsPage(null, steps, from);
      out.push({ text: page.text, entryId: u.id, ...(page.next !== undefined ? { cursor: page.next } : {}) });
    } else if (from === 0 && !said.some((x) => RETELL.test(x))) {
      const title = u.kind === 'task' ? u.task.title : u.kind === 'flow' ? u.flow.title : u.kind === 'topic' ? u.topic.title : null;
      const page = stepsPage(title, steps, 0);
      if (!wasSaid(page.text, said)) out.push({ text: page.text, entryId: u.id, ...(page.next !== undefined ? { cursor: page.next } : {}) });
    }
  }
  // A screen: what is done there that was not said, then what cannot be done (a page, as the steps).
  if (u.kind === 'screen') {
    const items = [...u.section.youDo.map((x) => end(ucFirst(x))), ...(u.section.cannot ?? []).map((x) => `No puedes: ${lcFirst(end(x))}`)];
    const left = items.filter((x) => !wasSaid(x, said));
    const pick: string[] = [];
    for (const x of left) {
      if (pick.length && [...pick, x].join(' ').length > PAGE_LETTERS) break;
      pick.push(x);
      if (pick.length >= PAGE) break;
    }
    if (pick.length) out.push({ text: `En ${lcFirst(u.section.title.replace(/: /g, ', '))}, además: ${lcFirst(pick.join(' '))}`, entryId: u.id });
  }
  // A word: its example, then said simply.
  if (u.kind === 'term') {
    const ex = termFacet(u.term, 'example', roles);
    if (ex) out.push({ text: ex, entryId: u.id });
  }
  // A job: what else it does.
  if (u.kind === 'job' && u.guide) {
    const rest = u.guide.job.responsibilities.filter((x) => !wasSaid(x, said)).slice(0, 2);
    if (rest.length) out.push({ text: `También te toca: ${rest.map((x) => lcFirst(x.replace(/[.]$/, ''))).join('; ')}.`, entryId: u.id });
  }
  // A curated answer that was cut: its sentences after the cut.
  if (u.kind === 'entry') {
    const all = sentencesOf(textFor(u.entry.a, roles));
    const rest = all.filter((s) => !wasSaid(s, said));
    if (rest.length && rest.length < all.length) out.push({ text: rest.slice(0, 2).join(' '), entryId: u.id });
  }
  // The rest is in the guide.
  const go = guideHref(u, roles);
  if (go) out.push({ text: 'Lo demás está en tu guía, en «Ayuda y guías»: toca el botón y la abres ahí mismo.', entryId: u.id, goTo: go });
  return out;
}

// What X of a «lo de X» is, in the topic: the word of «Palabras de la app» it names, or the part of the topic that says it.
// X only a word's name («¿qué significa tanda?», «no entendí lo de roja»): the word first. X more than that («lo de la
// cajita del nivel», «lo de antes de aprobar»): the part of the topic that says it first, then the word.
function aboutCandidates(facet: Facet, u: Unit | null, about: string, ctx: ExplainContext, tours: Set<string>): Candidate[] {
  const roles = ctx.roles;
  // «¿Y después de avisar al jefe?», «¿y después qué hace Grabación?»: where the task or the flow goes on.
  if (facet === 'next') {
    if (u && (u.kind === 'task' || u.kind === 'flow')) return next(u, ctx);
    // (A screen or a curated answer: the task asked, by its title and its verb, as above.)
    const task = u && ctx.asked && HOW_ASKED.test(readable(ctx.asked)) && (u.kind === 'screen' || u.kind === 'entry') ? taskAsked(ctx.asked, roles) : null;
    return task?.kind === 'task' && allowed(task, roles) ? next(task, ctx) : [];
  }
  // «Paso a paso lo de…», «dime más de…»: the steps of the topic, the rest of it.
  if (facet === 'steps') return u ? stepsFacet(u, { ...ctx, about: undefined }, tours) : [];
  if (facet === 'more') return u ? more(u, { ...ctx, about: undefined }) : [];
  const named = termNamed(about);
  const g = named?.g ?? null;
  const define = facet === 'meaning' || facet === 'purpose';
  // «La diferencia entre A y B»: what the topic says of each, first (one sentence each: an answer says two).
  const both: Candidate[] = [];
  if (u && ctx.pair && facet !== 'example' && facet !== 'why') {
    const [a, b] = ctx.pair.map((x) => partAbout(u, x, roles, define));
    if (a && b && plain(a.text) !== plain(b.text)) both.push({ text: [a, b].map((p) => end(ucFirst(sentencesOf(p.text)[0] ?? p.text))).join(' '), entryId: u.id });
  }
  const part = u ? partAbout(u, about, roles, define) : null;
  const word: Candidate[] = [];
  if (g) {
    const id = `palabra:${g.id}`;
    const line = termLine(g, roles);
    const easy = termFacet(g, 'easy', roles);
    const ex = termFacet(g, 'example', roles);
    const w = termFacet(g, 'why', roles);
    if (facet === 'example') {
      if (ex) word.push({ text: ex, entryId: id });
    } else if (facet === 'why') {
      if (w) word.push({ text: w, entryId: id });
    } else if (facet === 'simpler') {
      if (easy) word.push({ text: easy, entryId: id });
      word.push({ text: line, entryId: id });
    } else {
      word.push({ text: line, entryId: id });
      if (easy) word.push({ text: easy, entryId: id });
    }
  }
  const fromPart: Candidate[] = [];
  if (part && u) {
    if (facet === 'example') {
      const ex = facetText(u, 'example', roles);
      // (What the topic says of X first, when the thread has not said it: the example shows it. Its first clause only,
      // «En «Tu nota para el editor», qué toma sirve, qué falló y qué falta», then «Por ejemplo: …».)
      const clause = end(ucFirst(part.text.split(/;\s/)[0]));
      if (ex && !wasSaid(part.text, ctx.said ?? []) && clause.length <= 160 && !plain(ex).includes(plain(clause))) fromPart.push({ text: `${clause} ${ex}`, entryId: u.id });
      if (ex) fromPart.push({ text: ex, entryId: u.id });
    } else if (facet === 'why') {
      const w = facetText(u, 'why', roles);
      if (w) fromPart.push({ text: w, entryId: u.id });
      const go = guideHref(u, roles);
      fromPart.push({ text: `${noWhy(u)} ${u.kind === 'entry' ? 'Lo que sé es esto' : 'Lo que dice es esto'}: ${lcFirst(end(part.text))}`, entryId: u.id, ...(go ? { goTo: go } : {}) });
    } else {
      const step = part.own && part.step !== undefined && u.kind === 'task' ? part.step : undefined;
      fromPart.push({ text: step !== undefined ? `Es el paso ${step + 1}: ${lcFirst(end(part.text))}` : end(ucFirst(part.text)), entryId: u.id, ...(step !== undefined ? { cursor: step + 1 } : {}) });
    }
  }
  // X more than a word's name and nothing of the topic says it («¿qué significa «Sin programar»?» after another topic):
  // not the word («Programar»); the answers of today take that question.
  if (named && !named.only && !part) return both;
  return [...both, ...(named?.only || !part ? [...word, ...fromPart] : [...fromPart, ...word])];
}

/**
 * That facet of the topic for this person (see the header), or null: no topic, a role with no 360, a thread about an
 * event, or nothing left that was not said. `topic`: the index entry that answered the turn before (an Entry, or its id
 * as stored with that answer: `flujo:<id>` stands for a whole flow).
 */
export function explainAnswer(facet: Facet, topic: Entry | string | null | undefined, ctx: ExplainContext): ExplainAnswer | null {
  const roles = ctx.roles;
  // The web's and Atención's roles get no 360 (D-90): nothing to explain to them here.
  if (!roles.some((r) => TEAM_ROLES.includes(r as TeamRole) || r === 'admin')) return null;
  // Never in a thread about an event: it keeps the agenda's steps (and its refusal). Unless the topic is what 360 just
  // said from the index (`topicSaid`): its question asked how the app works, not an event's data.
  if (!ctx.topicSaid && followsEventThread(ctx)) return null;
  const u = topic ? unitFor(topic, roles, ctx.asked) : null;
  // «¿Qué significa eso?» can work from the answer before alone; anything else needs a topic.
  if (!u && facet !== 'meaning') return null;
  if (u && !allowed(u, roles)) return null;
  const tours = toursOf(ctx);
  // A curated answer explained from its guide's unit (WF-C2): what happens if X, who and when are first what the answer
  // itself says (it is what 360 said; the unit may be a wider thing), and so is the reason it gives for X. When the unit
  // was only guessed from what the person asked (relatedByAsk), what was not understood and the reason too.
  const e0 = typeof topic === 'string' ? entryById(topic) : (topic ?? undefined);
  const own: Unit | null = e0 && u && u.kind !== 'entry' && e0.kind === 'curated' ? { kind: 'entry', id: e0.id, entry: e0 } : null;
  if (own && e0) {
    const guessed = !relatedOf(e0, roles);
    const first = facet === 'whatif' || facet === 'who' || facet === 'when' || facet === 'mine' || (facet === 'why' && !!ctx.about) || (guessed && (facet === 'simpler' || facet === 'why'));
    const mine = first ? answerOf(facet, own, ctx, tours) : null;
    // (The reason, only when the answer gives one: else the unit's own «¿por qué?».)
    if (mine && (facet !== 'why' || saysFacet('why', mine.text))) return mine;
  }
  return answerOf(facet, u, ctx, tours);
}

/** That facet of a unit (null for «¿qué significa eso?» of the answer before alone), as explainAnswer() says it. */
function answerOf(facet: Facet, u: Unit | null, ctx: ExplainContext, tours: Set<string>): ExplainAnswer | null {
  const roles = ctx.roles;
  const said = ctx.said ?? [];
  let list: Candidate[] | null = null;
  // The follow-ups of a thread (WF-C2): what happens if X, who does it, when (each from the topic itself).
  if (u && (facet === 'whatif' || facet === 'who' || facet === 'when')) list = facet === 'whatif' ? whatIf(u, ctx) : facet === 'who' ? who(u, ctx) : when(u, ctx);
  else if (facet === 'whatif' || facet === 'who' || facet === 'when' || (facet === 'mine' && !u)) list = [];
  else if (u && facet === 'mine') list = mine(u, ctx, tours);
  // «¿Y por qué X?»: the reason of the data, the topic's sentence that gives it, then what the topic says of X.
  else if (u && facet === 'why' && ctx.about) {
    const w = facetText(u, 'why', roles);
    const r = reasonPart(u, roles, ctx.about);
    list = [...(w ? [{ text: w, entryId: u.id }] : []), ...(r ? [{ text: reasonText(r.text), entryId: u.id }] : []), ...aboutCandidates(facet, u, ctx.about, ctx, tours), ...why(u, { ...ctx, about: undefined })];
  } else if (ctx.about) list = aboutCandidates(facet, u, ctx.about, ctx, tours);
  else if (facet === 'meaning') list = meaning(u, ctx);
  else if (u) {
    list =
      facet === 'simpler' ? simpler(u, ctx, tours)
      : facet === 'steps' ? stepsFacet(u, ctx, tours)
      : facet === 'example' ? example(u, ctx)
      : facet === 'next' ? next(u, ctx)
      : facet === 'purpose' ? purpose(u, ctx)
      : facet === 'why' ? why(u, ctx)
      : more(u, ctx);
  }
  // (The answer to «¿y si…?», «¿y quién…?», «¿y cuándo…?» or «¿por qué?» may say again a sentence of a longer answer
  // before: that is what was asked. Never a whole answer said before.)
  const answersAsked = facet === 'whatif' || facet === 'who' || facet === 'when' || facet === 'why' || facet === 'mine';
  const pick = (list ?? []).find((c) => c.text && (answersAsked ? !saidWhole(c.text, said) : !wasSaid(c.text, said)));
  if (!pick) return null;
  const text = clip(pick.text);
  const goTo = opens(pick.goTo, roles);
  const tutorial = pick.tutorial && tours.has(pick.tutorial) ? pick.tutorial : undefined;
  return { facet, text, entryId: pick.entryId, ...(goTo ? { goTo } : {}), ...(tutorial ? { tutorial } : {}), ...(pick.cursor !== undefined ? { cursor: pick.cursor } : {}) };
}

// A unit for this person: a role's guide only to that role (or the boss, who reads every guide, never asks about another
// role's task as his own: the topic came from his own answers), administración's screens only to administración, a flow
// only to the roles whose guide has it (as the index gives its steps).
function allowed(u: Unit, roles: Role[]): boolean {
  if (u.kind === 'task' || u.kind === 'job' || u.kind === 'screen') return roles.includes(u.role);
  // Administración is out of Mensajes (D-49), with any other role too: not its topic of «Para todos», not its flow.
  if (u.kind === 'flow') return (u.flow.id !== 'mensajes' || !roles.includes('admin')) && allGuides().some((g) => g.flows.includes(u.flow.id) && roles.includes(g.role));
  if (u.kind === 'topic') return u.topic.id !== 'mensajes' || !roles.includes('admin');
  if (u.kind === 'entry') return u.entry.roles === null || u.entry.roles.some((r) => roles.includes(r));
  return true;
}

/**
 * The sentences of a text, never cutting a «label» in two («Sin señal. Lo que escribas…» is one label), nor after a
 * label that ends in «?» or «.» inside a sentence («prendes «¿Va a la agenda del jefe?» y tocas…»): a sentence starts
 * with no lower-case letter.
 */
export function sentencesOf(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '«') depth++;
    else if (c === '»') depth = Math.max(0, depth - 1);
    const next = /^\s+(\S)/.exec(text.slice(i + 1, i + 6))?.[1];
    const ends = depth === 0 && (/[.!?…]/.test(c) || (c === '»' && /[.!?…]/.test(text[i - 1] ?? ''))) && (i + 1 === text.length || (next !== undefined && !/\p{Ll}/u.test(next)));
    if (ends) {
      // A sentence ends here (and the quote that closes right after it, «… se envía cuando vuelva.»).
      const piece = text.slice(start, i + 1).trim();
      if (piece) out.push(piece);
      start = i + 1;
    }
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

// Up to about 460 letters, by whole sentences (as local.ts says an answer), never cutting «¿Sigo?» from its steps.
function clip(t: string): string {
  if (t.length <= 480) return t;
  let out = '';
  for (const x of sentencesOf(t)) {
    if (`${out} ${x}`.trim().length > 460) break;
    out = `${out} ${x}`.trim();
  }
  return out || `${t.slice(0, 457).replace(/\s+\S*$/, '')}…`;
}

// For the tests: the guide unit an entry is explained from (a curated answer's related unit), by id.
export function explainUnitId(topic: Entry | string, roles: Role[]): string | null {
  return unitFor(topic, roles)?.id ?? null;
}
