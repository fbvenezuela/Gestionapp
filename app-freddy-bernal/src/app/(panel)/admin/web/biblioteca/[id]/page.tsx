import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole, db } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { MediaEditForm } from '@/components/cms/media-edit-form';
import { mediaById, mediaUsage, webCaps } from '@/lib/data/web-admin';
import { ADMIN_WEB } from '@/lib/web/cms/kinds';
import { WEB_KIND_LABEL } from '@/lib/web/schema';
import { fmtDateTime } from '@/lib/time';

export const metadata = { title: 'Archivo · Biblioteca' };

// One file of the library: its words (alternative text, caption, credit, title), its focal point and where it is used
// (in a draft, in what is published, or both). Published pages keep the words they were approved with (frozen at
// publish), so changing them here changes the site only when those pages are published again.
export default async function MediaPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireRole('writer', 'web_publisher', 'boss', 'admin');
  const { id } = await params;
  const data = await db(s, async (sql) => {
    const m = await mediaById(sql, id);
    if (!m) return null;
    return { m, caps: await webCaps(sql), uses: await mediaUsage(sql, id) };
  });
  if (!data) notFound();
  const { m, caps, uses } = data;
  const { storageKey: _key, ...media } = m;
  void _key;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader title={m.kind === 'image' ? 'Foto' : 'Documento'} subtitle={`Subido ${fmtDateTime(m.createdAt)}${m.createdByName ? ` por ${m.createdByName}` : ''} · ${m.kind === 'image' ? `${m.width} × ${m.height} · ` : ''}${Math.max(1, Math.round(m.bytes / 1024))} KB`} back={{ href: ADMIN_WEB.media, label: 'Biblioteca' }} />
      {m.archived ? <Chip tone="warn">Archivado: no se puede elegir</Chip> : null}
      <Card>
        <CardBody>
          <MediaEditForm m={media} canEdit={caps.canEdit} usedLive={uses.some((u) => u.inPublished)} />
          {m.kind === 'document' ? (
            <p className="mt-3 text-sm">
              <a href={m.url} target="_blank" rel="noopener" className="font-semibold text-accent-ink underline underline-offset-4">
                Abrir el PDF
              </a>
            </p>
          ) : null}
        </CardBody>
      </Card>
      <Card solid>
        <CardHeader title="Dónde se usa" subtitle={uses.length ? undefined : 'En ningún contenido todavía.'} />
        {uses.length ? (
          <ul className="divide-y divide-border">
            {uses.map((u) => (
              <li key={u.id}>
                <Link href={ADMIN_WEB.edit(u.id)} className="flex min-h-14 flex-wrap items-center gap-2 px-4 py-3 hover:bg-surface-2">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{u.title || 'Sin título'}</span>
                    <span className="block text-sm text-text-2">{WEB_KIND_LABEL[u.kind]}</span>
                  </span>
                  {u.inPublished ? <Chip tone="ok">En lo publicado</Chip> : null}
                  {u.inDraft ? <Chip tone="neutral">En el borrador</Chip> : null}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </div>
  );
}
