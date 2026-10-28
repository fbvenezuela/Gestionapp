import { redirect } from 'next/navigation';
import { MessagesSquare } from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { homeFor } from '@/lib/roles';
import { noPermissionUrl } from '@/components/shell/no-permission';
import { PageHeader, EmptyState } from '@/components/ui/page';

export const metadata = { title: 'Mensajes' };

// Mensajes (R3, D-49): the person's conversations; for the boss also «Todas» and «Quién habla con quién».
// Paso 0 (integrator): the base page (its access and the tutorials' anchors, hidden). WP-B builds the screen.
export default async function MessagesPage() {
  const s = await requireRole('boss', 'dispatch', 'politics', 'ivt', 'camera', 'social');
  // An account with Administración is out of Mensajes even with a team role (D-49).
  if (s.roles.includes('admin')) redirect(noPermissionUrl(homeFor(s.roles)));
  return (
    <>
      <PageHeader title="Mensajes" />
      <div data-tour="chat-notice" hidden />
      <div data-tour="chat-team" hidden />
      <div data-tour="chat-list" hidden />
      <div data-tour="chat-new" hidden />
      <EmptyState icon={<MessagesSquare className="h-8 w-8" />} title="Todavía no tienes conversaciones." />
    </>
  );
}
