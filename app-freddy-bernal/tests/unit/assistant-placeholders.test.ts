// Event titles never reach an AI provider: they travel as placeholders («[[E1]]») and come back as
// the real title in what the person sees. Every way of writing a date, a time, a day, a place or a
// contact that the review found (S1) stays out of the exact messages sent, whether it comes inside
// an event title (a tool's result), an earlier answer, a script, a ficha or the question. Demo
// database (PGlite, invented data) and a fake provider (no network).
import { describe, it, expect, vi } from 'vitest';
import type { Session } from '@/lib/auth/session';
import { withSystem } from '@/lib/db';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import type { Role } from '@/lib/roles';
import { handleTurn } from '@/lib/assistant';
import { AGENDA_FALLBACK, breaksAgendaRule, filterOutput, guardQuestion } from '@/lib/assistant/brain';
import { parseChain } from '@/lib/assistant/providers';
import { redact, redactQuoted, safeTitle } from '@/lib/assistant/redact';
import { Placeholders, nameReplacer, withTitleHoles } from '@/lib/assistant/titles';
import { phonesIn } from '@/lib/domain/phones';

function sessionOf(key: DemoUserKey): Session {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  return { userId: u.id, email: u.email, name: u.name, roles: [...u.roles] as Role[], aal: 'aal2', mfaRequired: false, mfaOk: true, claims: { sub: u.id, aal: 'aal2', role: 'authenticated' }, viewAs: null };
}
const ADMIN_ID = DEMO_USERS.find((u) => u.key === 'admin')!.id;
const LOCAL = { chain: [] };
const CHAIN = parseChain('groq:llama-3.3-70b');
process.env.GROQ_API_KEY = 'gsk_FAKE_test_key_0000';

