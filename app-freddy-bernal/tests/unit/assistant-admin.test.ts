// The panel's server functions (Ajustes → Asistente), the health check and the factory
// material's own rules.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import type { Session } from '@/lib/auth/session';
import { withSystem } from '@/lib/db';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import { INVITABLE_ROLES, ROLES, type Role } from '@/lib/roles';
import * as admin from '@/lib/assistant/admin';
import { handleTurn, assistantHealthCheck } from '@/lib/assistant';
import { FACTORY_KNOWLEDGE, FACTORY_SCRIPTS, ROLE_BRIEFS, suggestedQuestions } from '@/lib/assistant/config';
import { variantsOf } from '@/lib/assistant/local';
import { getClientConfig } from '@/lib/client-config';

function sessionOf(key: DemoUserKey, mfaOk = true): Session {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  return { userId: u.id, email: u.email, name: u.name, roles: [...u.roles] as Role[], aal: 'aal2', mfaRequired: true, mfaOk, claims: { sub: u.id, aal: 'aal2', role: 'authenticated' }, viewAs: null };
}
const A = sessionOf('admin');
const ID = '123e4567-e89b-42d3-a456-426614174000';

describe('el panel: solo administración (con doble factor)', () => {
  const calls: [string, (s: Session) => Promise<unknown>][] = [
    ['listKnowledge', (s) => admin.listKnowledge(s)],
    ['saveKnowledge', (s) => admin.saveKnowledge(s, { title: 'x', body: 'y' })],
    ['toggleKnowledge', (s) => admin.toggleKnowledge(s, ID, false)],
    ['refreshKnowledge', (s) => admin.refreshKnowledge(s)],
    ['listScripts', (s) => admin.listScripts(s)],
    ['saveScript', (s) => admin.saveScript(s, { topic: 'x', script: '[ASISTENTE]: y' })],
    ['toggleScript', (s) => admin.toggleScript(s, ID, false)],
    ['testScripts', (s) => admin.testScripts(s, 'hola')],
    ['listConversations', (s) => admin.listConversations(s)],
    ['getConversation', (s) => admin.getConversation(s, ID)],
    ['heardGrouped', (s) => admin.heardGrouped(s)],
    ['discardHeard', (s) => admin.discardHeard(s, [ID])],
    ['linkHeard', (s) => admin.linkHeard(s, [ID], ID)],
    ['listDrafts', (s) => admin.listDrafts(s)],
    ['confirmDraft', (s) => admin.confirmDraft(s, ID)],
    ['discardDraft', (s) => admin.discardDraft(s, ID)],
    ['listActions', (s) => admin.listActions(s)],
    ['undoAction', (s) => admin.undoAction(s, ID)],
    ['healthStats', (s) => admin.healthStats(s)],
    ['probeChain', (s) => admin.probeChain(s)],
    ['getProfile', (s) => admin.getProfile(s)],
    ['saveProfile', (s) => admin.saveProfile(s, { name: 'X' })],
  ];
  it('cubre todas las funciones exportadas', () => {
    const exported = Object.entries(admin).filter(([, v]) => typeof v === 'function' && v !== admin.AssistantAdminError).map(([k]) => k).sort();
    expect(calls.map(([n]) => n).sort()).toEqual(exported);
  });
  for (const [name, fn] of calls) {
    it(`${name}: rechaza a quien no es administración, y a administración sin doble factor`, async () => {
      for (const s of [sessionOf('social'), sessionOf('politics'), sessionOf('boss'), sessionOf('admin', false)]) {
        await expect(fn(s)).rejects.toBeInstanceOf(admin.AssistantAdminError);
      }
    });
  }
});

