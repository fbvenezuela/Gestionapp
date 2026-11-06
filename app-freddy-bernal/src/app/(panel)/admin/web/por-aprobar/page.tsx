import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { requireRole, db } from '@/lib/auth/session';
import { EmptyState, PageHeader } from '@/components/ui/page';
import { Card } from '@/components/ui/card';
import { CmsNav, FlowChips } from '@/components/cms/chrome';
import { reviewQueue, webCaps } from '@/lib/data/web-admin';
import { ADMIN_WEB } from '@/lib/web/cms/kinds';
import { hasPendingChanges } from '@/lib/web/cms/status';
import { WEB_KIND_LABEL } from '@/lib/web/schema';
import { fmtDateTime } from '@/lib/time';

export const metadata = { title: 'Por aprobar · Web' };

// What waits for approval, oldest first (design §3). The publisher and the boss open each one to compare it with what
// is live, look at the preview and decide; the rest of the web's people see the same list (read only).
export default async function QueuePage() {
  const s = await requireRole('writer', 'web_publisher', 'boss', 'admin');
  const { caps, queue } = await db(s, async (sql) => ({ caps: await webCaps(sql), queue: await reviewQueue(sql) }));
  return (
    <div className="mx-auto flex max-w-4xl flex-col">
      <PageHeader
        title="Por aprobar"
        subtitle={caps.canPublish ? 'Ábrelo, mira qué cambia y la vista previa, y decide: publicar, programar o devolver con un comentario.' : 'Lo revisa quien aprueba la web o el jefe.'}
        back={{ href: ADMIN_WEB.home, label: 'La web' }}
      />
      <CmsNav current="por-aprobar" caps={caps} waiting={queue.length} />
      {queue.length ? (
        <Card solid>
          <ul className="divide-y divide-border">
            {queue.map((r) => (
              <li key={r.id}>
                <Link href={ADMIN_WEB.review(r.id)} className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 hover:bg-surface-2">
                  <span className="min-w-0 flex-1 basis-56">
                    <span className="block font-semibold">{r.title || 'Sin título'}</span>
                    <span className="block text-sm text-text-2">
                      {WEB_KIND_LABEL[r.kind]}
                      {hasPendingChanges(r) ? ' · cambios a algo publicado' : r.hasPublished ? '' : ' · primera publicación'}
                      {r.submittedAt ? ` · enviado ${fmtDateTime(r.submittedAt)}` : ''}
                      {r.submittedByName ? ` por ${r.submittedByName}` : ''}
                    </span>
                  </span>
                  <FlowChips flow={r} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState icon={<CheckCircle2 className="h-8 w-8" />} title="No hay nada esperando aprobación. ¡Al día!" />
      )}
    </div>
  );
}
