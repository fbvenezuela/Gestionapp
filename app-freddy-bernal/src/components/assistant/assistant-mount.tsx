import 'server-only';
import { getSession, menuRoles } from '@/lib/auth/session';
import { env } from '@/lib/env';
import { TEAM_ROLES, isTeamMember } from '@/lib/assistant';
import { defaultProfile, suggestedQuestions } from '@/lib/assistant/config';
import { db } from '@/lib/assistant/db';
import { assistantWindowData } from '@/lib/data/assistant-server';
import { toursForRoles } from '@/lib/guides';
import { AssistantWidget } from './assistant-widget';
import type { OfferTour } from './offer-core';

// Mounts the assistant's window once, from the panel layout, for every team role. Reads on
// the server (as the person, RLS on, marked as 360's: app.caller) the assistant's name, face and
// intro and the suggested first questions for the person's roles. Nothing about other people
// reaches the browser. The person's tutorials go too, without their steps (id, screen, title and
// whether it is a form): the same list the tutorials' engine gets from the layout (the menu's
// roles, so they follow «Ver como»; Mensajes' never for an account with Administración), for the
// offer of R3 (D-47).
export async function AssistantMount() {
  if (!env.assistant.enabled) return null;
  const s = await getSession();
  // Same checks as /api/asistente: signed in, 2FA done when the role needs it, a team role.
  if (!s || !s.mfaOk || !isTeamMember(s)) return null;
  const roles = s.roles.filter((r) => TEAM_ROLES.includes(r));
  const data = await db(s, (sql) => assistantWindowData(sql, roles)).catch((e) => {
    console.error('[asistente] no se pudo leer el perfil de la ventana:', (e as Error).message);
    return null;
  });
  const tours: OfferTour[] = toursForRoles(menuRoles(s), { admin: s.roles.includes('admin') }).map((t) => ({ id: t.id, screen: t.screen, title: t.title, ...(t.form ? { form: true } : {}) }));
  return <AssistantWidget userId={s.userId} profile={data?.profile ?? defaultProfile()} suggestions={data?.suggestions ?? suggestedQuestions(roles)} tours={tours} />;
}
