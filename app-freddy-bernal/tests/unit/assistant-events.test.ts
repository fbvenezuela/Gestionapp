// «Lo que habla de un evento lo contesta 360 sin IA» (round 4, R1): one detector (events.ts) says
// whether a text is about an event, and every place that asks uses it: which brain answers, how much
// of a question is masked, the answer net, notices, fichas and scripts, escalations. A table of what it
// sees (every phrasing of the round-4 review and the ordinary how-tos), and the routing with a model
// chain: a question about an event never reaches the provider, a how-to does.
// Demo database (PGlite, invented data) and a fake provider (no network).
import { describe, it, expect, vi } from 'vitest';
import type { Session } from '@/lib/auth/session';
import { withSystem } from '@/lib/db';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import type { Role } from '@/lib/roles';
import { handleTurn } from '@/lib/assistant';
import { brand } from '@/lib/client-config';
import { aboutEvent, eventSignals, eventThread } from '@/lib/assistant/events';
import { breaksAgendaRule, guardQuestion } from '@/lib/assistant/brain';
import { parseChain } from '@/lib/assistant/providers';
import { redact } from '@/lib/assistant/redact';
import { Placeholders } from '@/lib/assistant/titles';

function sessionOf(key: DemoUserKey): Session {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  return { userId: u.id, email: u.email, name: u.name, roles: [...u.roles] as Role[], aal: 'aal2', mfaRequired: false, mfaOk: true, claims: { sub: u.id, aal: 'aal2', role: 'authenticated' }, viewAs: null };
}
const CHAIN = parseChain('groq:llama-3.3-70b');
process.env.GROQ_API_KEY = 'gsk_FAKE_test_key_0000';
const ADMIN_ID = DEMO_USERS.find((u) => u.key === 'admin')!.id;
// The boss by his name, from the client's settings (nothing of him in the code).
const BOSS_FIRST = brand.clientName.split(' ')[0];

// What an admin of the demo can see, plus two titles the review used.
const TITLES = {
  events: [
    'Entrega de la cancha techada de El Mirador',
    'Recorrido por la rehabilitación del puente La Quebrada',
    'Jornada de salud en la escuela Los Andes',
    'Reunión con productores de café de la zona alta',
    'Entrega de viviendas en el urbanismo Nuevo Amanecer',
    'Feria de emprendedores en la plaza central',
    'Toma aérea Tariba',
    'Feria de Pirineos',
  ],
  pieces: [],
  places: ['Cancha comunal El Mirador', 'Puente La Quebrada', 'Escuela Los Andes', 'Casa comunal Alto Verde', 'Urbanismo Nuevo Amanecer', 'Plaza central'],
};

