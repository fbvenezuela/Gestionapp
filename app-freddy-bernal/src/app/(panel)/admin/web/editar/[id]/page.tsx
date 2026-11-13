import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Eye, History } from 'lucide-react';
import { requireRole, db } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/button';
import { FlowChips, Notice } from '@/components/cms/chrome';
import { Editor } from '@/components/cms/editor';
import { adminItem, importOrigin, mediaByIds, municipalities, referenceOptions, webCaps } from '@/lib/data/web-admin';
import { reviewFlagTexts } from '@/lib/web/import-marks';
import { mediaIdsIn } from '@/lib/web/cms/drafts';
import { ADMIN_WEB, sectionOf } from '@/lib/web/cms/kinds';
import { programLabel, sectionLabel } from '@/lib/web/cms/section-label';
import { hasPendingChanges, isLive, isScheduled } from '@/lib/web/cms/status';
import { itemPath } from '@/lib/web/routes';
import { siteBaseUrl } from '@/lib/web/site';
import { WEB_KIND_LABEL } from '@/lib/web/schema';
import { fmtDateTime, TZ } from '@/lib/time';

export const metadata = { title: 'Editar · Web' };

// One item's editor (design §3). Read as the person (RLS): the web's people and Administración read drafts; only who
// may write gets the form (the editor, the publisher, the boss: can_edit_web); an archived item is read-only until the
// publisher unarchives it. The state of the flow is said at the top in words: sent, returned with a comment, live with
// changes that are not published yet, scheduled, archived; and, for a draft the importer brought from the old site,
// its old address and what the importer asked a person to review (web_import_items).
export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireRole('writer', 'web_publisher', 'boss', 'admin');
  const { id } = await params;
  const data = await db(s, async (sql) => {
    const item = await adminItem(sql, id);
    if (!item) return null;
    const media = await mediaByIds(sql, mediaIdsIn(item.draft));
    return {
      item,
      origin: await importOrigin(sql, item.id),
      caps: await webCaps(sql),
      media: Object.fromEntries([...media].map(([k, m]) => [k, { ...m, storageKey: undefined }])),
      munis: await municipalities(sql),
      refs: item.kind === 'page' ? await referenceOptions(sql) : [],
    };
  });
  if (!data) notFound();
  const { item, caps } = data;
  const section = sectionOf(item.kind);
  const live = isLive(item);
  const publicPath = itemPath(item.kind, item.slug);
  const writable = caps.canEdit && !item.archivedAt;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader
        title={item.title || 'Sin título'}
        subtitle={`${WEB_KIND_LABEL[item.kind]} · versión ${item.draftVersion} del borrador${item.updatedByName ? ` · último cambio de ${item.updatedByName}` : ''}, ${fmtDateTime(item.updatedAt)}`}
        back={{ href: ADMIN_WEB.list(item.kind), label: sectionLabel(section) }}
      />
      <FlowChips flow={item} />

      {item.kind === 'page' && item.slug === 'atencion' ? (
        // /atencion builds its own texts (src/app/(web)/atencion/page.tsx) and never reads this page (APP-20).
        <Notice tone="info" title="Esta página no sale en la web">
          La página «Atención ciudadana» de la web tiene sus propios textos. Lo que escribas aquí no se ve. Sus preguntas se cambian en
          «Preguntas frecuentes», grupo «Atención ciudadana», y sus contactos en «Ajustes del sitio».
        </Notice>
      ) : null}

      {item.status === 'draft' && item.reviewNote ? (
        <Notice tone="danger" title="Te lo devolvieron con este comentario">
          <p className="whitespace-pre-line">{item.reviewNote}</p>
          <p className="mt-1 text-sm text-text-2">Haz los cambios, guárdalos y envíalo de nuevo a aprobación.</p>
        </Notice>
      ) : null}
      {item.status === 'in_review' ? (
        <Notice tone="info" title="Esperando aprobación">
          Enviado {item.submittedAt ? fmtDateTime(item.submittedAt) : ''}
          {item.submittedByName ? ` por ${item.submittedByName}` : ''}. Quien aprueba la web o el jefe lo publica, lo programa o lo devuelve con un comentario.
        </Notice>
      ) : null}
      {live && hasPendingChanges(item) ? (
        <Notice tone="warn" title="Esto ya está en la web">
          Lo que cambies aquí sale solo cuando quien aprueba lo publique de nuevo. Mientras tanto, la web muestra lo aprobado
          {publicPath ? (
            <>
              {' '}
              (
              <Link href={publicPath} className="font-semibold underline underline-offset-4" target="_blank">
                verlo en la web
              </Link>
              )
            </>
          ) : null}
          .
        </Notice>
      ) : live && publicPath ? (
        <p className="text-sm text-text-2">
          En la web:{' '}
          <Link href={publicPath} className="font-semibold text-accent-ink underline underline-offset-4" target="_blank">
            {publicPath}
          </Link>
        </p>
      ) : null}
      {isScheduled(item) ? <Notice tone="info" title={`Programado: sale el ${fmtDateTime(item.publishAt)}`}>Hasta entonces nadie lo ve en la web.</Notice> : null}
      {data.origin ? (
        <Notice tone={data.origin.flags.length ? 'warn' : 'info'} title="Traído de la web vieja">
          <p>
            Era <span className="break-all font-mono text-sm">{data.origin.sourcePath}</span>
            {data.origin.publishedAt ? `, publicado el ${fmtDateTime(data.origin.publishedAt)}` : ''}. Se trajo de la web vieja el{' '}
            {fmtDateTime(data.origin.importedAt)}: revísalo antes de enviarlo.
          </p>
          {reviewFlagTexts(data.origin.flags).length ? (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {reviewFlagTexts(data.origin.flags).map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          ) : null}
        </Notice>
      ) : null}
      {item.archivedAt ? (
        <Notice tone="warn" title="Archivado: no se ve en la web">
          {item.archivedByName ? `Lo archivó ${item.archivedByName}, ${fmtDateTime(item.archivedAt)}. ` : ''}Para cambiarlo o volver a mostrarlo, quien aprueba la web lo desarchiva.
        </Notice>
      ) : null}

      {writable ? (
        <Editor
          item={{ id: item.id, kind: item.kind, slug: item.slug, status: item.status, rev: item.rev, draftVersion: item.draftVersion, hasPublished: item.hasPublished }}
          draft={item.draft}
          caps={caps}
          media={data.media}
          munis={data.munis}
          refs={data.refs}
          baseUrl={siteBaseUrl()}
          tz={TZ}
          programName={programLabel()}
        />
      ) : (
        <Card>
          <CardBody className="flex flex-col gap-3 text-[15px]">
            <p>
              {item.archivedAt
                ? 'Un contenido archivado no se cambia: primero hay que desarchivarlo.'
                : 'Puedes leer este borrador y sus versiones; lo escriben el editor de la web, quien aprueba y el jefe.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <LinkButton href={ADMIN_WEB.preview(item.id)} variant="secondary">
                <Eye className="h-4 w-4" aria-hidden /> Vista previa
              </LinkButton>
              <LinkButton href={ADMIN_WEB.versions(item.id)} variant="secondary">
                <History className="h-4 w-4" aria-hidden /> Versiones
              </LinkButton>
              {caps.canPublish ? <LinkButton href={ADMIN_WEB.review(item.id)}>Revisar y decidir</LinkButton> : null}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
