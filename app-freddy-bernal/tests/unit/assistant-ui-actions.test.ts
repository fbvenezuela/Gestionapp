// Server actions of Ajustes → Asistente (src/lib/actions/assistant.ts) against the demo
// database: validation, «solo administración», and the panel's flows end to end (teach a
// fact, keep a real answer, confirm a prepared notice, undo what it did). Only the session
// and Next's cache are faked.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Session } from '@/lib/auth/session';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import type { Role } from '@/lib/roles';

const state: { session: Session | null } = { session: null };
const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock('@/lib/auth/session', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/session')>()),
  requireSession: vi.fn(async () => state.session),
}));

const actions = await import('@/lib/actions/assistant');
const admin = await import('@/lib/assistant/admin');
const { handleTurn } = await import('@/lib/assistant');
const { withSystem } = await import('@/lib/db');

function sessionOf(key: DemoUserKey, mfaOk = true): Session {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  return { userId: u.id, email: u.email, name: u.name, roles: [...u.roles] as Role[], aal: 'aal2', mfaRequired: true, mfaOk, claims: { sub: u.id, aal: 'aal2', role: 'authenticated' }, viewAs: null };
}
const A = sessionOf('admin');
const ID = '123e4567-e89b-42d3-a456-426614174000';
const noTool = { chain: [] };

beforeEach(() => {
  state.session = A;
  revalidatePath.mockClear();
});