type Body = { messages: { role: string; content: string | null }[] } & Record<string, unknown>;
function fakeProvider(answer: (n: number, body: Body) => unknown) {
  const seen: Body[] = [];
  const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Body;
    seen.push(body);
    return new Response(JSON.stringify(answer(seen.length, body)), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { fetchImpl, seen };
}
const say = (content: string) => ({ choices: [{ message: { content } }], usage: { prompt_tokens: 100, completion_tokens: 20 } });
const callTools = (calls: [string, unknown][]) => ({
  choices: [{ message: { content: '', tool_calls: calls.map(([name, args], k) => ({ id: `c-${name}-${k}`, type: 'function', function: { name, arguments: JSON.stringify(args) } })) } }],
  usage: { prompt_tokens: 100, completion_tokens: 5 },
});
const model = (fetchImpl: typeof fetch) => ({ chain: CHAIN, chatOptions: { fetchImpl } });

async function addEvents(titles: string[]): Promise<string[]> {
  return withSystem(async (sql) => {
    const ids: string[] = [];
    for (const t of titles) ids.push((await sql.one<{ id: string }>(`insert into public.events (title, boss_decision, created_by) values ($1, 'accepted', $2) returning id`, [t, ADMIN_ID]))!.id);
    return ids;
  });
}
const dropEvents = (ids: string[]) => withSystem((sql) => sql.query(`update public.events set deleted_at = now() where id = any($1::uuid[])`, [ids]));

// Every format the review found getting through (S1), the partial ones and S7's date-time.
const FORMATS = [
  '9,30', '9 30', '0930', '9 y 30', '9 con 30', '9 en punto', '12 m', '12m.', 'de 7 a 9', 'entre 7 y 9', '8 a 12 m',
  'tres de noviembre', '1ro de noviembre', '1° de noviembre', 'primero de noviembre', 'el 3', 'el día 3', '3 del 11', '20261103',
  'fin de semana', 'la semana que viene', 'por la tarde', 'temprano', 'a primera hora',
  'al lado de la plaza Bolívar', 'frente a la plaza Bolívar', 'detrás del mercado municipal', 'a dos cuadras de la plaza',
  'calle principal de Táriba', 'qta. Las Flores', 'C.C. Sambil', 'parroquia La Concordia', 'C/ 7 # 4', '3561234', '356-1234',
  'juan arroba gmail punto com', 'juan@localhost', 'km 8 vía San Cristóbal', '7 a 9 am', '12 del mediodía', 'Mar. 3/11', 'sáb 3',
  '2026/11/03', 'pasado mañana', 'el próximo martes', '2026-11-03T13:30:00Z',
];
// An event's title can no longer hold a phone (events_main_no_phone, 20261028002200_round_review_fixes.sql): the
// formats inside a title are the rest.
const TITLE_FORMATS = FORMATS.filter((f) => !phonesIn(f).length);
// «zqx <format> wqy»: whatever the redaction leaves around a format, the format itself is never
// next to its markers in what was sent.
const marked = (f: string) => `zqx ${f} wqy`;
function assertNoFormat(sent: string, where: string) {
  for (const f of FORMATS) {
    expect(sent, `${where}: «${f}»`).not.toContain(`zqx ${f}`);
    expect(sent, `${where}: «${f}»`).not.toContain(`${f} wqy`);
  }
}

describe('títulos de eventos: al proveedor solo como marcas', () => {
  it('cada formato dentro de un título (resultado de una herramienta) llega como «[[E…]]»; la persona ve el título real', async () => {
    const code = (k: number) => `Kqa${String.fromCharCode(97 + Math.floor(k / 26))}${String.fromCharCode(97 + (k % 26))}`;
    const titles = TITLE_FORMATS.map((f, k) => `${code(k)} Visita ${f}`);
    const ids = await addEvents(titles);
    try {
      for (let start = 0; start < TITLE_FORMATS.length; start += 8) {
        const chunk = TITLE_FORMATS.map((_f, k) => k).slice(start, start + 8);
        const first = chunk.slice(0, 4).map((k): [string, unknown] => ['buscar_evento', { texto: code(k) }]);
        const second = chunk.slice(4).map((k): [string, unknown] => ['buscar_evento', { texto: code(k) }]);
        const p = fakeProvider((n) => (n === 1 ? callTools(first) : n === 2 && second.length ? callTools(second) : say('El evento «[[E1]]» va en ficha. ¿Algo más?')));
        // Asked about nothing in particular (a question about an event never reaches the model).
        const r = await handleTurn(sessionOf('admin'), { question: 'revisa esto, porfa' }, model(p.fetchImpl));
        expect(r.model).toBe('groq:llama-3.3-70b');
        // What the platform sent (the model's own tool arguments, «Kqaab», are its words, not the platform's).
        const sent = JSON.stringify(p.seen.map((b) => b.messages.map((m) => m.content)));
        // Not even the start of a title, nor any of its formats.
        expect(sent).not.toMatch(/Kqa[a-z]{2}/);
        for (const k of chunk) expect(sent, TITLE_FORMATS[k]).not.toContain(`Visita ${TITLE_FORMATS[k]}`);
        const tools = p.seen.at(-1)!.messages.filter((m) => m.role === 'tool').map((m) => JSON.parse(m.content!).eventos[0].titulo);
        expect(tools.every((t: string) => /^\[\[E\d+\]\]$/.test(t))).toBe(true);
        // What the person sees: the first title looked up, real (the person can see it), never a placeholder.
        expect(r.answer).toBe(`El evento «${titles[chunk[0]]}» va en ficha. ¿Algo más?`);
        expect(r.answer).not.toContain('[[');
      }
    } finally {
      await dropEvents(ids);
    }
  });

  it('en el hilo, los guiones del equipo y de una conversación y las fichas del equipo: ningún formato llega (red de seguridad del prompt)', async () => {
    const [ev] = await addEvents(['Feria Pirineos 9,30 frente a la plaza Bolívar']);
    const lines = FORMATS.map(marked);
    const scriptIds: string[] = [];
    let fichaId = '';
    try {
      await withSystem(async (sql) => {
        for (const origin of ['conversacion', 'equipo']) {
          const script = `Persona: zqx prueba de formatos\n[ASISTENTE]: La feria «Feria Pirineos 9,30 frente a la plaza Bolívar» ${lines.join('. ')}.`;
          scriptIds.push((await sql.one<{ id: string }>(
            `insert into public.assistant_scripts (topic, triggers, script, origin) values ($1, $2::text[], $3, $4) returning id`,
            [`zqx prueba de formatos ${origin}`, '{"zqx prueba de formatos"}', script, origin],
          ))!.id);
        }
        fichaId = (await sql.one<{ id: string }>(
          `insert into public.assistant_knowledge (title, body, tags, origin) values ('Zqx prueba de formatos', $1, '{zqx}', 'equipo') returning id`,
          [`${lines.map((l) => `La feria ${l}.`).join(' ')} La Feria Pirineos 9,30 frente a la plaza Bolívar va.`],
        ))!.id;
      });
      // An earlier answer (of the demo brain, say) with every format and the title as it is.
      const first = await handleTurn(sessionOf('admin'), { question: 'hola' }, LOCAL);
      await withSystem((sql) =>
        sql.query(`insert into public.assistant_messages (conversation_id, who, body) values ($1, 'asistente', $2)`, [first.conversationId, `Del evento «Feria Pirineos 9,30 frente a la plaza Bolívar»: ${lines.join(', ')}.`]),
      );
      const p = fakeProvider(() => say('Va bien, ¿algo más?'));
      const r = await handleTurn(sessionOf('admin'), { question: 'zqx prueba de formatos', conversationId: first.conversationId }, model(p.fetchImpl));
      expect(r.model).toBe('groq:llama-3.3-70b');
      const msgs = p.seen[0].messages;
      const system = msgs[0].content!;
      // The script and the ficha were really in the prompt (scrubbed), and the earlier answer in the thread.
      expect(system).toContain('### zqx prueba de formatos conversacion');
      expect(system).toContain('### zqx prueba de formatos equipo');
      expect(system).toContain('Zqx prueba de formatos:');
      expect(msgs.some((m) => m.role === 'assistant' && m.content?.startsWith('Del evento «[[E1]]»'))).toBe(true);
      const sent = JSON.stringify(msgs);
      assertNoFormat(sent, 'mensajes');
      expect(sent).not.toContain('Feria Pirineos');
      expect(sent).toContain('[[E1]]');
    } finally {
      await dropEvents([ev]);
      await withSystem(async (sql) => {
        await sql.query(`update public.assistant_scripts set active = false where id = any($1::uuid[])`, [scriptIds]);
        await sql.query(`update public.assistant_knowledge set active = false where id = $1`, [fichaId]);
      });
    }
  });

  it('una marca cambiada o inventada nunca se muestra cruda; una búsqueda por la marca encuentra el evento real', async () => {
    const title = 'Toma aérea Tariba 9.30 frente a la plaza Bolívar';
    const [ev] = await addEvents([title]);
    try {
      // An earlier answer quoted it (the person can see it); the question now is about nothing in particular.
      const first = await handleTurn(sessionOf('social'), { question: 'hola' }, LOCAL);
      await withSystem((sql) => sql.query(`insert into public.assistant_messages (conversation_id, who, body) values ($1, 'asistente', $2)`, [first.conversationId, `Lo primero: falta el storyboard de «${title}».`]));
      // The model looks it up by its placeholder: the tool runs with the real title.
      const p = fakeProvider((n) => (n === 1 ? callTools([['buscar_evento', { texto: '[[E1]]' }]]) : say('Va en ficha: [E1], [[ e1 ]] y [[E7]]. [[X]]')));
      const r = await handleTurn(sessionOf('social'), { question: 'revisa eso, porfa', conversationId: first.conversationId }, model(p.fetchImpl));
      const tool = p.seen[1].messages.find((m) => m.role === 'tool')!;
      expect(JSON.parse(tool.content!).encontrados).toBe(1);
      // A sentence left with something that only looks like a placeholder goes whole (the filter's hueco rule).
      expect(r.answer).toBe(`Va en ficha: «${title}», «${title}» y ese evento.`);
      expect(r.answer).not.toMatch(/\[|\]/);
      for (const leak of ['Tariba', '9.30', 'plaza Bolívar']) expect(JSON.stringify(p.seen), leak).not.toContain(leak);
    } finally {
      await dropEvents([ev]);
    }
  });

  it('si preguntan cuándo o dónde, contesta 360 sin IA y el título vuelve sin su hora ni su lugar', async () => {
    const title = 'Toma aérea Tariba 9.30 frente a la plaza Bolívar';
    const [ev] = await addEvents([title]);
    try {
      const p = fakeProvider(() => say('No debería llegar aquí.'));
      const r = await handleTurn(sessionOf('social'), { question: '¿A qué hora es la toma aérea de Tariba?' }, model(p.fetchImpl));
      expect(p.seen).toHaveLength(0);
      expect(r.model).toBe('local');
      expect(r.answer).toMatch(/no lo manejo|no la tengo/);
      expect(r.answer).toContain('«Toma aérea Tariba»');
      expect(r.answer).not.toContain(title);
    } finally {
      await dropEvents([ev]);
    }
  });

  it('las marcas: iguales todo el turno, la más larga primero, y de vuelta con el nombre real', () => {
    const ph = new Placeholders({ events: ['Feria de Pirineos', 'Feria de Pirineos 9.30'], pieces: ['Reel de la feria'], places: ['Escuela Los Andes'] });
    expect(ph.mask('La Feria de Pirineos 9.30 y la feria de pirineos; Reel de la feria en la Escuela Los Andes.')).toBe('La [[E1]] y la [[E2]]; [[P1]] en la [[L1]].');
    expect(ph.mask('otra vez la Feria de Pirineos 9.30')).toBe('otra vez la [[E1]]');
    expect(ph.maskDeep({ a: ['Feria de Pirineos'], n: 3 })).toEqual({ a: ['[[E2]]'], n: 3 });
    expect(ph.restore('«[[E1]]», [[E2]], [[P1]] y [[L1]]')).toBe('«Feria de Pirineos 9.30», «Feria de Pirineos», «Reel de la feria» y ese lugar');
    expect(ph.restore('[[E1]]', { scrub: true })).toBe('«Feria de Pirineos»');
    expect(ph.restoreArgs('{"texto":"[[E2]]"}')).toBe('{"texto":"Feria de Pirineos"}');
    // The filter does not drop a sentence for its placeholder (it is not an unfilled hueco).
    expect(filterOutput('El evento «[[E1]]» va en ficha.')).toBe('El evento «[[E1]]» va en ficha.');
    // «Así se contesta»: the titles become the scripts' data hueco.
    expect(withTitleHoles('El evento «Feria de Pirineos 9.30» va.', { events: ['Feria de Pirineos 9.30'], pieces: [], places: [] })).toBe('El evento «[titulo]» va.');
  });

  it('sin un patrón con todos los nombres (tardaba segundos con miles): encuentra lo mismo que ese patrón', () => {
    // The names as Placeholders keeps them (norm(): one space between words, lower case), some that start
    // with neither a letter nor a digit, some inside others.
    const names = ['feria de pirineos', 'feria de pirineos 9.30', 'toma aérea tariba', 'casa comunal alto verde', 'alto verde', '«expo» táchira', '(demo) jornada de salud', 'jornada de salud', 'reunión con productores de café', 'café', 'straße', 'ñandú', 'el mirador', 'mirador del sur', 'k-pop fest', '3er festival', 'año nuevo 2027', 'jornada'];
    const escape = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    const oracle = new RegExp(`(?<![\\p{L}\\p{N}])(?:${[...names].sort((a, b) => b.length - a.length).map(escape).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
    const find = nameReplacer(names);
    const PIECES = ['Feria de Pirineos', 'FERIA  DE\tPIRINEOS 9.30', 'feria de pirineos9', 'Toma Aérea Tariba', 'toma aerea tariba', 'Casa comunal Alto  Verde', 'alto verde', 'Alto Verdeño', '«Expo» Táchira', '«expo»táchira', '(Demo) Jornada de Salud', 'Jornada', 'jornadas', 'Reunión con productores de CAFÉ', 'Café', 'cafés', 'STRAẞE', 'Straße', 'Ñandú', 'El Mirador', 'Mirador del Sur', 'K-Pop Fest', 'k-pop festival', '3er Festival', 'Año Nuevo 2027', 'año nuevo 20270', 'x', ' ', '  ', '\u00a0', ', ', '. ', '¿', '?', '«', '»', '(', ')', '-', 'a', 'de', '9', 'Ñ', '😀', '𝐀'];
    let seed = 7;
    const rand = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed % n);
    const mark = (m: string) => `<${m}>`;
    let found = 0;
    for (let k = 0; k < 3000; k++) {
      const text = Array.from({ length: 1 + rand(12) }, () => PIECES[rand(PIECES.length)]).join(rand(3) ? ' ' : '');
      const want = text.replace(oracle, mark);
      expect(find(text, mark), JSON.stringify(text)).toBe(want);
      if (want !== text) found++;
    }
    expect(found).toBeGreaterThan(1500);
    expect(find('nada que ver', mark)).toBe('nada que ver');
    expect(nameReplacer([])('Feria de Pirineos', mark)).toBe('Feria de Pirineos');
  });
});

describe('la red de salida (S6, S8) y la pregunta (S5, P3)', () => {
  it('una respuesta sobre un evento con hora, día, lugar o contacto, escritos como sea, no sale', async () => {
    const bad = [
      'El recorrido es 9,30.', 'Es pasado mañana en la mañana.', 'Es el 1ro de noviembre.', 'El recorrido es el martes temprano.',
      'Es al lado de la plaza Bolívar.', 'El recorrido es mañana.', 'Es el tres de noviembre a primera hora.', 'Arranca a las 12 m.',
      'Es a las nueve.', 'Es de 7 a 9.', 'Llama al 356-1234.', 'Es en la qta. Las Flores.', 'Es el fin de semana.',
    ];
    for (const a of bad) {
      // Asked about the event: the rule holds whatever the answer says.
      expect(breaksAgendaRule(a, '¿a qué hora es el recorrido del puente?'), a).toBe(true);
      // Asked about nothing in particular, a model's answer that names an event is held to it too.
      expect(breaksAgendaRule(`Del recorrido del puente: ${a}`, 'revisa mis cosas', [], undefined, { answerToo: true }), a).toBe(true);
      const p = fakeProvider(() => say(`Del recorrido del puente: ${a}`));
      const r = await handleTurn(sessionOf('dispatch'), { question: 'revisa mis cosas' }, model(p.fetchImpl));
      expect(r.answer, a).toBe(AGENDA_FALLBACK);
    }
    // The event question itself never reaches the model.
    const p = fakeProvider(() => say('No debería llegar aquí.'));
    const r = await handleTurn(sessionOf('dispatch'), { question: '¿a qué hora es el recorrido del puente?' }, model(p.fetchImpl));
    expect(p.seen).toHaveLength(0);
    expect(r.answer).toMatch(/no lo manejo|no la tengo/);
    // «Hoy» the screen, a ratio or how long something takes are not a when.
    expect(breaksAgendaRule('Todo eso está en Hoy.', '¿qué eventos tengo pendientes?')).toBe(false);
    expect(breaksAgendaRule('Tienen 24 h para subir el material del acto.', '¿cuánto tiempo hay para el material del acto?')).toBe(false);
    // An answer that names no event, to a question about none, keeps its hours (a tweet slot).
    expect(breaksAgendaRule('Los tweets salen a las 9:00.', 'revisa mis cosas', [], undefined, { answerToo: true })).toBe(false);
  });

  it('«4/5» en una pregunta de formato es una proporción, no una fecha (S8)', async () => {
    const p = fakeProvider(() => say('Sí, 4/5 va bien para la portada en Instagram.'));
    const r = await handleTurn(sessionOf('social'), { question: '¿Qué formato uso para la portada, 4/5?' }, model(p.fetchImpl));
    expect(p.seen[0].messages.at(-1)!.content).toBe('¿Qué formato uso para la portada, 4/5?');
    expect(r.answer).toBe('Sí, 4/5 va bien para la portada en Instagram.');
    expect(redact('el 4/5 hay acto')).toBe('el [fecha] hay acto');
  });

  it('la pregunta sobre un evento pierde sus días, horas y lugares; la de cómo se hace o de publicar no', async () => {
    const cases: [string, string][] = [
      ['la visita de Pirineos es 9,30 al lado de la plaza Bolívar, ¿qué falta?', 'la visita de Pirineos es [hora] [direccion], ¿qué falta?'],
      ['el acto es pasado mañana a primera hora frente a la plaza Bolívar, ¿qué falta del storyboard?', 'el acto es [fecha] [hora] [direccion], ¿qué falta del storyboard?'],
      ['la caravana es el 1ro de noviembre de 7 a 9, ¿cómo va?', 'la caravana es el [fecha] de [hora] a [hora], ¿cómo va?'],
      ['la jornada es 2026/11/03 0930 qta. Las Flores, juan arroba gmail punto com', 'la jornada es [fecha] [hora] [direccion], [correo]'],
      ['la entrega es el tres de noviembre en la parroquia La Concordia, km 8 vía San Cristóbal', 'la entrega es el [fecha] en la [direccion], [direccion]'],
      ['el evento del sábado a las 4', 'el evento del [fecha] a las [hora]'],
      ['la feria es en la Plaza Bolívar de San Cristóbal', 'la feria es en la [direccion]'],
    ];
    for (const [typed, expected] of cases) {
      // About an event: 360 answers it without AI; what is stored loses its days, hours and places.
      const p = fakeProvider(() => say('Revisa la ficha del evento. ¿Algo más?'));
      const r = await handleTurn(sessionOf('dispatch'), { question: typed }, model(p.fetchImpl));
      expect(p.seen, typed).toHaveLength(0);
      expect(guardQuestion(redact(typed)), typed).toBe(expected);
      const stored = await withSystem((sql) => sql.one<{ body: string }>(`select body from public.assistant_messages where conversation_id = $1 and who = 'persona'`, [r.conversationId]));
      expect(stored!.body, typed).toBe(expected);
    }
    // Ordinary words when the question is not about an event, or the day is the person's own work or
    // when to publish; the event's day around it still goes.
    for (const q of ['¿Qué tengo pendiente hoy?', 'mañana subo el material de la feria, ¿cómo lo subo?', '¿Mañana publico el video de la feria en Instagram?', '¿cómo publico en Threads el video del acto?']) {
      expect(guardQuestion(redact(q)), q).toBe(q);
    }
    expect(guardQuestion(redact('hoy hay que editar el video de la feria del sábado'))).toBe('hoy hay que editar el video de la feria del [fecha]');
    // A landmark with its name is a place in any question.
    expect(guardQuestion(redact('¿qué tomas hago frente a la alcaldía de Táriba?'))).toBe('¿qué tomas hago [direccion]?');
  });

  it('la pregunta que nombra un evento (palabra, título o un nombre de un título), de cómo se hace o no, la contesta 360; se guarda sin sus lugares ni días y no vuelve en el hilo (ronda 3)', async () => {
    const ids = await addEvents(['Toma aérea Tariba', 'Feria de Pirineos', 'Toma aérea Tariba 9 30 frente a la plaza Bolívar']);
    // [who, typed, stored]
    const cases: [DemoUserKey, string, string][] = [
      ['camera', '¿qué tomas hago en la feria frente a la plaza Bolívar?', '¿qué tomas hago en la feria [direccion]?'],
      ['camera', '¿puedo grabar la feria del sábado en la cancha techada de Táriba?', '¿puedo grabar la feria del [fecha] en la [direccion]?'],
      ['camera', '¿qué planos hago en la visita de mañana en el Liceo Simón Bolívar?', '¿qué planos hago en la visita de [fecha] en el [direccion]?'],
      ['camera', '¿qué falta del acto en la Hacienda El Trapiche?', '¿qué falta del acto en la [direccion]?'],
      ['camera', '¿cómo va la visita en Pueblo Nuevo de Táriba, la del 1ro nov?', '¿cómo va la visita en [direccion], la del [fecha]?'],
      // Named by a word of a title the person can see, with no event word.
      ['social', 'lo de Tariba es pasado mañana frente a la plaza Bolívar, ¿qué falta?', 'lo de Tariba es [fecha] [direccion], ¿qué falta?'],
      ['social', 'Pirineos es el sábado en la escuela Los Andes, ¿cómo va?', 'Pirineos es [fecha] en la [direccion], ¿cómo va?'],
      ['social', '¿qué tomas hago en la toma aérea de pasado mañana frente a la alcaldía de Táriba?', '¿qué tomas hago en la toma aérea de [fecha] [direccion]?'],
      // A title typed whole (one of them the demo's own event and its place).
      ['social', '¿cómo subo el video de la Toma aérea Tariba 9 30 frente a la plaza Bolívar?', '¿cómo subo el video de la Toma aérea Tariba [hora] [direccion]?'],
      ['social', '¿cómo va la Feria de emprendedores en la plaza central?', '¿cómo va la Feria de emprendedores en la [direccion]?'],
    ];
    const LEAKS = ['plaza Bolívar', 'Bolívar', 'sábado', 'mañana', 'Hacienda', 'Trapiche', 'Pueblo Nuevo', '1ro nov', 'Liceo', 'cancha techada', 'Los Andes', 'plaza central', 'alcaldía', '9 30', 'Tariba', 'Pirineos', 'feria', 'Feria'];
    try {
      for (const [key, typed, stored] of cases) {
        const p = fakeProvider(() => say('Revisa la ficha del evento. ¿Algo más?'));
        const r = await handleTurn(sessionOf(key), { question: typed }, model(p.fetchImpl));
        expect(r.model, typed).toBe('local');
        const body = await withSystem((sql) => sql.one<{ body: string }>(`select body from public.assistant_messages where conversation_id = $1 and who = 'persona'`, [r.conversationId]));
        expect(body!.body, typed).toBe(stored);
        // The next question goes on with one about an event: 360's too. The one after stands alone and
        // goes to the model, without the questions about the event (nor their answers) in the thread.
        await handleTurn(sessionOf(key), { question: 'gracias', conversationId: r.conversationId }, model(p.fetchImpl));
        const q = fakeProvider(() => say('Claro. ¿Algo más?'));
        const next = await handleTurn(sessionOf(key), { question: '¿cómo hago un copy?', conversationId: r.conversationId }, model(q.fetchImpl));
        expect(next.model, typed).toBe('groq:llama-3.3-70b');
        expect(p.seen, typed).toHaveLength(0);
        const thread = JSON.stringify(q.seen[0].messages.filter((m) => m.role !== 'system').map((m) => m.content));
        for (const leak of LEAKS) expect(thread, `${typed}: ${leak}`).not.toContain(leak);
      }
    } finally {
      await dropEvents(ids);
    }
  });
});

describe('redacción: los formatos que faltaban, sin comerse lo normal', () => {
  it('lo que escribió la plataforma (herramientas, hilo, guiones) pierde todos los formatos de la revisión', () => {
    for (const f of FORMATS) {
      const out = redactQuoted(marked(f));
      expect(out, f).not.toContain(`zqx ${f}`);
      expect(out, f).not.toContain(`${f} wqy`);
    }
    expect(safeTitle('Acto Rubio 12 m frente a la plaza Bolívar')).toBe('Acto Rubio');
    // «escuela Zamorano» names where the visit is: it goes too.
    expect(safeTitle('Visita escuela Zamorano jueves 30 a las 9:00 am, calle 3')).toBe('Visita');
  });

  it('en lo que escribe la persona: los formatos de bajo riesgo siempre; tamaños, cantidades y escalas quedan', () => {
    expect(redact('Caravana 9,30, de 7 a 9 am, el 1ro de noviembre, el día 3 o el 3 del 11, contacto 356-1234 o juan@localhost')).toBe(
      'Caravana [hora], de [hora] a [hora], el [fecha], el [fecha] o el [fecha], contacto [numero] o [correo]',
    );
    expect(redact('a las 9 y 30, 9 con 30, 9 en punto, 12 m')).toBe('a las [hora], [hora], [hora], [hora]');
    for (const t of ['de 3 a 5 segundos', 'entre 2 y 3 personas', 'los califica de 1 a 10', '1500000 vistas', 'un video de 2,50 GB', 'un pasillo de 12 m de largo', 'carrera 5 con calle 7']) {
      expect(redact(t) === t || redact(t).includes('[direccion]'), t).toBe(true);
    }
    expect(redact('de 3 a 5 segundos')).toBe('de 3 a 5 segundos');
    // ISO date-times go whole, before the phone rule (S7), also where times are kept.
    expect(redact('inicio: 2026-11-03T13:30:00Z')).toBe('inicio: [fecha]');
    expect(redactQuoted('2026-11-03T09:30')).toBe('[fecha]');
  });
});
