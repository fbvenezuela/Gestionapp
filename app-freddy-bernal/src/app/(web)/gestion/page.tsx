import type { Metadata } from 'next';
import { MapPinIcon } from '@/components/web/icons';
import { ProjectCard, StateBadge, itemDay } from '@/components/web/cards';
import { municipalityNames } from '@/components/web/blocks/data';
import { FilterForm, InputField, SelectField, ViewTabs } from '@/components/web/forms';
import { EmptyState, Pagination } from '@/components/web/states';
import { Badge, buttonClass, Container, PageIntro, textLinkClass, WebLink } from '@/components/web/ui';
import { getTerritories, listItems } from '@/lib/web/cache';
import { fmtDay, fmtMonth } from '@/lib/web/format';
import { choiceParam, dayParam, pageParam, textParam, withQuery } from '@/lib/web/params';
import { itemPath } from '@/lib/web/routes';
import { PROJECT_CATEGORIES, PROJECT_STATES } from '@/lib/web/schema';
import { pageMetadata } from '@/lib/web/seo';
import { getSite } from '@/lib/web/site';

// Gestión (design §2, IDEA §3.2 «trazabilidad»): the work and actions of the government. Two views of the same items:
//   Obras            cards with their state, filtered by municipio, categoría and estado (GET parameters);
//   Línea de tiempo  everything, newest first, grouped by month, with a filter by DATE ONLY (IDEA §3.2: no tag filters).
// States are what can be said for sure (anunciado, en ejecución, concluido); a percentage or an amount appears only
// with its documented source.
export const revalidate = 60;

const PER_PAGE = 12;
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const PER_TIMELINE = 30;

type Search = Promise<Record<string, string | string[] | undefined>>;

const CATEGORY_KEYS = Object.keys(PROJECT_CATEGORIES) as (keyof typeof PROJECT_CATEGORIES)[];
const STATE_KEYS = Object.keys(PROJECT_STATES) as (keyof typeof PROJECT_STATES)[];

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const [site, sp] = await Promise.all([getSite(), searchParams]);
  const timeline = sp.vista === 'linea';
  const page = pageParam(sp.pagina);
  return pageMetadata(
    {
      title: timeline ? 'Línea de tiempo de la gestión' : 'Gestión y obras',
      description: timeline
        ? 'Todo lo que hace la gestión, día por día, con su fecha, su municipio y su estado.'
        : 'Las obras y acciones de la gestión en los municipios del estado, con su estado, su ubicación y su avance documentado.',
      path: withQuery('/gestion', { vista: timeline ? 'linea' : undefined, pagina: page }),
    },
    site,
  );
}

export default async function ManagementPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const timeline = sp.vista === 'linea';
  return (
    <>
      <PageIntro
        eyebrow="Gestión"
        title="Gestión y obras"
        intro="Las obras y acciones del gobierno, dónde están y en qué estado van. Ninguna cifra sin su fuente."
      />
      <Container className="pb-20">
        <ViewTabs
          label="Vistas de la gestión"
          tabs={[
            { href: '/gestion', label: 'Obras', current: !timeline },
            { href: '/gestion?vista=linea', label: 'Línea de tiempo', current: timeline },
          ]}
        />
        {timeline ? <Timeline sp={sp} /> : <ProjectList sp={sp} />}
      </Container>
    </>
  );
}

