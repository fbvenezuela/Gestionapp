import Link from 'next/link';
import { ArrowRight, FolderOpen, Settings2, Shuffle } from 'lucide-react';
import { requireRole, db } from '@/lib/auth/session';
import { PageHeader, Stat } from '@/components/ui/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { CmsNav, FlowChips } from '@/components/cms/chrome';
import { kindCounts, recentChanges, reviewQueue, statusCounts, webCaps } from '@/lib/data/web-admin';
import { ADMIN_WEB, KIND_SECTIONS } from '@/lib/web/cms/kinds';
import { sectionLabel } from '@/lib/web/cms/section-label';
import { WEB_KIND_LABEL } from '@/lib/web/schema';
import { fmtDateTime } from '@/lib/time';

export const metadata = { title: 'Web' };

// The website's administrator (D-90, D-91, design §3): what there is of each kind and where it is (drafts, waiting for
// approval, scheduled, live), what waits for the publisher, the latest changes, and the doors to the library, the site's
// settings and the redirects. Everything read as the person (RLS: drafts only for the web's people and Administración;
// the boss publishes too). Who sees which button is decided by the database's own gates (webCaps).
export default async function WebAdminPage() {
  const s = await requireRole('writer', 'web_publisher', 'boss', 'admin');
  const data = await db(s, async (sql) => ({
    caps: await webCaps(sql),
    status: await statusCounts(sql),
    kinds: await kindCounts(sql),
    queue: await reviewQueue(sql),
    recent: await recentChanges(sql, 6),
  }));
  const { caps, status, queue } = data;
  const byKind = new Map(data.kinds.map((k) => [k.kind, k]));
  const subtitle = caps.canPublish
    ? 'Lo que se publica en la página del gobernador. Tú revisas, publicas, programas y archivas.'
    : caps.canEdit
      ? 'Lo que se publica en la página del gobernador. Escribes y envías a aprobación; publica quien aprueba la web.'
      : 'Lo que se publica en la página del gobernador. Puedes leerlo todo; lo escriben y lo publican las personas de la web.';

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <PageHeader title="La web" subtitle={subtitle} />
      <CmsNav current="inicio" caps={caps} waiting={queue.length} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Borradores" value={status.draft} />
        <Stat label="Esperan aprobación" value={status.in_review} tone={status.in_review ? 'accent' : undefined} />
        <Stat label="Programados" value={status.scheduled} />
        <Stat label="Publicados" value={status.published} tone="ok" />
      </div>

      {queue.length ? (
        <Card solid>
          <CardHeader
            title={caps.canPublish ? 'Por aprobar' : 'Esperando aprobación'}
            subtitle={caps.canPublish ? 'Revísalo con la vista previa y publícalo, prográmalo o devuélvelo con un comentario.' : 'Lo revisa quien aprueba la web o el jefe.'}
            action={
              <Link href={ADMIN_WEB.queue} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent-ink underline underline-offset-4">
                Ver todo <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            }
          />
          <ul className="divide-y divide-border">
            {queue.slice(0, 5).map((r) => (
              <li key={r.id}>
                <Link href={caps.canPublish ? ADMIN_WEB.review(r.id) : ADMIN_WEB.edit(r.id)} className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-surface-2">
                  <span className="min-w-0 flex-1 basis-56">
                    <span className="block font-semibold">{r.title || 'Sin título'}</span>
                    <span className="block text-sm text-text-2">
                      {WEB_KIND_LABEL[r.kind]}
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
      ) : null}

      <section aria-labelledby="contenido">
        <h2 id="contenido" className="mb-3 text-lg font-bold">
          Contenido
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {KIND_SECTIONS.map((sec) => {
            const c = byKind.get(sec.kind);
            return (
              <li key={sec.kind}>
                <Card className="h-full">
                  <Link href={ADMIN_WEB.list(sec.kind)} className="flex h-full min-h-24 flex-col gap-1 p-4 hover:bg-surface-2 sm:p-5">
                    <span className="flex items-center justify-between gap-2 font-semibold">
                      {sectionLabel(sec)}
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                    </span>
                    <span className="text-sm text-text-2">{sec.hint}</span>
                    <span className="mt-auto pt-1 text-sm text-text-2">
                      {c ? `${c.live} en la web · ${c.drafts} en borrador${c.inReview ? ` · ${c.inReview} en revisión` : ''}${c.scheduled ? ` · ${c.scheduled} ${c.scheduled === 1 ? 'programado' : 'programados'}` : ''}` : 'Nada todavía'}
                    </span>
                  </Link>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <DoorCard href={ADMIN_WEB.media} icon={<FolderOpen className="h-5 w-5" aria-hidden />} title="Biblioteca de fotos y documentos">
          Sube fotos con su texto alternativo, su crédito y su punto de interés; y los PDF de los documentos.
        </DoorCard>
        {caps.canManageSite ? (
          <>
            <DoorCard href={ADMIN_WEB.settings} icon={<Settings2 className="h-5 w-5" aria-hidden />} title="Ajustes del sitio">
              Navegación, pie de página, contactos y cuentas verificadas, WhatsApp, portal y datos estructurados.
            </DoorCard>
            <DoorCard href={ADMIN_WEB.redirects} icon={<Shuffle className="h-5 w-5" aria-hidden />} title="Redirecciones">
              Direcciones de la web vieja que llevan a las nuevas, para que ningún enlace se pierda.
            </DoorCard>
          </>
        ) : null}
      </div>

      {data.recent.length ? (
        <Card solid>
          <CardHeader title="Lo último que cambió" />
          <CardBody className="p-0 sm:p-0">
            <ul className="divide-y divide-border">
              {data.recent.map((r) => (
                <li key={r.id}>
                  <Link href={ADMIN_WEB.edit(r.id)} className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-surface-2">
                    <span className="min-w-0 flex-1 basis-56">
                      <span className="block font-medium">{r.title || 'Sin título'}</span>
                      <span className="block text-sm text-text-2">
                        {WEB_KIND_LABEL[r.kind]} · {fmtDateTime(r.updatedAt)}
                        {r.updatedByName ? ` · ${r.updatedByName}` : ''}
                      </span>
                    </span>
                    <FlowChips flow={r} />
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

function DoorCard({ href, icon, title, children }: { href: string; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <Card className="h-full">
      <Link href={href} className="flex h-full flex-col gap-1.5 p-4 hover:bg-surface-2 sm:p-5">
        <span className="flex items-center gap-2 font-semibold text-text">
          <span className="text-accent-ink">{icon}</span>
          {title}
        </span>
        <span className="text-sm text-text-2">{children}</span>
      </Link>
    </Card>
  );
}