const ABOUT_AN_EVENT = [
  // Round 4, S1: notices that told an event's day, hour or place in ways no rule saw.
  'la feria es el finde',
  'el acto arranca en 2 horas',
  'el acto arranca en 48 horas',
  'la feria arranca en la mañanita',
  'la feria es por la tardecita',
  'la feria es después del almuerzo',
  'la feria es el veinticuatro',
  'la feria es el treinta y uno',
  'la feria es el primero',
  'la feria es en un par de días',
  'la feria es en noviembre',
  'la feria es el mes que viene',
  'la feria es a fin de mes',
  'el recorrido arranca en el puente La Quebrada',
  'la entrega es en el hotel Tamá',
  'la entrega es en el club Demócrata',
  'la entrega es en el galpón de Los Pinos',
  'la caravana pasa por El Mirador',
  'tengan las cámaras listas antes de las 7 am para la caravana',
  'el contacto de la feria es cero cuatro uno cuatro, cinco cinco cinco',
  // S2: questions that reached the provider as typed.
  'la feria es el finde en el hotel Tamá, ¿qué falta?',
  '¿cómo grabo el recorrido que sale en la mañanita del puente La Quebrada?',
  'la entrega de viviendas es en un par de días, ¿ya está el storyboard?',
  'el acto arranca en 2 horas, ¿qué hago?',
  '¿cómo grabo la feria del finde en el hotel Tamá?',
  '¿qué llevo a la feria de pasado mañana en el club Demócrata?',
  '¿cómo va lo de Pirineos el treinta y uno?',
  // S3: team fichas (title and body) that named their event without an event word.
  'Toma aérea. Salimos el sábado a las 6 desde la plaza. Lleven el dron.',
  'Lo del sábado. Llevar toldo, arranca a las 8.',
  'Pirineos. Arranca el finde. Llevar toldo.',
  'Caravana. La caravana sale en un par de días.',
  // S5: placeholders, also invented ones.
  'Pregunta por [[E7]] y por [[L2]].',
  // A title or a place by a name in it, or two of its words; the boss or who records; when, where,
  // how to get there, whom to call; a day or an hour with something happening or a place.
  '¿Cómo va lo de Tariba?',
  '¿qué tal quedó la toma aérea?',
  '¿cómo va lo de La Quebrada?',
  '¿a qué hora graba Kevin?',
  'Kevin graba donde siempre',
  '¿Qué me toca grabar el viernes?',
  'el jefe anda por Táriba',
  '¿dónde queda?',
  '¿cómo llego?',
  '¿con quién hablo allá?',
  '¿qué hay el domingo?',
  'salimos pasado mañana temprano desde Pueblo Nuevo, ¿qué llevo?',
  'salgo mañana a las 6 para el pueblo',
  'nos vemos el sábado en la oficina',
  '¿qué tomas hago frente a la alcaldía de Táriba?',
  'revisa mis cosas a las [hora]',
  '¿qué eventos hay mañana?',
  '¿Cómo va el evento de la escuela?',
  '¿cómo hago el storyboard de la entrega?',
  '¿cómo propongo un evento?',
  // In a question, a day or an hour that is not the person's own work nor about publishing.
  '¿qué llevo el sábado?',
  '¿Qué tengo pendiente hoy?',
  // Round 4b. A place by the run of its capitalised words, each one ordinary («Casa comunal Alto Verde»).
  '¿y Alto Verde?',
  '¿cómo va lo de Alto Verde?',
  'lo de Alto Verde quedó para noviembre, ¿qué le falta a la ficha?',
  '¿qué llevo pa Alto Verde el finde?',
  'mañanita salimos pa Alto Verde, ¿llevo el dron?',
  'Quiere que revisen la pieza de Alto Verde antes de que salga',
  // «Lo de…», shorthand, typos, how long until it, whether it still holds, the boss by his name.
  '¿cómo va lo de la cancha?',
  '¿qué llevo pa lo del puente?',
  '¿se suspendió lo de la plaza?',
  '¿kndo es lo d la cancha?',
  '¿onde es lo del puente?',
  '¿cuántos días faltan para lo del puente?',
  '¿como va la feira?',
  '¿el evnto de la cancha?',
  `¿el señor ${BOSS_FIRST} va a ir?`,
  '¿la caravana sigue en pie?',
  // Team fichas and scripts of round 4b: the time said without naming it, an event that happens or that there is.
  'Llevar chalecos; el acto de entrega arranca en la mañanita.',
  'En noviembre hay feria; lleven toldo y chalecos.',
  'El finde salimos tempranito para Alto Verde.',
  'El finde es lo de la cancha, lleva el dron y los chalecos.',
  'Con los de la zona alta arrancamos de madrugada.',
  'Nos vamos de madrugada desde la gobernación.',
  'En el hotel Tamá hay buena luz a las 5.',
  // Round 5, S1: one distinctive word of a visible title names its event, also as the subject of
  // something happening; the when that no time word knows («semana santa», «ahorita») goes with it.
  'la cancha es en semana santa, ¿qué llevo?',
  'la cancha arranca ahorita, ¿qué plano hago primero?',
  '¿cuándo grabo la cancha?',
  '¿cuándo grabo en la escuela?',
  '¿la cancha está lejos?',
  'cuanto falta pa la cancha',
  'a k ora es la cancha',
  'las viviendas son el día de la madre, ¿qué copy les hago?',
  'el puente quedó para después de carnaval, ¿qué le falta a la ficha?',
  // …and so does a piece named by its event («la pieza de la cancha»): 360 looks the piece up.
  '¿cómo va la pieza de la cancha?',
  // S4: «a» + a Name that is no one of the team is a place.
  '¿qué llevo a Táriba?',
  // Round 6, V1: a distinctive word made smaller or bigger («la canchita», «el puentecito»).
  'la canchita es en semana santa, ¿qué llevo?',
  'la canchita arranca ahorita, ¿qué plano hago primero?',
  'el puentecito quedó para después de carnaval, ¿qué le falta a la ficha?',
  'la escuelita es el día de la madre, ¿qué copy hago?',
  'las viviendita son al rato',
  'la canchota es después de carnaval',
  // V2: a when or a where about something that is also on the agenda (a sesión, a campaña, a registro, a
  // panel), with a verb of something happening, or next to a question about the platform.
  '¿A qué hora es la sesión?',
  '¿Dónde es la sesión de fotos?',
  '¿A qué hora voy a la sesión?',
  '¿Cuándo es la campaña?',
  '¿Dónde es el registro?',
  'donde es el panel',
  '¿A qué hora es la sesión del concejo?',
  '¿Dónde es la sesión solemne?',
  '¿Dónde es la presentación del registro?',
  '¿A qué hora sale Kevin con copies?',
  '¿A qué hora es la pieza?',
  '¿Dónde está la biblioteca? ¿Y a qué hora llega la comitiva?',
  '¿Dónde queda la plantilla? y la comitiva ¿a qué hora llega?',
  '¿dónde está la biblioteca y a qué hora llega la comitiva?',
  // Round 7, A1: a distinctive word by its root and a short ending: «-sito», «-itico», «-ón», the other
  // gender («techado» for «techada», «productoras» for «productores»).
  'el puentesito es en semana santa, ¿qué llevo?',
  'el puentesito arranca ahorita, que plano hago',
  'la canchitica es en semana santa, ¿qué llevo?',
  'la escuelitica es el día de la madre, ¿qué copy hago?',
  'el canchón es en semana santa, ¿qué llevo?',
  'el techado es en semana santa, que llevo',
  'los productorcitos son después de carnaval, que llevo',
  'las productoras son el día de la madre',
  // A7: a 4-letter word of a title as the subject of something happening.
  'el café es en semana santa, que copy hago',
  // A2: a when about the agenda next to a where about the platform, however they are joined; «mi sesión de
  // fotos», someone «con» something, «es» before what is not a deadline.
  'donde esta la biblioteca a que hora llega la comitiva',
  '¿Dónde está la biblioteca, a qué hora llega la comitiva?',
  '¿Dónde está la biblioteca o a qué hora llega la comitiva?',
  'donde queda la plantilla pero a que hora llega la comitiva',
  '¿a qué hora cierra la tanda, la comitiva cuándo llega?',
  '¿dónde queda mi sesión de fotos?',
  '¿dónde está mi sesión de grabación?',
  '¿dónde está Kevin con copies?',
  '¿a qué hora es la invitación del alcalde?',
  '¿dónde es la invitación del alcalde?',
  '¿cuándo es la semana de la juventud?',
  // Round 8, A1: a 4-letter word of a title made smaller, as the subject («café» → «cafecito»).
  'el cafecito es en semana santa, que copy hago',
  // A2: a part with no question word of its own takes the one before it («a qué hora … y llega…»).
  '¿a qué hora cierra la tanda y llega la comitiva?',
  '¿dónde están la biblioteca y la comitiva?',
  '¿cuándo vence el plazo y llega la comitiva?',
  '¿cuándo vence el plazo, y sale la comitiva?',
  '¿dónde está la biblioteca o la comitiva?',
];

