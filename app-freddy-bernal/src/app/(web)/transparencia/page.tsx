import type { Metadata } from 'next';
import { DocumentRow } from '@/components/web/cards';
import { DemoNote } from '@/components/web/blocks/views';
import { FilterForm, InputField, SelectField, ViewTabs } from '@/components/web/forms';
import { StatDefinitions, StatsView } from '@/components/web/stats';
import { EmptyState, Pagination } from '@/components/web/states';
import { buttonClass, Container, PageIntro, SectionHeading, textLinkClass, WebLink } from '@/components/web/ui';
import { getStats, listItems } from '@/lib/web/cache';
import { periodRange } from '@/lib/web/format';
import { choiceParam, pageParam, textParam, withQuery } from '@/lib/web/params';
import { DOCUMENT_CATEGORIES } from '@/lib/web/schema';
import { pageMetadata } from '@/lib/web/seo';
import { getSite } from '@/lib/web/site';

// Transparencia (design §2): the documents of the administration (reports, bulletins, rules…) with their date, version
// and category, searchable; and the figures of citizen attention with how each is calculated, from the citizen schema's
// public function (counts only: no data of any person, denuncias only in the totals). Empty states when there is no
// data yet.
export const revalidate = 60;

const PER_PAGE = 15;
const CATEGORY_KEYS = Object.keys(DOCUMENT_CATEGORIES) as (keyof typeof DOCUMENT_CATEGORIES)[];
const PERIODS = { todo: 'Desde el inicio', anio: 'Este año', '30d': 'Últimos 30 días' } as const;
type Period = keyof typeof PERIODS;


type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const [site, sp] = await Promise.all([getSite(), searchParams]);
  const page = pageParam(sp.pagina);
  return pageMetadata(
    {
      title: 'Transparencia',
      description: 'Los documentos de la gestión, con su fecha y su versión, y las cifras de la atención ciudadana con cómo se calculan.',
      path: withQuery('/transparencia', { pagina: page }),
      noindex: !!textParam(sp.q),
    },
    site,
  );
}

export default async function TransparencyPage({ searchParams }: { searchParams: Search }) {
  const [site, sp] = await Promise.all([getSite(), searchParams]);
  const q = textParam(sp.q);
  const category = choiceParam(sp.categoria, CATEGORY_KEYS);
  const page = pageParam(sp.pagina);
  const period = choiceParam(sp.periodo, Object.keys(PERIODS) as Period[]) || 'todo';
  const range = periodRange(period);
  const [{ items, total }, stats] = await Promise.all([
    listItems({ kind: 'document', limit: PER_PAGE, offset: (page - 1) * PER_PAGE, q: q || null, category: category || null }),
    getStats(range.from, range.to),
  ]);
  const searching = !!(q || category);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const docsHref = (p: number) => withQuery('/transparencia', { q, categoria: category, periodo: period === 'todo' ? '' : period, pagina: p });
  const hasFigures = !!stats && (stats.received > 0 || stats.pending > 0 || stats.resolved > 0);

  return (
    <>
      <PageIntro
        eyebrow="Transparencia"
        title="Documentos y cifras"
        intro="Los documentos de la gestión, con su fecha y su versión, y las cifras de la atención ciudadana con cómo se calcula cada una. Sin datos de ninguna persona."
      />
      <Container className="pb-8">
        <section aria-labelledby="documentos">
          <SectionHeading id="documentos" title="Documentos" />
          <FilterForm action="/transparencia" label="Buscar documentos" search className="grid gap-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
            <InputField id="q" name="q" type="search" label="Buscar" value={q} placeholder="Por ejemplo: informe, semanario" />
            <SelectField id="f-categoria" name="categoria" label="Categoría" value={category} allLabel="Todas" options={CATEGORY_KEYS.map((k) => ({ value: k, label: DOCUMENT_CATEGORIES[k] }))} />
            {period !== 'todo' ? <input type="hidden" name="periodo" value={period} /> : null}
            <button type="submit" className={buttonClass('olive')}>
              Buscar
            </button>
          </FilterForm>
          <div className="mb-2 mt-6 flex flex-wrap items-center gap-x-4 gap-y-2" aria-live="polite">
            <p className="text-lg font-semibold text-text">{total === 1 ? '1 documento' : `${total} documentos`}</p>
            {searching ? (
              <WebLink href="/transparencia" className={textLinkClass}>
                Ver todos
              </WebLink>
            ) : null}
          </div>
          {items.length ? (
            <ul className="border-b border-border">
              {items.map((d) => (
                <DocumentRow key={d.id} item={d} />
              ))}
            </ul>
          ) : (
            <EmptyState title={searching ? 'No hay documentos con esa búsqueda.' : 'Todavía no hay documentos publicados.'}>
              {searching ? 'Prueba con otra palabra o quita el filtro.' : 'Cada documento aparece aquí, con su fecha y su versión, cuando el equipo lo publica.'}
            </EmptyState>
          )}
          <Pagination page={page} pages={pages} hrefFor={docsHref} label="Páginas de documentos" />
        </section>
      </Container>

      <section aria-labelledby="cifras" className="mt-12 bg-surface py-14 sm:py-20">
        <Container>
          <SectionHeading
            id="cifras"
            title="Cifras de la atención ciudadana"
            intro="Cuántas solicitudes llegan, cuántas se resuelven y en cuánto tiempo. Se calculan solas a partir de los casos, sin datos de nadie."
          />
          <ViewTabs
            label="Período de las cifras"
            tabs={(Object.keys(PERIODS) as Period[]).map((p) => ({
              href: withQuery('/transparencia', { q, categoria: category, periodo: p === 'todo' ? '' : p }) + '#cifras',
              label: PERIODS[p],
              current: p === period,
            }))}
          />
          {stats && hasFigures ? (
            <StatsView stats={stats} />
          ) : (
            <EmptyState title="Todavía no hay solicitudes en este período.">Las cifras aparecen aquí en cuanto llegan las primeras.</EmptyState>
          )}
          <DemoNote show={site.demo && hasFigures}>En la versión de prueba estas cifras salen de solicitudes inventadas.</DemoNote>
          <div className="mt-14">
            <h3 className="mb-4 text-xl font-semibold text-text">Cómo se calcula cada cifra</h3>
            <StatDefinitions />
          </div>
        </Container>
      </section>
    </>
  );
}
