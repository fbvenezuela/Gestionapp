import { requireRole } from '@/lib/auth/session';
import { clientWords } from '@/lib/guides/web';
import { WebGuidePage } from '@/components/guides/web-guide';

export const metadata = { title: 'Guía de atención ciudadana' };

// «Atención ciudadana» in «Ayuda y guías» (WF-C): the attention desk's guide (docs/MANUAL-ATENCION.md and the desk's
// flows, from src/lib/guides/web) for the boss and Administración, who have «Atención» in their menu. ?parte=N opens one
// part, ?flujo=<id> one flow. The web's and the desk's own roles have no guides: they go back to their home.
export default async function AttentionHelpPage({ searchParams }: { searchParams: Promise<{ parte?: string; flujo?: string }> }) {
  await requireRole('boss', 'admin');
  const { parte, flujo } = await searchParams;
  return <WebGuidePage page="atencion" words={clientWords()} parte={parte} flujo={flujo} />;
}
