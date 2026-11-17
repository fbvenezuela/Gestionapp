import { requireRole } from '@/lib/auth/session';
import { clientWords } from '@/lib/guides/web';
import { WebGuidePage } from '@/components/guides/web-guide';

export const metadata = { title: 'Guía de la web' };

// «La web» in «Ayuda y guías» (WF-C): the web's guide (docs/GUIA-WEB.md, MANUAL-ADMIN-WEB.md and the web's flows, from
// src/lib/guides/web) for the boss and Administración, who have «Web» and «Atención» in their menu. ?parte=N opens one
// part, ?flujo=<id> one flow. The web's and the desk's own roles have no guides: they go back to their home.
export default async function WebHelpPage({ searchParams }: { searchParams: Promise<{ parte?: string; flujo?: string }> }) {
  await requireRole('boss', 'admin');
  const { parte, flujo } = await searchParams;
  return <WebGuidePage page="web" words={clientWords()} parte={parte} flujo={flujo} />;
}