describe('lo que sabe y cómo contesta', () => {
  it('editar una ficha automática la vuelve del equipo y «Actualizar» ya no la pisa', async () => {
    const auto = (await admin.listKnowledge(A, { q: 'semaforo de aprobacion' })).find((k) => k.key === 'auto:semaforo')!;
    expect(auto.automatic).toBe(true);
    const saved = await admin.saveKnowledge(A, { id: auto.id, title: auto.title, body: 'Semáforo explicado por el equipo.', roles: null, tags: ['aprobar'] });
    expect(saved.origin).toBe('equipo');
    expect(await admin.refreshKnowledge(A)).toBeGreaterThan(10);
    const after = (await admin.listKnowledge(A)).find((k) => k.id === auto.id)!;
    expect(after.body).toBe('Semáforo explicado por el equipo.');
  });

  it('nunca guarda fechas en lo que sabe o dice (va al proveedor)', async () => {
    await expect(admin.saveKnowledge(A, { title: 'Evento', body: 'Es el lunes 3 de noviembre.' })).rejects.toThrow(/fechas/);
    await expect(admin.saveScript(A, { topic: 'x', script: '[ASISTENTE]: el 24/10 hay acto' })).rejects.toThrow(/fechas/);
    await expect(admin.saveScript(A, { topic: 'x', script: 'sin variantes' })).rejects.toThrow(/\[ASISTENTE\]/);
  });

  it('un guion de fábrica editado pasa a ser del equipo; el probador no gasta usos', async () => {
    const s = (await admin.listScripts(A, { q: 'tweets' })).find((x) => x.key === 'fabrica:dias-tweets')!;
    const r = await admin.saveScript(A, { id: s.id, topic: s.topic, triggers: [...s.triggers, 'stock de tweets'], script: s.script, roles: s.roles });
    expect(r.origin).toBe('equipo');
    const before = s.times_used;
    const picked = await admin.testScripts(A, '¿cuántos días de tweets quedan?', ['social']);
    expect(picked.map((p) => p.key)).toContain('fabrica:dias-tweets');
    const again = (await admin.listScripts(A)).find((x) => x.id === s.id)!;
    expect(again.times_used).toBe(before);
    const fromConv = await admin.saveScript(A, { topic: 'Así se contesta', script: 'Persona: hola\n[ASISTENTE]: ¡Hola!', fromConversation: true });
    expect(fromConv.origin).toBe('conversacion');
  });
});