const NOT_ABOUT_AN_EVENT = [
  // How-tos, the person's own things, publishing, support.
  '¿cómo subo un video?',
  '¿qué tengo pendiente?',
  '¿qué me toca aprobar hoy?',
  '¿cómo hago un copy?',
  '¿qué fórmula uso para el copy?',
  '¿cuánto puede durar un reel?',
  '¿a qué hora publico en TikTok?',
  '¿cuántos días de tweets quedan?',
  'revisa mis cosas',
  '¿qué hace Grabación?',
  '¿Cómo grabo en vertical?',
  '¿Cuándo hay que grabar con dron?',
  '¿Cuándo grabo en vertical y cuándo en horizontal?',
  '¿Dónde subo el material?',
  '¿dónde veo los resultados?',
  '¿Dónde es que se cambia la contraseña?',
  '¿cómo cambio mi contraseña?',
  'me salió un error que dice que el copy es muy largo',
  'tengo una falla con la app',
  '¿Cómo hacemos para llegar a más gente?',
  '¿cómo apruebo una pieza?',
  '¿qué color le pongo a la pieza?',
  '¿cómo va la pieza?',
  'mañana subo el material, ¿cómo lo subo?',
  'hoy hay que editar el video',
  'el video queda mejor en vertical',
  '¿El sistema está operativo?',
  '¿el material ya llegó?',
  '¿Ya me aceptaron la propuesta?',
  'mi cel es 0414-1234567',
  'hola',
  'gracias',
  'hay que subir la tanda de tweets hoy',
  'Los tweets salen a las 9:00, 13:00 y 19:00.',
  // «Lo de…» a thing of the platform, a role's or the person's own; words one letter from an event word.
  '¿qué es lo del semáforo?',
  'todo lo de Redes lo ve administración',
  '¿cómo cambio lo de mi clave?',
  '¿cómo sería el copy?',
  '¿cómo entrego el material?',
  '¿cuántas vistas tuvo el reel?',
  '¿cómo pongo el logo en la portada?',
  // Round 5, S2: a where or a when about a thing of the platform asks for a screen or a rule.
  '¿Dónde está la biblioteca?',
  '¿Dónde está el registro de cambios?',
  '¿Dónde está el botón de aprobar?',
  '¿Dónde quedan las plantillas de copies?',
  '¿Dónde se ve el semáforo?',
  '¿Cuándo vence el plazo para aprobar?',
  '¿Cuándo le llega el correo de invitación?',
  '¿A qué hora se cierra la semana de tweets?',
  '¿Dónde queda el buzón?',
  'donde estan los ajustes',
  // Round 6: the platform things that are also on the agenda count with what makes them the screen.
  '¿Dónde está la campana de avisos?',
  '¿Dónde veo mi sesión?',
  '¿Dónde está el panel del asistente?',
  '¿Esto se va a la biblioteca?',
  '¿Dónde está la biblioteca? ¿Y dónde quedan las plantillas?',
  '¿Cuándo llega la invitación?',
  // Round 7: still the platform's, and no form of a title word («saludos» is not «salud», «viviendo» is no
  // «vivienda», «santa» of «semana santa» says nothing alone).
  '¿Cuándo es el plazo para aprobar?',
  '¿Dónde está la lista de tweets?',
  '¿Dónde quedan las plantillas? ¿Y cuándo vence el plazo?',
  'Saludos, ¿cómo subo un video?',
  'lo estamos viviendo, ¿cómo hago un copy?',
  // A 4-letter word of a title that is the work («Toma aérea Tariba»): «la toma» is a shot.
  'la toma es vertical si es para reels',
  // Round 8: what goes on with a where of the platform is the platform's too («dónde el botón»), and a part
  // that is a question of its own or says nothing of anything does not take its question word.
  '¿Dónde está la biblioteca y el botón de aprobar?',
  '¿Dónde quedan las plantillas o el registro de cambios?',
  '¿Cuándo vence el plazo y qué pasa si no llego?',
  '¿Dónde está la biblioteca y cómo la uso?',
  '¿Dónde está la biblioteca, que no la veo?',
  'un cafecito y seguimos, ¿cómo hago un copy?',
];

