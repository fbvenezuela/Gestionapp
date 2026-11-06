import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Eye } from 'lucide-react';
import { requireRole, db } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { RestoreButton } from '@/components/cms/restore-button';
import { adminItem, itemVersions, webCaps } from '@/lib/data/web-admin';
import { ADMIN_WEB } from '@/lib/web/cms/kinds';
import { fmtDateTime } from '@/lib/time';

export const metadata = { title: 'Versiones · Web' };

// Every saved draft of an item (web_versions, append-only: nothing here is ever lost): who, when and the note, which
// one is live, «Ver» (the preview of that version) and «Volver a esta versión» (copied into the draft; publishing it
// again needs approval). Restoring is for whom may edit (restore_web_version, can_edit_web).
export default async function VersionsPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireRole('writer', 'web_publisher', 'boss', 'admin');
  const { id } = await params;
  const data = await db(s, async (sql) => {
    const item = await adminItem(sql, id);
    if (!item) return null;
    return { item, caps: await webCaps(sql), versions: await itemVersions(sql, id) };
  });
  if (!data) notFound();
  const { item, caps, versions } = data;
  const canRestore = caps.canEdit && !item.archivedAt;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader title="Versiones" subtitle={item.title || 'Sin título'} back={{ href: ADMIN_WEB.edit(item.id), label: 'Volver al editor' }} />
      <p className="text-[15px] text-text-2">
        Cada vez que alguien guarda el borrador queda una versión. Volver a una la copia al borrador como versión nueva: nada se borra, y para que salga
        en la web hay que enviarla a aprobación y publicarla otra vez.
      </p>
      <Card solid>
        <ol className="divide-y divide-border">
          {versions.map((v) => (
            <li key={v.versionNo} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">Versión {v.versionNo}</span>
                  {v.versionNo === item.draftVersion ? <Chip tone="accent">Borrador actual</Chip> : null}
                  {v.versionNo === item.publishedVersion && item.hasPublished ? <Chip tone="ok">La publicada</Chip> : null}
                </span>
                <span className="block text-sm text-text-2">
                  {fmtDateTime(v.createdAt)}
                  {v.authorName ? ` · ${v.authorName}` : ''}
                </span>
                {v.note ? <span className="block text-[15px]">«{v.note}»</span> : null}
              </span>
              <span className="flex flex-wrap gap-2">
                <Link href={ADMIN_WEB.preview(item.id, v.versionNo)} className="inline-flex min-h-9 items-center gap-1 rounded-[var(--radius-control)] px-2 text-sm font-semibold text-accent-ink underline underline-offset-4">
                  <Eye className="h-4 w-4" aria-hidden /> Ver<span className="sr-only"> la versión {v.versionNo}</span>
                </Link>
                {canRestore && v.versionNo !== item.draftVersion ? <RestoreButton id={item.id} version={v.versionNo} /> : null}
              </span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
