import type { Metadata } from 'next';
import { BookOpenTextIcon } from '@/components/web/icons';
import { NewsCard, NewsFeature } from '@/components/web/cards';
import { FilterForm, InputField, SelectField } from '@/components/web/forms';
import { EmptyState, Pagination } from '@/components/web/states';
import { buttonClass, cardClass, Container, PageIntro, textLinkClass, WebLink } from '@/components/web/ui';
import { listItems } from '@/lib/web/cache';
import { choiceParam, pageParam, textParam, withQuery } from '@/lib/web/params';
import { NEWS_CATEGORIES } from '@/lib/web/schema';
import { pageMetadata } from '@/lib/web/seo';
import { getSite } from '@/lib/web/site';
import { cn } from '@/lib/cn';

// Actualidad (design §2): news, statements, articles and interviews, with a search, categories and pages (GET
// parameters: no JavaScript needed, and a search is a link). The first item of the unfiltered first page is a feature
// with its photo; the rest a light list. The Semanario has its own page.
export const revalidate = 60;

const PER_PAGE = 10;
const CATEGORY_KEYS = Object.keys(NEWS_CATEGORIES) as (keyof typeof NEWS_CATEGORIES)[];

type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const [site, sp] = await Promise.all([getSite(), searchParams]);
  const page = pageParam(sp.pagina);
  const q = textParam(sp.q);
  return pageMetadata(
    {
      title: q ? `Buscar «${q}» en actualidad` : page > 1 ? `Actualidad, página ${page}` : 'Actualidad',
      description: 'Noticias, comunicados, artículos y entrevistas de la gestión, con su fecha y sus fuentes.',
      path: withQuery('/actualidad', { pagina: page }),
      noindex: !!q,
    },
    site,
  );
}

export default async function NewsPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const q = textParam(sp.q);
  const category = choiceParam(sp.categoria, CATEGORY_KEYS);
  const page = pageParam(sp.pagina);
  const { items, total } = await listItems({ kind: 'news', limit: PER_PAGE, offset: (page - 1) * PER_PAGE, q: q || null, category: category || null });
  const searching = !!(q || category);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const href = (p: number) => withQuery('/actualidad', { q, categoria: category, pagina: p });
  const featured = !searching && page === 1 ? items[0] : undefined;
  const list = featured ? items.slice(1) : items;

  return (
    <>
      <PageIntro eyebrow="Actualidad" title="Noticias y comunicados" intro="Lo que pasa en la gestión, con su fecha, quién lo firma y sus fuentes." />
      <Container className="pb-20">
        <FilterForm action="/actualidad" label="Buscar en actualidad" search className="grid gap-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
          <InputField id="q" name="q" type="search" label="Buscar" value={q} placeholder="Por ejemplo: agua, escuela, Junín" />
          <SelectField id="f-categoria" name="categoria" label="Tipo" value={category} allLabel="Todo" options={CATEGORY_KEYS.map((k) => ({ value: k, label: NEWS_CATEGORIES[k] }))} />
          <button type="submit" className={buttonClass('olive')}>
            Buscar
          </button>
        </FilterForm>

        <div className="mb-6 mt-8 flex flex-wrap items-center gap-x-4 gap-y-2" aria-live="polite">
          {searching ? (
            <>
              <p className="text-lg font-semibold text-text">
                {total === 1 ? '1 resultado' : `${total} resultados`}
                {q ? ` para «${q}»` : ''}
                {category ? ` en ${NEWS_CATEGORIES[category].toLowerCase()}s` : ''}
              </p>
              <WebLink href="/actualidad" className={textLinkClass}>
                Ver todo
              </WebLink>
            </>
          ) : null}
        </div>

        {featured ? <NewsFeature item={featured} as="h2" eager /> : null}
        {list.length ? (
          <ul className={cn('grid gap-x-10 gap-y-8 md:grid-cols-2', featured ? 'mt-10' : '')}>
            {list.map((n) => (
              <li key={n.id}>
                <NewsCard item={n} as="h2" />
              </li>
            ))}
          </ul>
        ) : null}
        {!items.length ? (
          <EmptyState title={searching ? 'No encontramos notas con esa búsqueda.' : 'Todavía no hay notas publicadas.'}>
            {searching ? 'Prueba con otra palabra o quita el filtro.' : null}
          </EmptyState>
        ) : null}
        <Pagination page={page} pages={pages} hrefFor={href} label="Páginas de actualidad" />

        <WebLink href="/actualidad/semanario" className={cn(cardClass, 'mt-14 flex items-center gap-5 p-6 hover:border-accent sm:p-8')}>
          <BookOpenTextIcon className="h-10 w-10 shrink-0 text-accent-ink" />
          <span>
            <span className="block text-xl font-semibold text-text">El Semanario</span>
            <span className="mt-1 block text-base text-text-2">Cada número del boletín semanal, para leer o descargar aquí mismo.</span>
          </span>
        </WebLink>
      </Container>
    </>
  );
}