// Round 4b, R3: notices that named an event and said something of it before it, or in another clause.
const NOTICES_ABOUT_AN_EVENT = [
  'este finde hay feria, tengan el material listo',
  'Tamá: la feria. Suban las fotos.',
  'Noviembre: feria. Revisen el material.',
  'para la feria: hotel Tamá. Suban las fotos.',
  'noviembre trae feria, suban las fotos',
  'suban las fotos de la feria, pinta para noviembre',
  'tengan las cámaras cargadas para el finde de la feria',
  'lleven el dron a Alto Verde el sábado',
  'lleven el dron a Alto Verde',
];

// S4: notices for the team's own work. A notice is judged without the bare «a day or an hour» signal:
// its days and deadlines are the team's unless it names an event.
const TEAM_NOTICES = [
  'suban el material antes de las 3 pm',
  'tienen hasta las 5 pm para subir el material',
  'aprueben las verdes antes del mediodía',
  'manden las fotos esta tarde',
  'cambien su contraseña esta semana',
  'gracias por el trabajo de esta semana',
];

describe('el detector compartido (events.ts)', () => {
  it('ve un evento en cada forma de nombrarlo y en nada de lo que no lo es', () => {
    expect(ABOUT_AN_EVENT.length + NOT_ABOUT_AN_EVENT.length + TEAM_NOTICES.length).toBeGreaterThanOrEqual(60);
    for (const t of ABOUT_AN_EVENT) expect(aboutEvent(t, TITLES), `${t} (${[...eventSignals(t, TITLES)].join(', ')})`).toBe(true);
    for (const t of NOT_ABOUT_AN_EVENT) expect(aboutEvent(t, TITLES), `${t} (${[...eventSignals(t, TITLES)].join(', ')})`).toBe(false);
    for (const t of TEAM_NOTICES) {
      expect(aboutEvent(t, TITLES, { when: false }), t).toBe(false);
      // Typed as a question, their hour alone sends them to 360.
      expect([...eventSignals(t, TITLES)], t).toEqual(['when']);
    }
    // What names an event still does, as a notice too.
    for (const t of ABOUT_AN_EVENT.slice(0, 32)) expect(aboutEvent(t, TITLES, { when: false }), t).toBe(true);
    for (const t of NOTICES_ABOUT_AN_EVENT) expect(aboutEvent(t, TITLES, { when: false }), t).toBe(true);
  });

  it('una forma de una palabra propia: su raíz y una terminación corta, nunca una palabra común (ronda 7, A1)', () => {
    const named = (t: string, events: string[]) => eventSignals(t, { events, pieces: [], places: [] }).has('title');
    const titles = ['Entrega de la cancha techada de El Mirador', 'Reunión con productores de café', 'Fiesta de los Santos Reyes', 'Entrega de viviendas', 'Jornada de salud'];
    for (const t of ['el puentesito', 'los puentesitos', 'la canchitica', 'el canchón', 'las canchonas', 'el canchazo', 'el techado', 'las techadas', 'la productora', 'los productorcitos', 'la viviendita']) {
      expect(named(t, [...titles, 'Recorrido por el puente La Quebrada']), t).toBe(true);
    }
    // Not a form of them: an ordinary word («santa» of «semana santa», for «Santos»), a gerund («viviendo»),
    // «-o» after a word that ends in a consonant («saludo» for «salud»), a longer ending («canchero»).
    for (const t of ['en semana santa', 'lo estamos viviendo', 'saludos al equipo', 'un saludo', 'el canchero']) expect(named(t, titles), t).toBe(false);
    // Round 8: the root spelled as it sounds made smaller (c → qu, g → gu, z → c; «-io», «-ia» without the i).
    const spelled = ['Visita a la finca cafetalera de Queniquea', 'Visita a la bodega comunal de Pregonero', 'Entrega del banco de leche', 'Reinauguración del estadio', 'Inauguración de la fábrica de bloques', 'Entrega de la farmacia popular', 'Recorrido por el muro del lápiz'];
    for (const t of ['la finquita', 'las finquitas', 'la bodeguita', 'el banquito', 'el banquillo', 'el estadito', 'la fabriquita', 'la farmacita', 'el lapicito']) expect(named(t, spelled), t).toBe(true);
    // That spelling takes only those endings: «el estado», «el banquero», «la bodeguera» are other words.
    for (const t of ['el estado del material', 'el banquero', 'la bodeguera', 'el finquero']) expect(named(t, spelled), t).toBe(false);
  });

  it('«a» + un nombre: un lugar, salvo que sea alguien del equipo (round 5, S4)', () => {
    const withPeople = { ...TITLES, people: ['kevin', 'sanchez', 'daniela'] };
    expect(aboutEvent('¿le mando el video a Kevin?', withPeople)).toBe(false);
    expect(aboutEvent('¿Cómo le paso el material a Daniela?', withPeople)).toBe(false);
    expect([...eventSignals('¿qué llevo a Táriba?', withPeople)]).toContain('agenda');
    // A where or a when about someone, with a thing of the platform in it, still asks for an agenda.
    expect(aboutEvent('¿a qué hora sale Kevin con el dron?', withPeople)).toBe(true);
    expect(aboutEvent('¿a qué hora sale Kevin con los copies?', withPeople)).toBe(true);
    // A screen or a network is not a place either.
    expect(aboutEvent('¿Cómo entro a Digital?', withPeople)).toBe(false);
    expect(aboutEvent('¿Lo subo a Drive?', withPeople)).toBe(false);
  });

  it('un lugar por su tira de mayúsculas, aunque cada palabra sea común, y se tapa como lugar', () => {
    expect([...eventSignals('¿y Alto Verde?', TITLES)]).toContain('place');
    expect([...eventSignals('¿y alto verde?', TITLES)]).toContain('place');
    // Only for whoever can see it.
    expect(aboutEvent('¿y Alto Verde?')).toBe(false);
    const ph = new Placeholders(TITLES);
    expect(ph.mask('lleven el dron a Alto Verde')).toBe('lleven el dron a [[L1]]');
    expect(ph.restore('Para [[L1]] lleva botas.')).toBe('Para ese lugar lleva botas.');
  });

  it('un hilo: la que sigue a una sobre un evento es de 360; la que se sostiene sola, no', () => {
    expect(eventThread(['¿cómo va la feria?', '¿y quién la cubre?', '¿y llevo el dron?', '¿cómo hago un copy?', 'ok'])).toEqual([true, true, true, false, false]);
    expect(eventThread(['¿cómo va la feria?', '¿qué cámara llevo para eso?'])).toEqual([true, true]);
  });

  it('dice por qué: la palabra, el título (o un nombre suyo, o dos palabras seguidas), el lugar, la marca, quién, la pregunta o la forma de agenda', () => {
    const has = (t: string, s: string) => expect([...eventSignals(t, TITLES)], t).toContain(s);
    has('¿cómo va la feria?', 'word');
    has('¿cómo va lo de Pirineos?', 'title');
    has('¿qué tal quedó la toma aérea?', 'title');
    has('¿cómo va lo de La Quebrada?', 'place');
    has('Revisen el material de [[E1]].', 'token');
    has('¿qué hace el jefe?', 'subject');
    has('¿dónde queda?', 'ask');
    has('nos vemos el sábado en la oficina', 'agenda');
    has('¿qué llevo el sábado?', 'when');
    // The titles count only for whoever can see them; «lo de…» is an event by another name for anyone.
    expect(aboutEvent('¿cómo va Pirineos?')).toBe(false);
    has('¿cómo va lo de Pirineos?', 'title');
  });

  it('la pregunta se tapa con el mismo detector, y la red de salida también lo usa', () => {
    // About an event by its title only: its day and place go before it is stored.
    expect(guardQuestion(redact('lo de Pirineos es el sábado en Pueblo Nuevo, ¿qué falta?'), TITLES)).toBe('lo de Pirineos es [fecha] en [direccion], ¿qué falta?');
    // A day alone sends the question to 360, but is kept in what is stored (it never reaches a provider,
    // not even in a later thread).
    expect(guardQuestion(redact('¿Qué tengo pendiente hoy?'), TITLES)).toBe('¿Qué tengo pendiente hoy?');
    expect(breaksAgendaRule('Es el sábado.', '¿cómo va lo de Pirineos?', [], TITLES)).toBe(true);
    expect(breaksAgendaRule('Es el sábado.', '¿cómo va Pirineos?')).toBe(false);
  });
});

