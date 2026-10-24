import 'server-only';
import { db, getSession } from '@/lib/auth/session';
import { env } from '@/lib/env';
import { TEAM_ROLES, isTeamMember } from '@/lib/assistant';
import { defaultProfile, suggestedQuestions } from '@/lib/assistant/config';
import { assistantWindowData } from '@/lib/data/assistant-server';
import { AssistantWidget } from './assistant-widget';

// Mounts the assistant's window once, from the panel layout, for every team role. Reads on
// the server (as the person, RLS on) the assistant's name, face and intro and the suggested
// first questions for the person's roles. Nothing about other people reaches the browser.
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
  return <AssistantWidget userId={s.userId} profile={data?.profile ?? defaultProfile()} suggestions={data?.suggestions ?? suggestedQuestions(roles)} />;
}
