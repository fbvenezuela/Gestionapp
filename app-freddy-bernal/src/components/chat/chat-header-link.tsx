import { db, type Session } from '@/lib/auth/session';
import { unreadConversations } from '@/lib/data/chat';
import { isTeamRole } from '@/lib/roles';
import { ChatBadgeLive } from './chat-badge-live';

// The envelope of Mensajes in the top bar, before the bell (R3, D-49, design §5.2): only for a team role, and never for
// an account with Administración (it does not follow «Ver como»: administración never sees Mensajes). The number of
// conversations with something new is read here, as the person (RLS), and kept fresh in the phone (ChatBadgeLive).
export async function ChatHeaderLink({ session }: { session: Session }) {
  if (session.roles.includes('admin') || !session.roles.some((r) => isTeamRole(r))) return null;
  let n = 0;
  try {
    n = await db(session, (sql) => unreadConversations(sql));
  } catch (e) {
    // The envelope never takes the page down with it.
    console.error('[chat] unread count:', (e as Error).message);
  }
  return <ChatBadgeLive initial={n} />;
}
