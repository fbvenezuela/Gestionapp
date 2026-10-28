import { requireSession } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page';

export const metadata = { title: 'Ayuda' };

// Ayuda y guías (R3, D-42, D-46): the guide of the person's role (it follows «Ver como»), every screen, the flows and
// the tutorials of their screens.
// Paso 0 (integrator): the base page (its access and the tutorials' anchors, hidden). WP-D builds the screen.
export default async function HelpPage() {
  await requireSession();
  return (
    <>
      <PageHeader title="Ayuda y guías" />
      <div data-tour="help-mine" hidden />
      <div data-tour="help-sections" hidden />
      <div data-tour="help-flows" hidden />
      <div data-tour="help-tours" hidden />
    </>
  );
}
