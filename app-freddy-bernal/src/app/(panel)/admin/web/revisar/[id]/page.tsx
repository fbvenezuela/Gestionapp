import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Eye, History, PencilLine } from 'lucide-react';
import { requireRole, db } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/button';
import { CmsNav, FlowChips, Notice } from '@/components/cms/chrome';
import { DiffView } from '@/components/cms/diff-view';
import { ReviewActions } from '@/components/cms/review-actions';
import { adminItem, reviewQueue, webCaps } from '@/lib/data/web-admin';
import { diffSnapshots } from '@/lib/web/cms/diff';
import { draftProblems, issueText } from '@/lib/web/cms/drafts';
import { ADMIN_WEB } from '@/lib/web/cms/kinds';
import { isLive, isScheduled } from '@/lib/web/cms/status';
import { itemPath } from '@/lib/web/routes';
import { WEB_KIND_LABEL } from '@/lib/web/schema';
import { fmtDateTime, TZ } from '@/lib/time';

export const metadata = { title: 'Revisar · Web' };

// The publisher's room for one item (design §3): who sent it and when, what is still missing, what changes against what
// is live, the preview, and the decisions (publish now, schedule, return with a comment, archive). Everyone of the web
// may look; the buttons are only for whom the database lets decide (can_publish_web: the publisher and the boss), and
// the database checks again when they are pressed.
export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireRole('writer', 'web_publisher', 'boss', 'admin');
  const { id } = await params;
  const data = await db(s, async (sql) => {
    const item = await adminItem(sql, id);
    if (!item) return null;
    return { item, caps: await webCaps(sql), waiting: (await reviewQueue(sql)).length };
  });
  if (!data) notFound();
  const { item, caps } = data;
  const problems = draftProblems(item.kind, item.draft);
  const diff = diffSnapshots(item.kind, item.published, item.draft);
  const live = isLive(item);
  const path = itemPath(item.kind, item.slug);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader title={item.title || 'Sin título'} subtitle={`Revisar ${WEB_KIND_LABEL[item.kind].toLowerCase()} · versión ${item.draftVersion} del borrador`} back={{ href: ADMIN_WEB.queue, label: 'Por aprobar' }} />
      <CmsNav current="por-aprobar" caps={caps} waiting={data.waiting} />
      <FlowChips flow={item} />
      <p className="text-sm text-text-2">
        {item.submittedAt ? `Enviado ${fmtDateTime(item.submittedAt)}${item.submittedByName ? ` por ${item.submittedByName}` : ''}. ` : ''}
        Último cambio {fmtDateTime(item.updatedAt)}
        {item.updatedByName ? ` de ${item.updatedByName}` : ''}.
        {live && item.publishedAt ? ` Publicado por última vez ${fmtDateTime(item.publishedAt)}${item.publishedByName ? ` por ${item.publishedByName}` : ''}.` : ''}
        {isScheduled(item) ? ` Programado para ${fmtDateTime(item.publishAt)}.` : ''}
      </p>

      <div className="flex flex-wrap gap-2">
        <LinkButton href={ADMIN_WEB.preview(item.id)} variant="secondary">
          <Eye className="h-4 w-4" aria-hidden /> Ver la vista previa
        </LinkButton>
        <LinkButton href={ADMIN_WEB.edit(item.id)} variant="secondary">
          <PencilLine className="h-4 w-4" aria-hidden /> Abrir el editor
        </LinkButton>
        <LinkButton href={ADMIN_WEB.versions(item.id)} variant="ghost">
          <History className="h-4 w-4" aria-hidden /> Versiones
        </LinkButton>
        {live && path ? (
          <Link href={path} target="_blank" className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-accent-ink underline underline-offset-4">
            Verlo en la web
          </Link>
        ) : null}
      </div>

      {problems.length ? (
        <Notice tone="warn" title="Le falta esto para publicarse">
          <ul className="list-disc pl-5">
            {problems.slice(0, 10).map((p, i) => (
              <li key={i}>{issueText(p)}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <Card solid>
        <CardHeader title="Qué cambia si lo publicas" subtitle={diff.first ? undefined : 'Comparado con lo que está en la web ahora.'} />
        <CardBody>
          <DiffView diff={diff} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Decidir" />
        <CardBody>
          {caps.canPublish ? (
            <ReviewActions
              tz={TZ}
              s={{
                id: item.id,
                rev: item.rev,
                title: item.title,
                status: item.status,
                live,
                scheduled: isScheduled(item),
                archived: !!item.archivedAt,
                hasPublished: item.hasPublished,
                ready: !problems.length,
                isHome: item.kind === 'page' && item.slug === 'inicio',
              }}
            />
          ) : (
            <p className="text-[15px]">Publica, programa o devuelve quien aprueba la web o el jefe. Tú puedes ver los cambios y la vista previa.</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