describe('conversaciones, lo que preguntan, salud y ajustes', () => {
  it('lista y abre conversaciones con sus mensajes; agrupa lo que preguntan', async () => {
    const t1 = await handleTurn(sessionOf('camera'), { question: '¿Cómo subo el material del evento?' }, { chain: [] });
    await handleTurn(sessionOf('social'), { question: '¿Cómo subo el material del evento?' }, { chain: [] });
    const list = await admin.listConversations(A, { limit: 200 });
    expect(list.some((c) => c.id === t1.conversationId && c.messages === 2)).toBe(true);
    const conv = await admin.getConversation(A, t1.conversationId!);
    expect(conv!.messages.map((m) => m.who)).toEqual(['persona', 'asistente']);
    const heard = await admin.heardGrouped(A);
    const g = heard.find((h) => h.plain === 'como subo el material del evento');
    expect(g?.times).toBe(2);
    await admin.discardHeard(A, g!.ids);
    expect((await admin.heardGrouped(A)).find((h) => h.plain === 'como subo el material del evento')).toBeUndefined();
  });

  it('cómo va: por día, por modelo y qué claves hay (sin valores); probar la cadena en demo', async () => {
    const h = await admin.healthStats(A);
    expect(h.demo).toBe(true);
    expect(h.days.length).toBeGreaterThan(0);
    expect(h.byModel.some((m) => m.model === 'local')).toBe(true);
    expect(await admin.probeChain(A)).toEqual([expect.objectContaining({ link: 'local', ok: true })]);
  });

  it('aviso de salud: más del 20 % degradadas en la última hora → administración, como mucho cada 6 horas', async () => {
    const conv = (await handleTurn(sessionOf('boss'), { question: 'hola' }, { chain: [] })).conversationId;
    await withSystem(async (sql) => {
      for (let i = 0; i < 10; i++) await sql.query(`insert into public.assistant_messages (conversation_id, who, body, degraded) values ($1, 'asistente', 'No pude consultar bien ahora mismo.', true)`, [conv]);
    });
    const r1 = await assistantHealthCheck();
    expect(r1.notified).toBe(true);
    expect(r1.ratio).toBeGreaterThan(0.2);
    const r2 = await assistantHealthCheck();
    expect(r2.notified).toBe(false);
    const n = await withSystem((sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.notifications where kind = 'assistant_health' and user_id = $1`, [A.userId]));
    expect(n!.n).toBe(1);
  });

  it('nombre, cara y presentación se cambian sin desplegar', async () => {
    const def = await admin.getProfile(A);
    expect(def.name).toBe((getClientConfig() as { assistant?: { name: string } }).assistant?.name);
    await admin.saveProfile(A, { name: 'Lupe', emoji: '🤖', intro: 'Soy Lupe.' });
    const r = await handleTurn(sessionOf('social'), { question: '¿cómo te llamas?' }, { chain: [] });
    expect(r.answer).toContain('Lupe');
    await withSystem((sql) => sql.query(`delete from public.app_settings where key = 'assistant'`));
  });
});

describe('el material de fábrica cumple sus reglas', () => {
  const brand = getClientConfig().brand;
  const clientWords = [brand.clientName, ...brand.clientName.split(' '), brand.region, brand.clientTitle, brand.programName].filter((w) => w && w.length > 3);
  const files = fs.readdirSync('config/assistant').map((f) => fs.readFileSync(`config/assistant/${f}`, 'utf8'));

  it('nada del cliente en config/assistant ni en el código del asistente', () => {
    // Its files and the answers' folder (D-89).
    const code = fs.readdirSync('src/lib/assistant', { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.ts')).map((f) => fs.readFileSync(`src/lib/assistant/${f}`, 'utf8'));
    for (const text of [...files, ...code]) for (const w of clientWords) expect(text).not.toContain(w);
  });

  it('entre 20 y 30 guiones; uno solo «siempre»; cada uno con 2 o 3 variantes y sin horas ni fechas', () => {
    expect(FACTORY_SCRIPTS.length).toBeGreaterThanOrEqual(20);
    expect(FACTORY_SCRIPTS.length).toBeLessThanOrEqual(30);
    expect(FACTORY_SCRIPTS.filter((s) => s.always).map((s) => s.key)).toEqual(['fuera-de-tema']);
    for (const s of FACTORY_SCRIPTS) {
      expect(variantsOf(s.script).length, s.key).toBeGreaterThanOrEqual(2);
      expect(s.script, s.key).toMatch(/^Persona:/);
      expect(s.script, s.key).not.toMatch(/\b\d{1,2}:\d{2}\b|\b\d{1,2}\/\d{1,2}\b/);
      if (!s.always) expect(s.triggers.length, s.key).toBeGreaterThan(2);
      for (const r of s.roles ?? []) expect(ROLES).toContain(r);
    }
    expect(new Set(FACTORY_SCRIPTS.map((s) => s.key)).size).toBe(FACTORY_SCRIPTS.length);
  });

  it('incluye los temas que todo asistente necesita', () => {
    const keys = FACTORY_SCRIPTS.map((s) => s.key);
    for (const k of ['quien-eres', 'saludo', 'eres-bot', 'hablar-persona', 'algo-falla', 'agenda-privada', 'fuera-de-tema']) expect(keys).toContain(k);
    expect(FACTORY_SCRIPTS.find((s) => s.key === 'hablar-persona')!.script).toContain('[usa avisar_al_equipo]');
  });

  it('fichas de la guía por rol, con roles válidos; oficio y sugerencias para cada rol del equipo', () => {
    expect(FACTORY_KNOWLEDGE.length).toBeGreaterThan(20);
    for (const k of FACTORY_KNOWLEDGE) for (const r of k.roles ?? []) expect(INVITABLE_ROLES as readonly string[]).toContain(r);
    for (const s of FACTORY_SCRIPTS) for (const r of s.roles ?? []) expect(INVITABLE_ROLES as readonly string[]).toContain(r);
    // The six team roles and Administración; the retired ones have no brief, guide card or script any more.
    for (const r of INVITABLE_ROLES) {
      expect(ROLE_BRIEFS[r]?.oficio, r).toBeTruthy();
      expect(FACTORY_KNOWLEDGE.some((k) => k.roles?.includes(r) && k.key.startsWith('rol-')), r).toBe(true);
    }
    for (const r of ['secretary', 'supervisor'] as Role[]) expect(ROLE_BRIEFS[r], r).toBeUndefined();
    expect(suggestedQuestions(['boss'], 'el jefe').length).toBeGreaterThan(0);
  });

  it('R3: el guion «tutorial» (el 30, el tope) y las fichas de Mensajes, de los tutoriales y de la guía, para todos', () => {
    expect(FACTORY_SCRIPTS.length).toBe(30);
    expect(FACTORY_SCRIPTS.find((s) => s.key === 'tutorial')!.script).toContain('[usa ver_tutorial]');
    for (const k of ['mensajes', 'tutoriales', 'ayuda-guias']) expect(FACTORY_KNOWLEDGE.find((x) => x.key === k)?.roles, k).toBeNull();
    const m = FACTORY_KNOWLEDGE.find((x) => x.key === 'mensajes')!.body;
    expect(m).not.toMatch(/puede leer|no se borra|no las lee/);
    for (const w of [/Son canales/, /El jefe arma los canales, decide quién va en cada uno y está en todos/, /cada quien ve solo los canales donde está/, /Nunca van teléfonos/, /fechas, horas ni mapas/, /Enter hace un salto de línea/]) expect(m).toMatch(w);
  });

  it('las herramientas nunca tocan la agenda privada', () => {
    const src = fs.readFileSync('src/lib/assistant/tools.ts', 'utf8');
    expect(src).not.toMatch(/event_schedule|event_calendar|starts_at|exact_address|site_contacts|directions/);
  });
});
