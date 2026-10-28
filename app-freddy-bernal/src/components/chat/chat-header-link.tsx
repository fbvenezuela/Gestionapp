import type { Session } from '@/lib/auth/session';
import { isTeamRole } from '@/lib/roles';

// The envelope of Mensajes in the top bar, before the bell (R3, D-49, design §5.2): only for a team role, and never for
// an account with Administración (it does not follow «Ver como»: administración never sees Mensajes).
// Paso 0 (integrator): Mensajes has no data yet, so it only leaves the tutorials' anchor, hidden. WP-B draws the link
// with its count of unread conversations (ChatBadgeLive).
export function ChatHeaderLink({ session }: { session: Session }) {
  if (session.roles.includes('admin') || !session.roles.some((r) => isTeamRole(r))) return null;
  return <span data-tour="messages" hidden />;
}
