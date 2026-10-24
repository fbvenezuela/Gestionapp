'use server';

import type { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireSession, type Session } from '../auth/session';
import * as admin from '../assistant/admin';
import {
  PANEL_PATH,
  exampleSchema,
  idSchema,
  idsSchema,
  knowledgeSchema,
  pairAnswers,
  profileSchema,
  scriptFromAnswer,
  scriptSchema,
  testSchema,
  toggleSchema,
} from '@/components/assistant/panel-core';
import type { Result } from './run';

// Server actions of Ajustes → Asistente. Validated with zod like act(), but they do NOT run
// inside withUser: the backend's admin functions use withSystem for the assistant's tables,
// and nesting withSystem inside withUser deadlocks the demo database. Every admin function
// checks itself that the caller is administration with 2FA (AssistantAdminError otherwise).

async function panel<I, T>(
  schema: z.ZodType<I, unknown>,
  raw: unknown,
  fn: (s: Session, input: I) => Promise<T>,
  opts: { layout?: boolean } = {},
): Promise<Result<T>> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Revisa los datos.' };
  const s = await requireSession();
  try {
    const data = await fn(s, parsed.data);
    revalidatePath(PANEL_PATH);
    // The window's name, face and intro live in the panel layout.
    if (opts.layout) revalidatePath('/', 'layout');
    return { ok: true, data };
  } catch (e) {
    if (e instanceof admin.AssistantAdminError) return { ok: false, error: e.message };
    console.error('[asistente:panel]', (e as Error).message);
    return { ok: false, error: 'No se pudo hacer. Intenta de nuevo en un momento.' };
  }
}

const nothing = { safeParse: () => ({ success: true as const, data: undefined }) } as unknown as z.ZodType<undefined, unknown>;
const orNull = <T,>(v: T[]) => (v.length ? v : null);

// Lo que sabe ----------------------------------------------------------------
export async function saveAssistantKnowledge(raw: unknown) {
  return panel(knowledgeSchema, raw, async (s, i) => {
    const row = await admin.saveKnowledge(s, { id: i.id ?? null, title: i.title, body: i.body, roles: orNull(i.roles), tags: i.tags, active: i.active });
    if (i.heardIds.length) await admin.linkHeard(s, i.heardIds, row.id);
    return row;
  });
}

export async function toggleAssistantKnowledge(raw: unknown) {
  return panel(toggleSchema, raw, (s, i) => admin.toggleKnowledge(s, i.id, i.active));
}

export async function refreshAssistantKnowledge() {
  return panel(nothing, undefined, (s) => admin.refreshKnowledge(s));
}

// Cómo contesta ----------------------------------------------------------------
export async function saveAssistantScript(raw: unknown) {
  return panel(scriptSchema, raw, async (s, i) => {
    const row = await admin.saveScript(s, {
      id: i.id ?? null,
      topic: i.topic,
      triggers: i.triggers,
      script: i.script,
      notes: i.notes,
      always: i.always,
      roles: orNull(i.roles),
      active: i.active,
      fromConversation: i.fromConversation,
    });
    // Taught how to answer: those questions leave «Lo que preguntan».
    if (i.heardIds.length) await admin.discardHeard(s, i.heardIds);
    return row;
  });
}

export async function toggleAssistantScript(raw: unknown) {
  return panel(toggleSchema, raw, (s, i) => admin.toggleScript(s, i.id, i.active));
}

/** The tester: which scripts a question would bring. No model call, no usage counted. */
export async function testAssistantScripts(raw: unknown) {
  return panel(testSchema, raw, (s, i) => admin.testScripts(s, i.question, i.role ? [i.role] : undefined));
}

// Conversaciones ----------------------------------------------------------------
/** «Así se contesta»: that real answer becomes an example script («de una conversación real»). */
export async function saveAnswerAsExample(raw: unknown) {
  return panel(exampleSchema, raw, async (s, i) => {
    const conv = await admin.getConversation(s, i.conversationId);
    const pair = conv ? pairAnswers(conv.messages).find((p) => p.answer.id === i.messageId) : undefined;
    if (!pair || !pair.question.trim()) throw new admin.AssistantAdminError('No encontré esa respuesta con su pregunta.');
    if (pair.answer.degraded || pair.answer.error) throw new admin.AssistantAdminError('Esa respuesta salió con problemas: mejor usa «Corregir».');
    const { name } = await admin.getProfile(s);
    const draft = scriptFromAnswer(pair.question, pair.answer.body, name);
    return admin.saveScript(s, { ...draft, notes: 'Guardado con «Así se contesta».', fromConversation: true });
  });
}

// Lo que preguntan ----------------------------------------------------------------
export async function discardAssistantHeard(raw: unknown) {
  return panel(idsSchema, raw, (s, i) => admin.discardHeard(s, i.ids));
}

// Por confirmar ----------------------------------------------------------------
export async function confirmAssistantDraft(raw: unknown) {
  return panel(idSchema, raw, (s, i) => admin.confirmDraft(s, i.id));
}

export async function discardAssistantDraft(raw: unknown) {
  return panel(idSchema, raw, (s, i) => admin.discardDraft(s, i.id));
}

// Lo que hizo ----------------------------------------------------------------
export async function undoAssistantAction(raw: unknown) {
  return panel(idSchema, raw, (s, i) => admin.undoAction(s, i.id));
}

// Cómo va ----------------------------------------------------------------
/** «Probar la cadena»: says which model answers and the exact error of the rest. */
export async function probeAssistantChain() {
  return panel(nothing, undefined, (s) => admin.probeChain(s));
}

// Ajustes ----------------------------------------------------------------
export async function saveAssistantProfile(raw: unknown) {
  return panel(profileSchema, raw, (s, i) => admin.saveProfile(s, i), { layout: true });
}