type Body = { messages: { role: string; content: string | null }[] };
function fakeProvider(answer: string) {
  const seen: Body[] = [];
  const fetchImpl = vi.fn(async (_u: unknown, init?: RequestInit) => {
    seen.push(JSON.parse(String(init?.body)) as Body);
    return new Response(JSON.stringify({ choices: [{ message: { content: answer } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, seen };
}

describe('con cadena de modelos: lo que habla de un evento nunca llega al proveedor', () => {
  it('cada pregunta sobre un evento la contesta 360 sin llamar al proveedor; un cómo se hace sí va al modelo', async () => {
    const ev = (await withSystem((sql) => sql.one<{ id: string }>(`insert into public.events (title, boss_decision, created_by) values ('Feria de Pirineos', 'accepted', $1) returning id`, [ADMIN_ID])))!.id;
    try {
      const asks: [DemoUserKey, string][] = [
        ['social', 'la feria es el finde en el hotel Tamá, ¿qué falta?'],
        ['social', '¿cómo va lo de Pirineos el treinta y uno?'],
        ['social', '¿qué tal quedó la toma aérea de La Quebrada?'],
        ['camera', '¿cómo grabo el recorrido que sale en la mañanita del puente La Quebrada?'],
        ['camera', 'salimos pasado mañana temprano desde Pueblo Nuevo, ¿qué llevo?'],
        ['camera', '¿Qué me toca grabar el viernes?'],
        ['supervisor', 'el acto arranca en 2 horas, ¿qué hago?'],
        ['supervisor', '¿dónde queda?'],
        ['dispatch', '¿qué llevo a la feria de pasado mañana en el club Demócrata?'],
        ['secretary', '¿cómo propongo un evento?'],
        ['boss', 'Pregunta por [[E7]]'],
      ];
      for (const [key, q] of asks) {
        const p = fakeProvider('No debería llegar aquí.');
        const r = await handleTurn(sessionOf(key), { question: q }, { chain: CHAIN, chatOptions: { fetchImpl: p.fetchImpl } });
        expect(p.fetchImpl, `${key}: ${q}`).not.toHaveBeenCalled();
        expect(r.model, `${key}: ${q}`).toBe('local');
        expect(r.degraded, `${key}: ${q}`).toBe(false);
        expect(r.answer, `${key}: ${q}`).not.toBe('No debería llegar aquí.');
      }
      // Nothing was reserved against the month's cap for them.
      const left = await withSystem((sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.ai_usage where feature = 'assistant'`));
      expect(left!.n).toBe(0);
      // A how-to goes to the model (and keeps every masking layer).
      for (const [key, q] of [['social', '¿cómo hago un copy?'], ['camera', '¿Cómo grabo en vertical?'], ['supervisor', '¿cómo apruebo una pieza?']] as [DemoUserKey, string][]) {
        const p = fakeProvider('Así se hace: en la pieza, pestaña Copies.');
        const r = await handleTurn(sessionOf(key), { question: q }, { chain: CHAIN, chatOptions: { fetchImpl: p.fetchImpl } });
        expect(p.fetchImpl, `${key}: ${q}`).toHaveBeenCalled();
        expect(r.model, `${key}: ${q}`).toBe('groq:llama-3.3-70b');
        expect(p.seen[0].messages.at(-1)!.content).toBe(q);
      }
    } finally {
      await withSystem((sql) => sql.query(`update public.events set deleted_at = now() where id = $1`, [ev]));
    }
  });

  it('ronda 4b: «lo de…», abreviaturas, errores de tipeo, el jefe por su nombre y un lugar por su tira de mayúsculas tampoco llegan', async () => {
    const asks: [DemoUserKey, string][] = [
      ['social', '¿cómo va lo de la cancha?'],
      ['camera', '¿qué llevo pa lo del puente?'],
      ['social', '¿se suspendió lo de la plaza?'],
      ['camera', '¿kndo es lo d la cancha?'],
      ['camera', '¿onde es lo del puente?'],
      ['camera', '¿cuántos días faltan para lo del puente?'],
      ['social', '¿como va la feira?'],
      ['social', '¿el evnto de la cancha?'],
      ['supervisor', `¿el señor ${BOSS_FIRST} va a ir?`],
      ['dispatch', 'lo de Alto Verde quedó para noviembre, ¿qué le falta a la ficha?'],
      ['dispatch', '¿qué llevo pa Alto Verde?'],
      ['camera', '¿qué llevo pa Alto Verde el finde?'],
      ['camera', 'mañanita salimos pa Alto Verde, ¿llevo el dron?'],
    ];
    for (const [key, q] of asks) {
      const p = fakeProvider('No debería llegar aquí.');
      const r = await handleTurn(sessionOf(key), { question: q }, { chain: CHAIN, chatOptions: { fetchImpl: p.fetchImpl } });
      expect(p.fetchImpl, `${key}: ${q}`).not.toHaveBeenCalled();
      expect(r.model, `${key}: ${q}`).toBe('local');
    }
  });

  it('rondas 5 a 7: una palabra propia de un título que ve (o una forma suya) no llega al proveedor; un dónde o un cuándo de la plataforma sí', async () => {
    const asks: [DemoUserKey, string][] = [
      ['camera', 'la cancha es en semana santa, ¿qué llevo?'],
      ['camera', 'la cancha arranca ahorita, ¿qué plano hago primero?'],
      ['camera', '¿cuándo grabo la cancha?'],
      ['camera', '¿cuándo grabo en la escuela?'],
      ['camera', '¿la cancha está lejos?'],
      ['camera', 'cuanto falta pa la cancha'],
      ['camera', 'a k ora es la cancha'],
      ['camera', '¿qué llevo a Táriba?'],
      ['social', 'las viviendas son el día de la madre, ¿qué copy les hago?'],
      ['dispatch', 'el puente quedó para después de carnaval, ¿qué le falta a la ficha?'],
      // Round 6: a diminutive of a distinctive word, and a when about something that is also on the agenda.
      ['camera', 'la canchita es en semana santa, ¿qué llevo?'],
      ['camera', 'la canchita arranca ahorita, ¿qué plano hago primero?'],
      ['dispatch', 'el puentecito quedó para después de carnaval, ¿qué le falta a la ficha?'],
      ['social', 'la escuelita es el día de la madre, ¿qué copy hago?'],
      ['camera', '¿A qué hora es la sesión?'],
      ['camera', '¿Cuándo es la campaña?'],
      ['supervisor', '¿Dónde es la sesión solemne?'],
      ['camera', '¿A qué hora sale Kevin con copies?'],
      ['social', '¿Dónde está la biblioteca? ¿Y a qué hora llega la comitiva?'],
      ['social', '¿Dónde queda la plantilla? y la comitiva ¿a qué hora llega?'],
      // Round 7: «-sito», «-itico», «-ón», the other gender, a 4-letter word as the subject, and a when
      // next to a where of the platform with a comma, «o», «pero» or nothing between them.
      ['camera2', 'el puentesito es en semana santa, ¿qué llevo?'],
      ['camera2', 'el puentesito arranca ahorita, que plano hago'],
      ['camera', 'la canchitica es en semana santa, ¿qué llevo?'],
      ['camera', 'el canchón es en semana santa, ¿qué llevo?'],
      ['camera', 'el techado es en semana santa, que llevo'],
      ['social', 'la escuelitica es el día de la madre, ¿qué copy hago?'],
      ['social', 'el café es en semana santa, que copy hago'],
      ['social', 'donde esta la biblioteca a que hora llega la comitiva'],
      ['social', '¿Dónde está la biblioteca, a qué hora llega la comitiva?'],
      ['social', '¿Dónde está la biblioteca o a qué hora llega la comitiva?'],
      ['social', 'donde queda la plantilla pero a que hora llega la comitiva'],
      ['social', '¿a qué hora cierra la tanda, la comitiva cuándo llega?'],
      ['camera', '¿dónde queda mi sesión de fotos?'],
      ['camera', '¿dónde está Kevin con copies?'],
      ['social', '¿a qué hora es la invitación del alcalde?'],
      ['social', '¿cuándo es la semana de la juventud?'],
      // Round 8: the question word of the part before, across «y».
      ['social', '¿a qué hora cierra la tanda y llega la comitiva?'],
      ['social', '¿dónde están la biblioteca y la comitiva?'],
      ['social', '¿cuándo vence el plazo y llega la comitiva?'],
    ];
    for (const [key, q] of asks) {
      const p = fakeProvider('No debería llegar aquí.');
      const r = await handleTurn(sessionOf(key), { question: q }, { chain: CHAIN, chatOptions: { fetchImpl: p.fetchImpl } });
      expect(p.fetchImpl, `${key}: ${q}`).not.toHaveBeenCalled();
      expect(r.model, `${key}: ${q}`).toBe('local');
    }
    for (const [key, q] of [
      ['supervisor', '¿Cuándo es el plazo para aprobar?'],
      ['admin', '¿Dónde está la biblioteca?'],
      ['admin', '¿Dónde está el registro de cambios?'],
      ['supervisor', '¿Dónde está el botón de aprobar?'],
      ['supervisor', '¿Cuándo vence el plazo para aprobar?'],
      ['admin', '¿Cuándo le llega el correo de invitación?'],
      ['social', '¿Dónde quedan las plantillas de copies?'],
      ['social', '¿Le mando el video a Kevin?'],
      ['supervisor', '¿Dónde está la biblioteca y el botón de aprobar?'],
      ['supervisor', '¿Cuándo vence el plazo y qué pasa si no llego?'],
    ] as [DemoUserKey, string][]) {
      const p = fakeProvider('Así se hace.');
      const r = await handleTurn(sessionOf(key), { question: q }, { chain: CHAIN, chatOptions: { fetchImpl: p.fetchImpl } });
      expect(p.fetchImpl, `${key}: ${q}`).toHaveBeenCalled();
      expect(r.model, `${key}: ${q}`).toBe('groq:llama-3.3-70b');
    }
  });

  it('un cómo se hace con eventos lo contestan las fichas, nunca «No encontré ningún evento»', async () => {
    const asks: [DemoUserKey, string][] = [
      ['boss', '¿Cómo acepto un evento?'],
      ['boss', '¿Cómo rechazo un evento?'],
      ['boss', '¿Cómo califico un evento?'],
      ['dispatch', '¿Cómo borro un evento?'],
      ['dispatch', '¿Cómo edito la ficha de un evento?'],
      ['dispatch', '¿Cómo le pongo prioridad a un evento?'],
      ['social', '¿Cómo reviso el storyboard de un evento?'],
      ['social', '¿Cómo descargo el material de un evento?'],
      ['camera', '¿Qué tomas hago en un acto?'],
      ['camera', '¿Qué llevo a un recorrido?'],
      ['camera', '¿Cómo grabo una entrega?'],
      ['supervisor', '¿Qué reviso en el video de un acto?'],
      ['admin', '¿Cómo veo los eventos pasados?'],
    ];
    for (const [key, q] of asks) {
      const p = fakeProvider('No debería llegar aquí.');
      const r = await handleTurn(sessionOf(key), { question: q }, { chain: CHAIN, chatOptions: { fetchImpl: p.fetchImpl } });
      expect(p.fetchImpl, `${key}: ${q}`).not.toHaveBeenCalled();
      expect(r.answer, `${key}: ${q}`).not.toMatch(/No encontré ningún evento|Encontré varios|está en «/);
      expect(r.degraded, `${key}: ${q}`).toBe(false);
    }
    // How one event is going is still the event lookup.
    expect((await handleTurn(sessionOf('social'), { question: '¿cómo va lo de la cancha?' }, { chain: [] })).answer).toMatch(/^El evento «Entrega de la cancha techada de El Mirador» está en «/);
  });

  it('la pregunta que sigue a una sobre un evento también es de 360; la de después vuelve al modelo, sin aquella en el hilo', async () => {
    const p = fakeProvider('Claro. ¿Algo más?');
    const s = sessionOf('social2');
    const first = await handleTurn(s, { question: '¿cómo va la feria de emprendedores?' }, { chain: CHAIN, chatOptions: { fetchImpl: p.fetchImpl } });
    expect(first.model).toBe('local');
    const second = await handleTurn(s, { question: '¿y a quién le escribo?', conversationId: first.conversationId }, { chain: CHAIN, chatOptions: { fetchImpl: p.fetchImpl } });
    expect(second.model).toBe('local');
    expect(p.fetchImpl).not.toHaveBeenCalled();
    const third = await handleTurn(s, { question: '¿cómo hago un copy?', conversationId: first.conversationId }, { chain: CHAIN, chatOptions: { fetchImpl: p.fetchImpl } });
    expect(third.model).toBe('groq:llama-3.3-70b');
    const thread = JSON.stringify(p.seen[0].messages.filter((m) => m.role !== 'system').map((m) => m.content));
    for (const leak of ['feria', 'emprendedores', 'Feria']) expect(thread, leak).not.toContain(leak);
  });
});
