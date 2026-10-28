import { notFound, redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { homeFor } from '@/lib/roles';
import { noPermissionUrl } from '@/components/shell/no-permission';
import { PageHeader } from '@/components/ui/page';

// Fixed: never a person's name or a message in <title>.
export const metadata = { title: 'Conversación' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// One conversation (R3, D-49 to D-54). A bad id or one the person cannot read: «No encontramos esto».
// Paso 0 (integrator): the base page (its access and the tutorials' anchor, hidden). WP-B builds the screen.
export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireRole('boss', 'dispatch', 'politics', 'ivt', 'camera', 'social');
  // An account with Administración is out of Mensajes even with a team role (D-49).
  if (s.roles.includes('admin')) redirect(noPermissionUrl(homeFor(s.roles)));
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  // Paso 0: Mensajes has no tables yet, so no conversation exists. WP-B reads it here as the person (db(s, …), RLS).
  const conversation = null as { title: string } | null;
  if (!conversation) notFound();
  return (
    <>
      <PageHeader title={conversation.title} back={{ href: '/mensajes', label: 'Mensajes' }} />
      <div data-tour="chat-composer" hidden />
    </>
  );
}