describe('acciones del panel: validación y permiso', () => {
  it('valida antes de tocar la base, con mensajes cortos', async () => {
    expect(await actions.saveAssistantKnowledge({ title: '', body: 'x' })).toEqual({ ok: false, error: 'Falta el título.' });
    expect(await actions.saveAssistantScript({ topic: 'x', script: 'sin variantes' })).toMatchObject({ ok: false, error: expect.stringMatching(/\[ASISTENTE\]/) });
    expect(await actions.toggleAssistantScript({ id: 'no-es-id', active: true })).toEqual({ ok: false, error: 'Falta un id válido.' });
    expect(await actions.discardAssistantHeard({ ids: [] })).toEqual({ ok: false, error: 'No hay nada marcado.' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('quien no es administración (o no hizo el doble factor) recibe el «no» del servidor, en español', async () => {
    for (const s of [sessionOf('social'), sessionOf('supervisor'), sessionOf('boss'), sessionOf('admin', false)]) {
      state.session = s;
      for (const r of [
        await actions.refreshAssistantKnowledge(),
        await actions.saveAssistantKnowledge({ title: 'x', body: 'y' }),
        await actions.undoAssistantAction({ id: ID }),
        await actions.probeAssistantChain(),
        await actions.saveAssistantProfile({ name: 'X' }),
      ]) {
        expect(r).toEqual({ ok: false, error: 'Solo administración puede ver y cambiar el asistente.' });
      }
    }
  });

  it('nunca guarda fechas en lo que sabe (va al proveedor de IA)', async () => {
    const r = await actions.saveAssistantKnowledge({ title: 'Acto', body: 'Es el 24/10 en la plaza.' });
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/fechas/) });
  });
});

describe('acciones del panel: los flujos', () => {
  it('«Enseñarle el dato»: crea la ficha y esas preguntas salen de «Lo que preguntan»', async () => {
    await handleTurn(sessionOf('camera'), { question: '¿Quién me presta el trípode del equipo?' }, noTool);
    const g = (await admin.heardGrouped(A)).find((h) => h.plain === 'quien me presta el tripode del equipo')!;
    expect(g).toBeTruthy();
    const r = await actions.saveAssistantKnowledge({ title: 'Préstamo del trípode', body: 'El trípode lo presta administración.', roles: ['camera'], heardIds: g.ids });
    expect(r.ok).toBe(true);
    expect((await admin.heardGrouped(A)).find((h) => h.plain === g.plain)).toBeUndefined();
    const k = (await admin.listKnowledge(A, { q: 'tripode' })).find((x) => x.title === 'Préstamo del trípode')!;
    expect(k).toMatchObject({ origin: 'equipo', roles: ['camera'], active: true });
    expect(revalidatePath).toHaveBeenCalledWith('/ajustes/asistente');

    expect((await actions.toggleAssistantKnowledge({ id: k.id, active: false })).ok).toBe(true);
    expect((await admin.listKnowledge(A, { q: 'tripode' })).find((x) => x.id === k.id)?.active).toBe(false);
  });

  it('«Enseñarle cómo contestar»: el guion queda y la pregunta sale de la lista', async () => {
    await handleTurn(sessionOf('secretary'), { question: '¿Dónde dejo las tarjetas de invitación?' }, noTool);
    const g = (await admin.heardGrouped(A)).find((h) => h.plain === 'donde dejo las tarjetas de invitacion')!;
    const r = await actions.saveAssistantScript({ topic: 'Tarjetas', triggers: ['tarjetas de invitacion'], script: `Persona: ${g.sample}\n[ASISTENTE]: Pregúntale a administración.`, heardIds: g.ids });
    expect(r).toMatchObject({ ok: true, data: { origin: 'equipo' } });
    expect((await admin.heardGrouped(A)).find((h) => h.plain === g.plain)).toBeUndefined();
  });

  it('«Así se contesta»: una respuesta real se vuelve guion «de una conversación real», con el nombre como hueco', async () => {
    const t = await handleTurn(sessionOf('social'), { question: '¿Cómo te llamas?' }, noTool);
    const conv = (await admin.getConversation(A, t.conversationId!))!;
    const answer = conv.messages.find((m) => m.who === 'asistente')!;
    const { name } = await admin.getProfile(A);
    expect(answer.body).toContain(name);
    const r = await actions.saveAnswerAsExample({ conversationId: conv.id, messageId: answer.id });
    expect(r).toMatchObject({ ok: true, data: { origin: 'conversacion' } });
    const saved = (await admin.listScripts(A)).find((x) => x.id === (r as { data: { id: string } }).data.id)!;
    expect(saved.script.startsWith('Persona: ¿Cómo te llamas?\n[ASISTENTE]: ')).toBe(true);
    expect(saved.script).toContain('[ASISTENTE]');
    expect(saved.script.split('\n')[1]).not.toContain(name);
    // The tester finds it, without counting a use.
    const picked = await actions.testAssistantScripts({ question: '¿Cómo te llamas?', role: 'social' });
    expect(picked.ok).toBe(true);
    expect(saved.times_used).toBe((await admin.listScripts(A)).find((x) => x.id === saved.id)!.times_used);

    expect(await actions.saveAnswerAsExample({ conversationId: conv.id, messageId: ID })).toEqual({ ok: false, error: 'No encontré esa respuesta con su pregunta.' });
  });

  it('«Por confirmar»: un aviso preparado se descarta una sola vez', async () => {
    await handleTurn(A, { question: 'Prepara un aviso a redes que revisen la biblioteca' }, noTool);
    const d = (await admin.listDrafts(A)).find((x) => x.body.includes('revisen la biblioteca'))!;
    expect(d).toBeTruthy();
    expect((await actions.discardAssistantDraft({ id: d.id })).ok).toBe(true);
    expect(await actions.discardAssistantDraft({ id: d.id })).toEqual({ ok: false, error: 'Ese borrador ya no está pendiente.' });
    expect(await actions.confirmAssistantDraft({ id: d.id })).toEqual({ ok: false, error: 'Ese borrador ya no está pendiente.' });
  });

  it('«Lo que hizo»: marcar avisos como leídos se deshace una vez', async () => {
    const social = sessionOf('social2');
    await withSystem((sql) => sql.query(`insert into public.notifications (user_id, kind, title, body) values ($1, 'prueba', 'Aviso inventado', 'Para probar')`, [social.userId]));
    await handleTurn(social, { question: 'Marca mis avisos como leídos' }, noTool);
    const a = (await admin.listActions(A)).find((x) => x.action === 'marcar_avisos_leidos' && x.undoable)!;
    expect(a).toBeTruthy();
    expect((await actions.undoAssistantAction({ id: a.id })).ok).toBe(true);
    const unread = await withSystem((sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.notifications where user_id = $1 and read_at is null`, [social.userId]));
    expect(unread!.n).toBeGreaterThan(0);
    expect(await actions.undoAssistantAction({ id: a.id })).toEqual({ ok: false, error: 'Eso ya se deshizo.' });
  });

  it('«Cómo va» y «Ajustes»: probar la cadena en demo; el nombre se cambia y refresca la ventana de todos', async () => {
    expect(await actions.probeAssistantChain()).toMatchObject({ ok: true, data: [expect.objectContaining({ link: 'local', ok: true })] });
    expect((await actions.refreshAssistantKnowledge()).ok).toBe(true);
    const r = await actions.saveAssistantProfile({ name: '  Lupe ', emoji: '🤖', intro: 'Soy Lupe.' });
    expect(r).toMatchObject({ ok: true, data: { name: 'Lupe', emoji: '🤖', intro: 'Soy Lupe.' } });
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
    expect(await actions.saveAssistantProfile({ name: 'Lupe', intro: 'Te veo el 3 de noviembre.' })).toMatchObject({ ok: false, error: expect.stringMatching(/fechas/) });
    await withSystem((sql) => sql.query(`delete from public.app_settings where key = 'assistant'`));
  });
});
