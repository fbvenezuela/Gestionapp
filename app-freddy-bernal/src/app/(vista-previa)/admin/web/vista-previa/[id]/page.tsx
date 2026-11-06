import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole, db } from '@/lib/auth/session';
import { Blocks, opensWithHero } from '@/components/web/blocks';
import { municipalityNames, VideoFrame } from '@/components/web/blocks/data';
import { FaqView, IndicatorsView, NoticesView } from '@/components/web/blocks/views';
import { DocumentRow, EpisodeMeta, Topics } from '@/components/web/cards';
import { NewsArticle, ProjectFicha } from '@/components/web/item-views';
import { photoOf } from '@/components/web/media';
import { PublicChrome } from '@/components/web/public-chrome';
import { EmptyState } from '@/components/web/states';
import { Container, PageIntro } from '@/components/web/ui';
import { adminItem, itemVersion, mediaByIds, toFrozen } from '@/lib/data/web-admin';
import type { WebItem } from '@/lib/web/cache';
import { listItems } from '@/lib/web/cache';
import { dayIn, draftProblems, issueText, mediaIdsIn } from '@/lib/web/cms/drafts';
import { ADMIN_WEB } from '@/lib/web/cms/kinds';
import { hasPendingChanges } from '@/lib/web/cms/status';
import type { FrozenMedia } from '@/lib/web/public';
import { indicatorShown, noticeActive, parseSnapshot, WEB_KIND_LABEL, type WebKind } from '@/lib/web/schema';
import { getSite, type Site } from '@/lib/web/site';
import { fmtDateTime, TZ } from '@/lib/time';

// «Vista previa» (design §3): the DRAFT (or a saved version, ?version=N) drawn exactly as the public site would draw it —
// the public frame, its block renderer and its item pages — with a bar that says it is not published. For the web's
// people and Administración (the session and RLS decide: anyone else gets «no encontrado»). Never indexed. The draft
// must be whole to be drawn (the kind's schema): what is missing is listed instead. Lists inside the page (the latest
// news, the projects…) are what the public sees now.

type Params = Promise<{ id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

function Bar({ id, title, detail, canDecide }: { id: string; title: string; detail: string; canDecide: boolean }) {
  return (
    <div role="region" aria-label="Vista previa" className="sticky top-0 z-50 bg-action text-on-action shadow-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 sm:px-6">
        <p className="font-bold">Vista previa: no está publicado</p>
        <p className="text-sm">
          {title} · {detail}
        </p>
        <span className="ml-auto flex flex-wrap gap-x-4">
          <Link href={ADMIN_WEB.edit(id)} className="inline-flex min-h-11 items-center font-semibold underline decoration-2 underline-offset-4">
            Volver al editor
          </Link>
          {canDecide ? (
            <Link href={ADMIN_WEB.review(id)} className="inline-flex min-h-11 items-center font-semibold underline decoration-2 underline-offset-4">
              Revisar y publicar
            </Link>
          ) : null}
        </span>
      </div>
    </div>
  );
}

export default async function PreviewPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const s = await requireRole('writer', 'web_publisher', 'boss', 'admin');
  const { id } = await params;
  const v = Number((await searchParams).version);
  const versionNo = Number.isInteger(v) && v > 0 ? v : null;
  const data = await db(s, async (sql) => {
    const item = await adminItem(sql, id);
    if (!item) return null;
    const version = versionNo ? await itemVersion(sql, id, versionNo) : null;
    if (versionNo && !version) return null;
    const snapshot = version ? version.snapshot : item.draft;
    const media = await mediaByIds(sql, mediaIdsIn(snapshot));
    const canDecide = !!(await sql.one<{ ok: boolean }>(`select public.can_publish_web() as ok`))?.ok;
    return { item, snapshot, media, canDecide, slug: version ? version.slug : item.slug };
  });
  if (!data) notFound();
  const { item, snapshot } = data;
  const site = await getSite();
  const frozen: Record<string, FrozenMedia> = {};
  for (const [mid, m] of data.media) frozen[mid] = toFrozen(m, m.storageKey);
  const archived = [...data.media.values()].filter((m) => m.archived).length;
  const detail = versionNo
    ? `versión ${versionNo} (guardada)`
    : item.hasPublished && !hasPendingChanges(item)
      ? 'el borrador es igual a lo publicado'
      : `borrador, versión ${item.draftVersion}${item.hasPublished ? ': lo publicado sigue igual hasta que se apruebe' : ''}`;
  const bar = <Bar id={item.id} title={WEB_KIND_LABEL[item.kind]} detail={`${detail}${archived ? ' · tiene una foto archivada: no se podrá publicar así' : ''}`} canDecide={data.canDecide} />;

  const parsed = parseSnapshot(item.kind, snapshot);
  if (!parsed.ok) {
    const problems = draftProblems(item.kind, snapshot);
    return (
      <>
        {bar}
        <PublicChrome site={site}>
          <PageIntro title="Este borrador todavía no se puede mostrar" intro="Le falta algo para verse como en la web. Complétalo en el editor:" />
          <Container className="pb-16">
            <ul className="list-disc space-y-1 pl-5 text-lg">
              {problems.map((p, i) => (
                <li key={i}>{issueText(p)}</li>
              ))}
            </ul>
          </Container>
        </PublicChrome>
      </>
    );
  }

  const d = parsed.data as Record<string, unknown>;
  const now = new Date().toISOString();
  const webItem = {
    id: item.id,
    kind: item.kind,
    slug: data.slug,
    data: parsed.data,
    media: frozen,
    version: versionNo ?? item.draftVersion,
    publishedAt: now,
    liveSince: now,
    municipalityId: typeof d.municipalityId === 'string' ? d.municipalityId : null,
    category: typeof d.category === 'string' ? d.category : null,
    state: typeof d.state === 'string' ? d.state : null,
    date: typeof d.date === 'string' ? d.date : dayIn(TZ),
  } as WebItem;

  return (
    <>
      {bar}
      <PublicChrome site={site}>
        <Body item={webItem} site={site} />
      </PublicChrome>
    </>
  );
}

