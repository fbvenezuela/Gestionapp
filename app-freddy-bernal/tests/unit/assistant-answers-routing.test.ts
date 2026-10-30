// The demo brain with 360's answers (D-89, src/lib/assistant/answers/engine.ts), on the demo database: a real agenda
// trap keeps the refusal even with the screens' labels around it; a rule about the date, a label with a time word or a
// question about Mensajes' rules is answered (static, date-free text); the tools only on their intent (the avisos of
// cumplimiento never run «marcar leídos», a tweet is no piece, the best hours never come back degraded); the counts go to
// the person's list; 360 itself, small talk and off-topic; Mensajes asked to be read or told; the screen; a follow-up;
// what política and the IVT upload. Invented data; one turn per question, under the hourly limit (this file's people).
import { describe, it, expect, beforeAll } from 'vitest';
import type { Session } from '@/lib/auth/session';
import { withSystem } from '@/lib/db';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import type { Role } from '@/lib/roles';
import { handleTurn } from '@/lib/assistant';
import { NOT_SURE, NOT_SURE_ADMIN } from '@/lib/assistant/local';
import { MESSAGES_READ_TEXT, MESSAGES_TELL_TEXT } from '@/lib/assistant/messages-ask';

function sessionOf(key: DemoUserKey): Session {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  return { userId: u.id, email: u.email, name: u.name, roles: [...u.roles] as Role[], aal: 'aal2', mfaRequired: false, mfaOk: true, claims: { sub: u.id, aal: 'aal2', role: 'authenticated' }, viewAs: null };
}

const REFUSAL = /no lo manejo|no la tengo/;
type Expect = { has?: RegExp; not?: RegExp; tool?: string; notTool?: string; go?: string; tutorial?: string; agenda?: true; is?: string; screen?: string; thread?: string[] };
const A: Expect = { agenda: true };

const TABLE: Partial<Record<DemoUserKey, [string, Expect][]>> = {
  camera: [
    // A trap with a label around it, or a label inside it: still the refusal.
    ['¿A qué hora es la feria de «Por ponerle fecha»?', A],
    ['en «Hoy en la agenda» sale la jornada de salud, ¿a qué hora es?', A],
    ['¿Cuál es el teléfono del contacto del sitio de la jornada de salud?', A],
    ['¿puedo saber a qué hora es la jornada de salud?', A],
    // A label with a time word, asked for what it means.
    ['¿Qué sale en «Hoy en la agenda»?', { has: /Hoy en la agenda/ }],
    // A rule: what goes in the note for the editor.
    ['puedo poner en la nota a que hora llego el gobernador', { not: REFUSAL }],
    // The person's own list, counted.
    ['¿qué tengo que subir hoy?', { tool: 'mis_pendientes' }],
    // The screen the person is on, and its tutorial.
    ['que es esto', { screen: '/hoy', has: /Lo que espera por mí/, tutorial: 'hoy-grabacion' }],
    // A follow-up: the next task of the guide.
    ['¿y después?', { thread: ['¿Cómo subo el material?'], has: /entrega|storyboard/i }],
  ],
  dispatch: [
    ['en «Hoy en la agenda» sale la entrega de viviendas, ¿dónde queda?', A],
    ['¿Qué pongo en «A dónde se va»?', { not: REFUSAL }],
    ['¿Qué es «Por ponerle fecha»?', { has: /fichas del IVT/, not: REFUSAL }],
    ['¿Grabación ve la fecha del evento que le asigné?', { not: REFUSAL }],
    ['se cambio la hora de la entrega de viviendas como la cambio en la plataforma', { has: /«Mover»|«Cambiar fecha o lugar»/, not: REFUSAL }],
  ],
  boss: [
    ['¿Dónde queda la escuela Los Andes? Lo necesito para «Horas de silencio»', A],
    ['a que hora nos va mejor publicando', { tool: 'mejores_horas' }],
    ['¿Puedo poner la hora en el título del evento?', { has: /^No/, not: REFUSAL }],
    ['¿Puedes publicar por mí?', { has: /^No: yo no publico/ }],
    ['¿Cómo estás?', { has: /Todo bien|Bien, gracias/ }],
    ['resumeme lo que hablaron en el canal de obras y comunidad', { is: MESSAGES_READ_TEXT, go: '/mensajes' }],
    ['¿Cómo le pongo fecha a una ficha de obra?', { has: /Ponerle fecha/, not: REFUSAL }],
  ],
  social: [
    ['puedo borrar un aviso de cumplimiento', { notTool: 'marcar_avisos_leidos' }],
    ['si edito un tweet que ya aprobaron que pasa', { notTool: 'estado_pieza', has: /vuelve al jefe/ }],
    ['a que hora publico los tweets', { tool: 'mejores_horas', has: /^X:/ }],
    ['como hago una historia para instagram', { notTool: 'mejores_horas', not: /Mejores horas/ }],
    ['por que no veo la fecha de los eventos', { has: /seguridad|sin fecha/, not: REFUSAL }],
    ['vaciar este mes borra todo?', { screen: '/redes/feed', has: /Sin programar|no se borra/, not: REFUSAL }],
    ['avisale al jefe que ya mande la pieza a aprobacion', { is: MESSAGES_TELL_TEXT, go: '/mensajes' }],
  ],
  social2: [
    ['eres bien bruto', { has: /algo no salió bien/ }],
    // After a question about an event, «¿y a qué hora es?» is the agenda.
    ['y a que hora es', { thread: ['¿cómo va lo de la cancha?'], ...A }],
  ],
  politics: [
    ['¿Qué sabes hacer?', { has: /No leo Mensajes/ }],
    ['¿cuántas vencidas tengo?', { tool: 'mis_pendientes' }],
    ['¿Por qué no me sale la fecha de mi actividad?', { not: REFUSAL }],
    ['¿Cómo hago para que no me suene el teléfono de noche?', { has: /Horas de silencio/, not: REFUSAL }],
    ['mandale un msj al jefe q ya cargue la ficha', { is: MESSAGES_TELL_TEXT }],
    // Política uploads the evidencias of its ficha (not «desde tu rol no se sube material»).
    ['como subo las fotos del antes', { screen: '/reportes/[id]', has: /Subir fotos del antes/, not: /no se sube material/ }],
  ],
  ivt: [
    ['¿Quién ve lo que te pregunto?', { has: /Administración ve lo que me preguntas/ }],
    ['grax pana', { not: /No estoy seguro/ }],
    ['¿Va a llover hoy en San Cristóbal?', { has: /se me escapa|no opino/ }],
    ['cuantas obras esperando fecha tengo', { tool: 'mis_pendientes' }],
    ['¿Puedo poner la fecha de la visita en el nombre de la obra?', { not: REFUSAL }],
  ],
  admin: [
    ['¿Quién ve lo que le preguntan a 360?', { has: /Conversaciones/ }],
    ['que es esto', { screen: '/ajustes/contenido', has: /cupo del mes/i }],
    // Administración is never offered to tell administración.
    ['como cocino una arepa', { is: NOT_SURE_ADMIN }],
  ],
};

