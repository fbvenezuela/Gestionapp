import 'server-only';
import { AGENDA_FALLBACK, aboutEvents, asksAboutPublishing, asksPlace, asksRoute, asksSchedule, asksWhenWhere, eventAt, keyWords, pickFichas, stem, withoutWhenWhere, type BrainOutput, type ChosenScript, type TurnContext } from './brain';
import { hasDateOrTime } from './redact';
import { canOpen, screenFor, screensIn } from './screens';
import { contract, fillHuecos, plain, sentences, HUECO } from './text';
import { runTool, type Tool, type ToolCtx, type ToolRun } from './tools';

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
  [/\b(twitter|tweet|tuit)\b/, 'x'],
  [/\b(youtube|yt)\b/, 'youtube'],
];

const ROLE_WORDS: [RegExp, string][] = [
  [/\b(todos|todo el equipo|todo el mundo)\b/, 'todos'],
  [/\b(redes|social)\b/, 'social'],
  [/\b(supervision|supervisores?)\b/, 'supervisor'],
  [/\b(despacho)\b/, 'dispatch'],
  [/\b(grabacion|camarografos?|camaras?)\b/, 'camera'],
  [/\b(secretaria|secretarias)\b/, 'secretary'],
  [/\b(administracion|admin)\b/, 'admin'],
  [/\b(jefe)\b/, 'boss'],
];

