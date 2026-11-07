import type { Metadata } from 'next';
import { BookOpenTextIcon } from '@/components/web/icons';
import { NewsCard, NewsFeature, topicHref } from '@/components/web/cards';
import { FilterForm, InputField, SelectField } from '@/components/web/forms';
import { EmptyState, Pagination } from '@/components/web/states';
import { buttonClass, cardClass, Container, PageIntro, textLinkClass, WebLink } from '@/components/web/ui';
import { listItems, type WebItem } from '@/lib/web/cache';
import { choiceParam, pageParam, textParam, withQuery } from '@/lib/web/params';
import { plainSearch } from '@/lib/web/public';
import { NEWS_CATEGORIES, NEWS_CATEGORIES_PLURAL } from '@/lib/web/schema';
import { pageMetadata, siteTitle } from '@/lib/web/seo';
import { getSite } from '@/lib/web/site';
import { navLabel } from '@/lib/web/site-settings';
import { cn } from '@/lib/cn';

// Noticias (design §2): news, statements, articles and interviews, with a search, the kinds, the topics and pages (GET
// parameters: no JavaScript needed, and a search is a link). The topics are the official site's sections (Táchira,
// Nacionales, Deportes…, carried as topics): each one opens the search for it. The first item of the unfiltered first
// page is a feature with its photo; the rest a light list. The Semanario has its own page.
export const revalidate = 60;

const PER_PAGE = 10;
const CATEGORY_KEYS = Object.keys(NEWS_CATEGORIES) as (keyof typeof NEWS_CATEGORIES)[];
// How many of the latest news the topics are counted on, and how many topics the page offers.
const TOPICS_FROM = 48;
const TOPICS_SHOWN = 8;

type Search = Promise<Record<string, string | string[] | undefined>>;

const capitalized = (s: string) => s.charAt(0).toLocaleUpperCase('es') + s.slice(1);

/** The most used topics of the latest news, most used first (the same topic written differently counts once). */
function topTopics(items: WebItem<'news'>[]): string[] {
  const seen = new Map<string, { label: string; n: number }>();
  for (const it of items) {
    for (const raw of new Set((it.data.topics ?? []).map((t) => t.trim()).filter(Boolean))) {
      const key = plainSearch(raw);
      if (!key) continue;
      const entry = seen.get(key);
      if (entry) entry.n += 1;
      else seen.set(key, { label: capitalized(raw), n: 1 });
    }
  }
  return [...seen.values()]
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'es'))
    .slice(0, TOPICS_SHOWN)
    .map((t) => t.label);
}

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const [site, sp] = await Promise.all([getSite(), searchParams]);
  const page = pageParam(sp.pagina);
  const q = textParam(sp.q);
  const name = navLabel(site, '/actualidad', 'Noticias');
  return pageMetadata(
    {
      title: q ? `Buscar «${q}» en ${name.toLowerCase()}` : page > 1 ? `${name}, página ${page}` : name,
      description: `Noticias y comunicados de la gestión de ${siteTitle(site)}.`,
      path: withQuery('/actualidad', { pagina: page }),
      noindex: !!q,
    },
    site,
  );
}

export default async function NewsPage({ searchParams }: { searchParams: Search }) {
  const [site, sp] = await Promise.all([getSite(), searchParams]);
  const q = textParam(sp.q);
  const category = choiceParam(sp.categoria, CATEGORY_KEYS);
  const page = pageParam(sp.pagina);
  const [{ items, total }, latest] = await Promise.all([
    listItems({ kind: 'news', limit: PER_PAGE, offset: (page - 1) * PER_PAGE, q: q || null, category: category || null }),
    listItems({ kind: 'news', limit: TOPICS_FROM }),
  ]);
  const name = navLabel(site, '/actualidad', 'Noticias');
  const topics = topTopics(latest.items);
  const current = q ? plainSearch(q) : '';
  const searching = !!(q || category);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const href = (p: number) => withQuery('/actualidad', { q, categoria: category, pagina: p });
  const featured = !searching && page === 1 ? items[0] : undefined;
  const list = featured ? items.slice(1) : items;

  return (
    <>
      <PageIntro title={name} />
      <Container className="pb-20">
        <FilterForm action="/actualidad" label={`Buscar en ${name.toLowerCase()}`} search className="grid gap-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
          <InputField id="q" name="q" type="search" label="Buscar" value={q} placeholder="Ejemplo: vialidad" />
          <SelectField id="f-categoria" name="categoria" label="Tipo" value={category} allLabel="Todo" options={CATEGORY_KEYS.map((k) => ({ value: k, label: NEWS_CATEGORIES[k] }))} />
          <button type="submit" className={buttonClass('olive')}>
            Buscar
          </button>
        </FilterForm>

        {topics.length > 1 ? (
          <nav aria-label="Temas" className="mt-5">
            <ul className="flex flex-wrap gap-2">
              {topics.map((t) => {
                const on = plainSearch(t) === current;
                return (
                  <li key={t}>
                    <WebLink
                      href={topicHref(t)}
                      aria-current={on ? 'page' : undefined}
                      className={cn(
                        'inline-flex min-h-11 items-center rounded-full border-2 px-4 text-[15px] font-semibold',
                        on ? 'border-text bg-text text-surface' : 'border-transparent bg-accent-soft text-accent-ink hover:border-accent',
                      )}
                    >
                      {t}
                    </WebLink>
                  </li>
                );
              })}
            </ul>
          </nav>
        ) : null}

        <div className="mb-6 mt-8 flex flex-wrap items-center gap-x-4 gap-y-2" aria-live="polite">
          {searching ? (
            <>
              <p className="text-lg font-semibold text-text">
                {total === 1 ? '1 resultado' : `${total} resultados`}
                {q ? ` para «${q}»` : ''}
                {category ? ` en ${NEWS_CATEGORIES_PLURAL[category]}` : ''}
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
          <EmptyState title={searching ? 'No hay resultados para esa búsqueda.' : 'Aún no hay noticias publicadas.'}>
            {searching ? 'Intente con otra palabra o quite el filtro.' : null}
          </EmptyState>
        ) : null}
        <Pagination page={page} pages={pages} hrefFor={href} label={`Páginas de ${name.toLowerCase()}`} />

        <WebLink href="/actualidad/semanario" className={cn(cardClass, 'mt-14 flex items-center gap-5 p-6 hover:border-accent sm:p-8')}>
          <BookOpenTextIcon className="h-10 w-10 shrink-0 text-accent-ink" />
          <span>
            <span className="block text-xl font-semibold text-text">{site.weeklyName}</span>
            <span className="mt-1 block text-base text-text-2">Ediciones en PDF.</span>
          </span>
        </WebLink>
      </Container>
    </>
  );
}