let secrets: string[] = [];
beforeAll(async () => {
  const rows = await withSystem((sql) =>
    sql.query<{ starts_at: Date; exact_address: string; directions: string; site_contacts: string }>(`select starts_at, exact_address, directions, site_contacts from public.event_schedule`),
  );
  secrets = rows.flatMap((r) => [r.exact_address, r.directions, r.site_contacts, new Date(r.starts_at).toISOString().slice(0, 16)]).filter((x) => x && x.length > 3);
  expect(secrets.length).toBeGreaterThan(5);
});

describe('360 con sus respuestas: la negativa solo para la agenda de verdad, y cada pregunta a lo suyo', () => {
  for (const [role, rows] of Object.entries(TABLE) as [DemoUserKey, [string, Expect][]][]) {
    it(`${role}: cada pregunta tiene lo suyo`, async () => {
      for (const [q, e] of rows) {
        let conversationId: string | null = null;
        for (const t of e.thread ?? []) conversationId = (await handleTurn(sessionOf(role), { question: t, conversationId, screen: e.screen }, { chain: [] })).conversationId;
        const r = await handleTurn(sessionOf(role), { question: q, conversationId, screen: e.screen }, { chain: [] });
        const who = `${role}: ${q} → ${r.answer}`;
        const tools = r.did.map((d) => d.tool);
        expect(r.model, who).toBe('local');
        expect(r.degraded, who).toBe(false);
        for (const s of secrets) expect(r.answer, who).not.toContain(s);
        if (e.agenda) {
          expect(r.answer, who).toMatch(REFUSAL);
          expect(tools.filter((t) => t !== 'buscar_evento'), who).toEqual([]);
          continue;
        }
        if (!tools.some((t) => t === 'mejores_horas' || t === 'reglas_de_video')) expect(r.answer, who).not.toMatch(/\b\d{1,2}:\d{2}\b/);
        if (e.is) expect(r.answer, who).toBe(e.is);
        if (e.has) expect(r.answer, who).toMatch(e.has);
        if (e.not) expect(r.answer, who).not.toMatch(e.not);
        if (e.tool) expect(tools, who).toContain(e.tool);
        if (e.notTool) expect(tools, who).not.toContain(e.notTool);
        if (e.go) expect(r.goTo?.href, who).toBe(e.go);
        if (e.tutorial) expect(r.tutorial?.id, who).toBe(e.tutorial);
      }
    });
  }

  it('un «no estoy seguro» del equipo sigue ofreciendo avisar a administración', async () => {
    const r = await handleTurn(sessionOf('camera'), { question: 'como cocino una arepa' }, { chain: [] });
    expect(r.answer).toBe(NOT_SURE);
  });
});