// What's pending for me.
const PENDING = /\b(pendiente|pendientes|que tengo|que me toca|por hacer|que hay que hacer|que hay para hoy|que hay hoy|que tenemos (?:para )?hoy|atrasad\w*|incomplet\w*|propuestas?|aceptaron|rechazaron)\b/;
// A work product: «¿cuándo aprueban la pieza del puente?» asks about the piece, not the event.
const WORK = /\b(piezas?|videos?|material|materiales|copy|copies|storyboard|fotos?|tomas|reels?|publica\w*|tweets?|tuits?|tanda)\b/;
// Things of the platform: a when or a where about them is a how-to, not the agenda.
const PLATFORM = new RegExp(
  String.raw`${WORK.source}|\b(avisos?|campana|contrasena|clave|codigo|ajustes|pantalla|pestana|boton|menu|panel|biblioteca|resultados|metricas|perfil|formulas?|semaforo|plazos?|version|archivos?|enlace|link|plantilla|dron|vertical|horizontal|formato|microfono|app|aplicacion|asistente|buscador)\b`,
);
// The person's own things or a call for help: «¿cómo cambio mi número de teléfono?», «¿a quién
// llamo si tengo un problema?», «¿cuál es el teléfono de soporte?» are not the agenda. Only those
// phrases: «¿qué hay el domingo? Quiero hacer mi plan» or «… necesito ayuda» still is.
const SELF = /\bmis? (?:numero|telefono|celular|correo|cuenta|clave|contrasena|perfil|acceso|usuario|codigo|pendientes|tareas)\b|\b(?:telefono|numero|correo) de (?:soporte|administracion)\b|\bsoporte\b|\bsi (?:tengo|hay|me sale) (?:un |algun )?(?:problemas?|error|falla)\b|\bque hay que hacer\b/;
// On the way there, a goal («llegar a más gente», «a la meta», «a tiempo») is not a place.
const GOAL = /\b(?:gente|personas|seguidores|publico|audiencia|alcance|metas?|vistas|likes|comunidad|usuarios|tiempo|temprano)\b/;
// «Lo de la cancha»: an event by another name (whoever can't see it gets no title match).
const LO_DE = /\blo del?\b/;
// A deadline for the team in a notice: what the team does, then «antes de / hasta / para / a más
// tardar las [hora]» in the same clause («suban el material de la feria antes de las [hora]»). The
// event's own hour is not one: nothing for the team before it («la feria es el martes hasta las…»,
// «está pautada para las…»), or the event's verb in between («suban todo, la feria es hasta las…»).
// Matched on the notice folded (lower case, no accents), «[hora]» kept.
// The team's verb as said to the team («suban», «revisan»), or «hay / tienen que» + its infinitive:
// a bare infinitive can be the event's («la feria va a terminar antes de las…»).
const TEAM_DOES = String.raw`(?:suban|suben|manden|mandan|envien|envian|revisen|revisan|carguen|cargan|aprueben|aprueban|publiquen|publican)(?:lo|la|los|las)?|entreguen|terminen|editen|corrijan|completen|tengan|(?:hay|tienen|tenemos|deben|debemos) (?:que )?(?:subir|mandar|enviar|revisar|cargar|aprobar|publicar|entregar|terminar|editar|corregir|completar|tener)`;
const EVENT_VERB = 'es|son|sera|seria|empiezan?|comienzan?|arrancan?|terminan?|dura|abre|cierra|sale|queda|quedo|pautad[ao]s?|movio|cambio|va|van';
const DEADLINE = new RegExp(String.raw`(?=antes de|hasta|para|a mas tardar)(?<=\b(?:${TEAM_DOES})\b(?:(?!\b(?:${EVENT_VERB})\b)[^.;!?])*)\b(?:antes de|hasta|para|a mas tardar(?: a)?)\s+las?\s+\[hora\]`, 'g');
const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
// A day or a «within» next to the event («la feria es el martes», «la feria de mañana», «quedó para
// el sábado», «es en 2 h») is when it is; next to the team's work («hoy suben el material…», «suban
// hoy…») it is not.
const DAY = /\b(?:hoy|pasado manana|manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo|esta (?:noche|tarde)|fin de semana|(?:en|dentro de) (?:\d{1,3}|una|dos|tres|media) (?:h|hs|hrs?|horas?|minutos?))\b/g;
const EVENT_VERB_WORD = new RegExp(String.raw`\b(?:${EVENT_VERB})\b`);
function eventDay(text: string): boolean {
  const t = plain(text);
  return [...t.matchAll(DAY)].some((m) => {
    const before = t.slice(0, m.index).split(' ').filter(Boolean).slice(-3).join(' ');
    return EVENT_VERB_WORD.test(before) || eventAt(before) >= 0;
  });
}
// «¿Con quién hablo?» alone, maybe with a greeting or a «perdón»: it asks for the assistant's name.
const NAME_ONLY = /^(?:(?:hola|buenas|buenos dias|buenas tardes|buenas noches|epa|disculpa|disculpe|perdon|perdone|oye|oiga) )*con quien hablo(?: yo)?(?: (?:perdon|disculpa|disculpe|por favor))?$/;

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
  const q = plain(i.question);
  const typed = i.typed ?? i.question;
  const calls: ToolRun[] = [];
  const fill = (t: string) => fillHuecos(t, i.ctx.huecos);
  const offered = (name: string) => i.tools.some((t) => t.name === name);
  const said = new Set(i.ctx.history.filter((h) => h.who === 'asistente').map((h) => plain(h.body)));
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
  const done = (text: string): BrainOutput => ({ text: contract(text), model: 'local', provider: null, tokensIn: 0, tokensOut: 0, calls });
  // "¿Cómo propongo un evento?" / "¿Quién aprueba una pieza en rojo?" are how-tos (fichas), not lookups.
  const howTo = /\b(quien|quienes|como (se|hago|subo|creo|apruebo|mando|pongo|cambio|escribo|propongo|cargo|asigno|marco|invito|publico|registro|corrijo|agrego|quito|instalo|entro|activo|uso|armo)|que (color|nivel|formula|lleva|hago)|donde|por que|porque|para que|puedo)\b/.test(q);
  const network = () => NETWORK_WORDS.find(([re]) => re.test(q))?.[1];
  // «¿A qué hora publico el video del acto en TikTok?» is about publishing, not the agenda.
  const publishing = asksAboutPublishing(i.question);
  const wantsHours = publishing && /\b(hora|horas|horario|cuando|dia|dias|mejor|mejores)\b/.test(q);
  // «¿Dónde está la agenda?» asks for the screen, not for an event's place.
  const agendaScreen = /\b(donde (esta|veo|encuentro|queda|abro|reviso)|como (entro|llego|abro|veo|encuentro|reviso)( a)?|ir a|abre|abreme) (la |mi |tu )?agenda\b/.test(q);
  const noticeToGroup = /\b(manda|mandale|mandales|envia|enviale|enviales|prepara|preparale)\b.*\baviso\b|\bavisale(s)? a (redes|supervision|despacho|grabacion|secretaria|todos|administracion)\b/.test(q);

  // 1. A person, please: notice for real, then say so.
  if (/\b(hablar con (alguien|una persona|un humano|administracion|el equipo|alguien del equipo)|quiero (una persona|un humano|hablar con)|pasame con|necesito (a alguien|una persona|ayuda de alguien|hablar con)|que me (llame|escriba) alguien|llamar a alguien)\b/.test(q)) {
    if (offered('avisar_al_equipo')) {
      const r = await call('avisar_al_equipo', { motivo: 'Pidió hablar con alguien del equipo.' });
      if (r.ok) return done(pick(variants('hablar-persona')));
    }
    return done('Ahora no consigo avisar al equipo por aquí. Escríbele directo a administración, por favor.');
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

  // 2b. Where the Agenda screen is (navigation, not an event's place).
  if (agendaScreen) {
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
  const whenWhere = asksWhenWhere(i.question) && !publishing;
  // The way there («¿cómo hago para llegar a…?») is asked like a where, but only an event makes it the agenda.
  const route = asksRoute(i.question) && !publishing;
  const ownWork = !howTo && PENDING.test(q) && !asksSchedule(i.question) && !route;
  const asking = (whenWhere || route) && !noticeToGroup && !ownWork;
  const rest = withoutWhenWhere(typed);
  const lookup = asking && rest && offered('buscar_evento') ? await runTool('buscar_evento', { texto: rest }, i.tools, i.toolCtx) : null;
  const evs = lookup?.ok ? (((lookup.result as R | undefined)?.eventos as R[] | undefined) ?? []) : [];
  const eventFrom = eventAt(i.question);
  // On the way there, «lo de la cancha» names an event too (whoever can't see it gets no title match).
  const named = eventFrom >= 0 || evs.length > 0 || (route && LO_DE.test(q));
  const workFrom = WORK.exec(q)?.index ?? -1;
  const aboutWork = workFrom >= 0 && (eventFrom < 0 || workFrom < eventFrom);
  // The refusal first, then what can be said, and the open question (if any) at the end.
  const refuse = (extra = '') => {
    const parts = sentences(pick(variants('agenda-privada')) || AGENDA_FALLBACK);
    const question = parts.at(-1)?.endsWith('?') ? parts.pop()! : '';
    return done([...parts, extra, question].filter(Boolean).join(' '));
  };
  if (asking && named && (!aboutWork || asksPlace(i.question))) {
    if (lookup) calls.push(lookup);
    return refuse(evs.length === 1 ? `Del evento «${evs[0].titulo}» te puedo decir que su trabajo está en «${evs[0].trabajo}».` : '');
  }

  // 3. Mark my notices as read (level «hace», recorded and undoable).
  if (/\b(marca|marcar|marcame|marques|limpia|limpiar|limpiame|borra|borrar)\b.*\bavisos?\b|\bavisos? (como )?leidos?\b/.test(q) && offered('marcar_avisos_leidos')) {
    const r = await call('marcar_avisos_leidos');
    if (!r.ok) return done(`No pude marcarlos: ${r.error}`);
    const n = Number((r.result as R).marcados ?? 0);
    return done(n ? `Listo, marqué ${count(n, 'aviso', 'avisos')} como leídos. Si fue un error, administración lo puede deshacer.` : 'No tenías avisos sin leer. Todo al día.');
  }

  // 4. A notice to a whole group: only PREPARED, administration confirms.
  if (noticeToGroup) {
    if (!offered('preparar_aviso')) return done('Los avisos a un grupo los preparan administración o supervisión. Si quieres, le pido a administración que lo haga.');
    const rol = ROLE_WORDS.find(([re]) => re.test(q))?.[1];
    if (!rol) return done('¿A quién va el aviso? Puede ser un rol (Redes, Supervisión, Despacho, Grabación, Secretaría) o todo el equipo.');
    const m = /\bque\s+(.+)$/i.exec(i.question);
    const texto = (m?.[1] ?? i.question).trim();
    // About an event, it can't say when, where or whom to call (it arrives redacted: «[hora]»), nor
    // the event's day. A deadline for the team («suban el material antes de las 3 pm», «revisen…
    // hasta las 5») is not the agenda: it goes, redacted. The event's own hour does not.
    const untimed = fold(texto).replace(DEADLINE, ' ');
    if (aboutEvents(texto) && (/\[(fecha|hora|numero|correo)\]|\b(en|es) (la |el )?\[direccion\]/.test(untimed) || asksPlace(texto) || eventDay(untimed))) {
      return done('Un aviso no puede llevar la fecha, la hora, el lugar ni los contactos de un evento: eso solo se ve en la Agenda. Dímelo sin eso y lo preparo.');
    }
    const r = await call('preparar_aviso', { rol, texto });
    if (!r.ok) return done(`No pude prepararlo: ${r.error}`);
    const res = r.result as R;
    return done(`Te dejé el aviso preparado para ${res.para} (${count(Number(res.personas ?? 0), 'persona', 'personas')}). No sale hasta que administración lo confirme en Ajustes → Asistente.`);
  }

  // 5. Name / 6. bot.
  // «¿Cómo se llama la pantalla…?» is not about the assistant: only «cómo se llama» + el asistente/usted.
  // «¿Con quién hablo?» alone asks for its name; «¿con quién hablo en la entrega…?» is a contact (step 2).
  if (/\b(como te llamas|como se llama (el asistente|la asistente|este asistente|usted|el bot)|como te (puedo |debo )?(llamo|llamar|digo|decir)|que nombre tienes|cual es tu nombre|tu nombre|quien eres|quien sos|quien es usted|como te dicen|tienes nombre|presentate)\b/.test(q) || NAME_ONLY.test(q)) {
    const opts = variants('quien-eres').filter((v) => v.includes(i.ctx.profile.name));
    return done(pick(opts.length ? opts : BUILTIN['quien-eres'].map(fill)));
  }
  if (/\beres (un |una )?(bot|robot|ia|maquina|inteligencia artificial|humano|humana|persona|real)\b/.test(q)) return done(pick(variants('eres-bot')));

  // 7. What's pending for me.
  if (!howTo && PENDING.test(q)) {
    const r = await call('mis_pendientes');
    if (!r.ok) return done(`No pude revisar tus pendientes: ${r.error}`);
    const res = r.result as { total: number; pendientes: { que: string; titulo: string }[]; avisos_sin_leer: number };
    const unread = res.avisos_sin_leer ? ` Además tienes ${count(res.avisos_sin_leer, 'aviso', 'avisos')} sin leer.` : '';
    // The person's own home screen, by its label in the menu (the boss's is «Inicio», not «Hoy»).
    const home = (r.goTo && screenFor(r.goTo)?.label) || 'Hoy';
    if (!res.total && /\b(propuestas?|aceptaron|rechazaron)\b/.test(q)) {
      return done(`No tienes propuestas esperando. Cuando propongas un evento, en ${home} ves si ${i.ctx.huecos.boss} lo aceptó o lo rechazó.${unread}`);
    }
    if (!res.total) return done(`No tienes nada pendiente ahora mismo. ¡Bien ahí!${unread}`);
    const top = res.pendientes.slice(0, 3).map((p) => `${p.que.toLowerCase()}: «${p.titulo}»`);
    return done(`Tienes ${count(res.total, 'pendiente', 'pendientes')}. Lo primero: ${list(top)}.${unread} Todo eso está en ${home}.`);
  }

  // 8. How a piece is going (only for whoever is offered the tool; the database decides the rest).
  const aboutPiece = !howTo && (/\b(pieza|piezas)\b/.test(q) || (/\b(como va|en que va|estado de|ya (la )?aprobaron|esta aprobad\w*)\b/.test(q) && !aboutEvents(i.question)));
  if (aboutPiece) {
    if (!offered('estado_pieza')) return done('Las piezas no las veo desde tu rol. Si necesitas algo de una, pregúntale a Redes.');
    const quoted = /[«"“]([^»"”]+)[»"”]/.exec(typed)?.[1];
    const after = /\bpieza\s+(?:de(?:l)?\s+|sobre\s+)?(.+)$/i.exec(typed)?.[1];
    const r = await call('estado_pieza', { titulo: (quoted ?? after ?? typed).replace(/[¿?¡!]/g, '').trim() });
    if (!r.ok) return done(`No pude buscarla: ${r.error}`);
    if ((r.result as R).falta) return done('¿Cuál pieza? Dime una palabra del título y te digo cómo va.');
    const ps = ((r.result as R).piezas as R[]) ?? [];
    if (!ps.length) return done('No encontré ninguna pieza con ese nombre. ¿Me das otra palabra del título?');
    if (ps.length > 1) return done(`Encontré varias: ${list(ps.slice(0, 4).map((p) => `«${p.titulo}»`))}. ¿Cuál de ellas?`);
    const p = ps[0];
    const pub = Number(p.publicada_en_redes ?? 0);
    return done(`La pieza «${p.titulo}» está ${String(p.estado).toLowerCase()} (semáforo ${p.semaforo}, versión ${p.version}).${pub ? ` Ya salió en ${count(pub, 'red', 'redes')}.` : ''}`);
  }

  // 9. Days of tweets.
  if (/\b(tweets?|tuits?)\b/.test(q) && !/\b(aprobar|apruebo|como subo|subir|cargar)\b/.test(q)) {
    if (!offered('dias_de_tweets')) return done('Los tweets no los veo desde tu rol.');
    const r = await call('dias_de_tweets');
    if (!r.ok) return done(`No pude revisarlo: ${r.error}`);
    const t = r.result as { dias: number; programados: number; quedan_pocos: boolean; por_aprobar: number };
    const base = t.dias ? `Quedan ${count(t.dias, 'día', 'días')} de tweets programados (${count(t.programados, 'tweet', 'tweets')}).` : 'No quedan tweets programados.';
    return done(`${base}${t.quedan_pocos ? ' Toca subir la tanda de la semana.' : ''}${t.por_aprobar ? ` Hay ${count(t.por_aprobar, 'tweet', 'tweets')} esperando aprobación.` : ''}`);
  }

  // (10. Best hours: step 2a, above.)

  // 11. Video rules.
  if (/\b(cuanto (puede )?dur\w*|duracion|medidas|reglas de video|peso maximo|cuanto pesa|resolucion|formato del video)\b/.test(q)) {
    const r = await call('reglas_de_video', network() ? { red: network() } : {});
    if (!r.ok) return done(`No pude revisarlo: ${r.error}`);
    const nets = ((r.result as R).redes as R[]) ?? [];
    if (!network()) return done(`¿Para qué red? Cada una tiene sus medidas: ${list(nets.map((n) => String(n.red)))}.`);
    const n = nets[0];
    if (!n) return done('No hay reglas guardadas para esa red.');
    const parts = ((n.formatos as R[]) ?? []).map((f) =>
      [`${f.formato}`, f.duracion_segundos ? `de ${f.duracion_segundos} segundos` : '', f.proporcion ? `en ${f.proporcion}` : '', f.peso_maximo_mb ? `hasta ${f.peso_maximo_mb} MB` : ''].filter(Boolean).join(' '),
    );
    return done(`En ${n.red}: ${list(parts)}. El copy, hasta ${n.copy_hasta_caracteres} caracteres. Al publicar, la plataforma lo revisa sola.`);
  }

  // 12. How an event is going (never its date, time or place).
  if (!howTo && aboutEvents(i.question) && offered('buscar_evento')) {
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
  if (/^(hola|buenas|buenos dias|buenas tardes|buenas noches|epa|que tal|saludos|hey)\b/.test(q) && q.length < 40) return done(pick(variants('saludo')));
  if (/\b(gracias|chao|nos vemos|hasta luego)\b/.test(q) && q.length < 40) return done(pick(variants('gracias')));
  if (/\b(chiste|politica|opinas|elecciones|partido|tarea|deberes|poema)\b/.test(q)) return done(pick(variants('fuera-de-tema')));

  // 14b. Asked as a schedule («¿a qué hora sale Kevin?», «¿qué hay el domingo?») or the way somewhere
  // that is not a goal («¿cómo hago para llegar a la plaza central?»), and nothing above knew the
  // subject (an event this person can't see): the agenda answer, never a loose ficha (a list of
  // categories, deadlines) next to it. Unless it names a screen, a thing of the platform («¿dónde
  // queda el copy?»), the person's own things or a call for help (SELF, but not «lo de…»), or a
  // ficha's topic by its title or tags.
  const self = SELF.test(q) && !LO_DE.test(q);
  const way = route && !GOAL.test(q);
  const topic = whenWhere ? withoutWhenWhere(i.question) : i.question;
  const subject = way ? withoutWhenWhere(i.question) : topic;
  if (((whenWhere && asksSchedule(i.question)) || way) && !self && !screensIn(q).length && !PLATFORM.test(q) && !namesTopic(i.ctx.knowledge ?? [], subject)) return refuse();

  // 15. A ficha that answers it (how something is done, per role). Chosen by what is asked, not by
  // its when or where words; and in a when/where turn, never one with hours or dates (the best
  // hours, the tweet slots): next to that question they read as the event's.
  const pool = whenWhere ? i.ctx.knowledge?.filter((f) => !hasDateOrTime(fill(f.body))) : i.ctx.knowledge;
  const ficha = pool ? pickFichas(pool, topic, i.ctx.roles, 1, false)[0] : undefined;
  if (ficha) {
    // The sentence that best answers the question, and the one after it.
    const ss = sentences(fill(ficha.body));
    const stems = plain(topic).split(' ').filter((w) => w.length >= 4).map(stem);
    const negated = /\b(no|nunca|sin)\b/.test(q);
    const score = (t: string) => stems.filter((st) => ` ${plain(t)}`.includes(` ${st}`)).length + (negated && /\b(no|nunca|sin)\b/.test(plain(t)) ? 1 : 0);
    let best = 0;
    ss.forEach((t, k) => {
      if (score(t) > score(ss[best])) best = k;
    });
    const body = ss.slice(best, best + 2).join(' ');
    return done(body.length > 420 ? `${body.slice(0, 417).replace(/\s+\S*$/, '')}…` : body);
  }

  // 16. The best chosen script with a variant that needs no data.
  for (const s of i.ctx.scripts.filter((x) => !x.always)) {
    const opts = variantsOf(s.script).map(fill).filter((v) => !HUECO.test(v));
    if (opts.length) return done(pick(opts));
  }

  return done('Eso no lo tengo claro todavía. ¿Quieres que le avise a administración para que te ayuden?');
}