async function ProjectList({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const territories = await getTerritories();
  const muniSlug = textParam(sp.municipio, 80);
  const muni = territories.find((t) => t.slug === muniSlug) ?? null;
  const category = choiceParam(sp.categoria, CATEGORY_KEYS);
  const state = choiceParam(sp.estado, STATE_KEYS);
  const page = pageParam(sp.pagina);
  const [munis, { items, total }] = await Promise.all([
    municipalityNames(),
    listItems({ kind: 'project', limit: PER_PAGE, offset: (page - 1) * PER_PAGE, municipalityId: muni?.id, category: category || null, state: state || null }),
  ]);
  const filtered = !!(muni || category || state);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const href = (p: number) => withQuery('/gestion', { municipio: muni?.slug, categoria: category, estado: state, pagina: p });
  return (
    <>
      <FilterForm action="/gestion" label="Filtrar las obras" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
        <SelectField id="f-municipio" name="municipio" label="Municipio" value={muni?.slug ?? ''} allLabel="Todos los municipios" options={territories.map((t) => ({ value: t.slug, label: t.name }))} />
        <SelectField id="f-categoria" name="categoria" label="Categoría" value={category} allLabel="Todas las categorías" options={CATEGORY_KEYS.map((k) => ({ value: k, label: PROJECT_CATEGORIES[k] }))} />
        <SelectField id="f-estado" name="estado" label="Estado" value={state} allLabel="Todos los estados" options={STATE_KEYS.map((k) => ({ value: k, label: PROJECT_STATES[k] }))} />
        <button type="submit" className={buttonClass('olive')}>
          Filtrar
        </button>
      </FilterForm>
      <div className="mb-6 mt-8 flex flex-wrap items-center gap-x-4 gap-y-2" aria-live="polite">
        <p className="text-lg font-semibold text-text">{total === 1 ? '1 obra o acción' : `${total} obras y acciones`}</p>
        {filtered ? (
          <WebLink href="/gestion" className={textLinkClass}>
            Quitar los filtros
          </WebLink>
        ) : null}
      </div>
      {items.length ? (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <li key={p.id} className="flex">
              <ProjectCard item={p} munis={munis} as="h2" />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={filtered ? 'No hay obras con esos filtros.' : 'Todavía no hay obras publicadas.'}>
          {filtered ? (
            <WebLink href="/gestion" className={textLinkClass}>
              Ver todas las obras
            </WebLink>
          ) : (
            'El equipo las publica cuando están revisadas.'
          )}
        </EmptyState>
      )}
      <Pagination page={page} pages={pages} hrefFor={href} label="Páginas de obras" />
    </>
  );
}

async function Timeline({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  let from = dayParam(sp.desde);
  let to = dayParam(sp.hasta);
  if (from && to && from > to) [from, to] = [to, from];
  const page = pageParam(sp.pagina);
  const [munis, { items, total }] = await Promise.all([
    municipalityNames(),
    listItems({ kind: 'project', limit: PER_TIMELINE, offset: (page - 1) * PER_TIMELINE, from: from || null, to: to || null }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PER_TIMELINE));
  const href = (p: number) => withQuery('/gestion', { vista: 'linea', desde: from, hasta: to, pagina: p });
  // Grouped by month, newest first (the list already comes in that order).
  const months: { key: string; label: string; entries: typeof items }[] = [];
  for (const it of items) {
    const day = itemDay(it);
    const key = day.slice(0, 7);
    const last = months[months.length - 1];
    if (last && last.key === key) last.entries.push(it);
    else months.push({ key, label: capitalize(fmtMonth(day)), entries: [it] });
  }
  return (
    <>
      <FilterForm action="/gestion" label="Filtrar la línea de tiempo por fecha" className="grid gap-4 sm:grid-cols-3 sm:items-end">
        <input type="hidden" name="vista" value="linea" />
        <InputField id="f-desde" name="desde" type="date" label="Desde" value={from} />
        <InputField id="f-hasta" name="hasta" type="date" label="Hasta" value={to} />
        <button type="submit" className={buttonClass('olive')}>
          Ver esas fechas
        </button>
      </FilterForm>
      <div className="mb-6 mt-8 flex flex-wrap items-center gap-x-4 gap-y-2" aria-live="polite">
        <p className="text-lg font-semibold text-text">
          {from || to ? `${total} ${total === 1 ? 'entrada' : 'entradas'}${from ? ` desde el ${fmtDay(from)}` : ''}${to ? ` hasta el ${fmtDay(to)}` : ''}` : 'Todo, lo más nuevo primero'}
        </p>
        {from || to ? (
          <WebLink href="/gestion?vista=linea" className={textLinkClass}>
            Ver toda la línea de tiempo
          </WebLink>
        ) : null}
      </div>
      {months.length ? (
        <div className="flex flex-col gap-10">
          {months.map((m) => (
            <section key={m.key} aria-labelledby={`mes-${m.key}`}>
              <h2 id={`mes-${m.key}`} className="mb-4 text-2xl font-bold tracking-tight text-text">
                {m.label}
              </h2>
              <ol className="relative flex flex-col gap-6 border-l-2 border-accent pl-6">
                {m.entries.map((e) => {
                  const muni = e.data.municipalityId ? munis.get(e.data.municipalityId) : null;
                  return (
                    <li key={e.id} className="relative">
                      <span className="absolute -left-[33px] top-1.5 h-4 w-4 rounded-full border-4 border-ivory bg-action" aria-hidden />
                      <p className="text-[15px] font-semibold text-accent-ink">
                        <time dateTime={itemDay(e)}>{fmtDay(itemDay(e))}</time>
                      </p>
                      <h3 className="mt-1 text-xl font-semibold leading-snug text-text">
                        <WebLink href={itemPath('project', e.slug) ?? '/gestion'} className="underline-offset-4 hover:underline">
                          {e.data.title}
                        </WebLink>
                      </h3>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[15px] text-text-2">
                        <StateBadge state={e.data.state} />
                        <Badge>{PROJECT_CATEGORIES[e.data.category]}</Badge>
                        {muni ? (
                          <span className="inline-flex items-center gap-1">
                            <MapPinIcon className="h-4 w-4 shrink-0 text-accent-ink" /> {muni}
                            {e.data.place ? ` · ${e.data.place}` : ''}
                          </span>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState title={from || to ? 'No hay nada publicado en esas fechas.' : 'Todavía no hay entradas publicadas.'}>
          {from || to ? (
            <WebLink href="/gestion?vista=linea" className={textLinkClass}>
              Ver toda la línea de tiempo
            </WebLink>
          ) : null}
        </EmptyState>
      )}
      <Pagination page={page} pages={pages} hrefFor={href} label="Páginas de la línea de tiempo" />
    </>
  );
}