async function Body({ item, site }: { item: WebItem; site: Site }) {
  switch (item.kind as WebKind) {
    case 'page': {
      const page = item as WebItem<'page'>;
      const blocks = page.data.blocks;
      const home = page.slug === 'inicio';
      return (
        <>
          {opensWithHero(blocks) ? null : home ? <h1 className="sr-only">{page.data.title}</h1> : <PageIntro title={page.data.title} intro={page.data.excerpt} />}
          <Blocks blocks={blocks} site={site} media={page.media} />
          {!home ? (
            <Container className="pb-14 pt-4">
              <p className="text-[15px] text-text-2">Vista previa de la versión {page.version}</p>
            </Container>
          ) : null}
        </>
      );
    }
    case 'news': {
      const news = item as WebItem<'news'>;
      const [munis, related] = await Promise.all([
        municipalityNames(),
        listItems({ kind: 'news', category: news.data.category, limit: 4 }).then((r) => r.items.filter((n) => n.id !== news.id).slice(0, 3)),
      ]);
      return <NewsArticle item={news} site={site} munis={munis} related={related} />;
    }
    case 'project': {
      const project = item as WebItem<'project'>;
      const munis = await municipalityNames();
      const related = project.data.municipalityId
        ? (await listItems({ kind: 'project', municipalityId: project.data.municipalityId, limit: 4 })).items.filter((p) => p.id !== project.id).slice(0, 3)
        : [];
      return <ProjectFicha item={project} munis={munis} related={related} />;
    }
    case 'episode': {
      const e = item as WebItem<'episode'>;
      return (
        <>
          <PageIntro eyebrow="El programa" title={e.data.title} intro={e.data.excerpt} />
          <Container className="pb-20">
            <section className="grid gap-8 rounded-[var(--radius-card)] bg-charcoal p-5 text-on-charcoal sm:p-8 lg:grid-cols-12 lg:items-center lg:gap-12" aria-label="Episodio">
              <div className="lg:col-span-7">
                <VideoFrame youtubeId={e.data.youtubeId} title={e.data.title} poster={photoOf(e.media, e.data.coverId)} />
              </div>
              <div className="flex flex-col gap-3 lg:col-span-5">
                <EpisodeMeta item={e} className="text-on-charcoal" />
              </div>
            </section>
            <div className="mt-4 flex flex-col gap-3">
              <Topics topics={e.data.topics} />
            </div>
          </Container>
        </>
      );
    }
    case 'document': {
      const doc = item as WebItem<'document'>;
      return (
        <>
          <PageIntro eyebrow="Transparencia" title="Documentos y cifras" intro="Así se ve el documento en la lista de Transparencia." />
          <Container className="pb-20">
            <ul className="flex flex-col gap-4">
              <li>
                <DocumentRow item={doc} />
              </li>
            </ul>
          </Container>
        </>
      );
    }
    case 'notice': {
      const n = item as WebItem<'notice'>;
      const munis = await municipalityNames();
      return (
        <>
          <PageIntro eyebrow="Inicio" title="Avisos de servicio" intro="Así se ve el aviso en la portada." />
          <Container className="pb-20">
            {noticeActive(n.data) ? (
              <NoticesView items={[n]} munis={munis} />
            ) : (
              <EmptyState title="Este aviso ya venció: en la web no se muestra.">Vence el {n.data.expiresAt ? fmtDateTime(n.data.expiresAt) : ''}. Cambia la fecha de vencimiento si todavía aplica.</EmptyState>
            )}
          </Container>
        </>
      );
    }
    case 'faq': {
      const f = item as WebItem<'faq'>;
      return (
        <>
          <PageIntro eyebrow="Atención ciudadana" title="Preguntas frecuentes" intro="Así se ve la pregunta." />
          <Container className="pb-20">
            <FaqView items={[f]} />
          </Container>
        </>
      );
    }
    case 'indicator': {
      const ind = item as WebItem<'indicator'>;
      return (
        <>
          <PageIntro eyebrow="Inicio" title="Lo hecho" intro="Así se ve la cifra en la portada." />
          <Container className="pb-20">
            {indicatorShown(ind.data) ? <IndicatorsView items={[ind]} /> : <EmptyState title="Sin fuente, este indicador no sale en la web.">Escribe de dónde sale la cifra en el editor.</EmptyState>}
          </Container>
        </>
      );
    }
  }
}
