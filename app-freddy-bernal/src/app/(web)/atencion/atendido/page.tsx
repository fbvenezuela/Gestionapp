import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { Band, BtnLink, PageIntro, inputStyle, buttonStyle, webCard } from '@/components/participation/kit';
import { ParticipationNav } from '@/components/participation/participation-nav';
import { TYPE_COPY, dayDate, longDate } from '@/components/participation/words';
import { isRequestType } from '@/components/participation/form-core';
import { cn } from '@/lib/cn';
import { bySlug, loadAttended, loadFormCatalog, type AttendedItem } from '../_lib/data';

export const metadata: Metadata = {
  title: 'Lo atendido',
  description: 'Casos resueltos que el equipo del gobernador publicó, sin datos de las personas.',
  alternates: { canonical: '/atencion/atendido' },
};

const PER_PAGE = 12;
const MONTH = new Intl.DateTimeFormat('es-VE', { month: 'long', year: 'numeric', timeZone: 'America/Caracas' });

type Search = { municipio?: string | string[]; categoria?: string | string[]; pagina?: string | string[] };

// «Lo atendido» (design §4): what the coordination published of resolved cases, anonymized by the database (the name
// only with consent, else initials; a denuncia only «Denuncia atendida en el municipio X»). Read as anon; filters by
// municipality and category in the address (public data), works without JavaScript.
export default async function AttendedPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const catalog = await loadFormCatalog();
  const municipality = bySlug(catalog.municipalities, sp.municipio);
  const category = bySlug(catalog.categories, sp.categoria);
  const page = Math.max(1, Math.min(500, Number(typeof sp.pagina === 'string' ? sp.pagina : '1') || 1));
  const data = await loadAttended({ municipalityId: municipality?.id ?? null, categoryId: category?.id ?? null, page, perPage: PER_PAGE });
  const muniName = new Map(catalog.municipalities.map((m) => [m.id, m.name]));
  const catName = new Map(catalog.categories.map((c) => [c.id, c.name]));
  const filtered = !!(municipality || category);
  const query = (p: number) => {
    const q = new URLSearchParams();
    if (municipality) q.set('municipio', municipality.slug);
    if (category) q.set('categoria', category.slug);
    if (p > 1) q.set('pagina', String(p));
    const s = q.toString();
    return `/atencion/atendido${s ? `?${s}` : ''}`;
  };

  // Grouped by the month it was published: a timeline, not a wall of identical cards.
  const groups: { month: string; items: AttendedItem[] }[] = [];
  for (const it of data.items) {
    const month = MONTH.format(it.publishedAt);
    const g = groups.at(-1);
    if (g && g.month === month) g.items.push(it);
    else groups.push({ month, items: [it] });
  }

  return (
    <div className="w-full bg-ivory text-text">
      <Band className="pb-4 sm:pb-6">
        <ParticipationNav current="atendido" />
        <PageIntro
          eyebrow="Atención ciudadana"
          title="Lo atendido"
          lead="Casos que se resolvieron y que el equipo publicó, sin datos de las personas. El nombre aparece solo si la persona lo permitió; si no, sus iniciales. Las denuncias se nombran solo por su municipio."
        />
      </Band>

      <Band className="pt-2 sm:pt-4">
        <form method="get" action="/atencion/atendido" className={cn(webCard, 'grid gap-4 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end')}>
          <div className="flex flex-col gap-2">
            <label htmlFor="filtro-municipio" className="text-base font-semibold text-text">
              Municipio
            </label>
            <select id="filtro-municipio" name="municipio" defaultValue={municipality?.slug ?? ''} className={inputStyle}>
              <option value="">Todos</option>
              {catalog.municipalities.map((m) => (
                <option key={m.id} value={m.slug}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="filtro-categoria" className="text-base font-semibold text-text">
              Categoría
            </label>
            <select id="filtro-categoria" name="categoria" defaultValue={category?.slug ?? ''} className={inputStyle}>
              <option value="">Todas</option>
              {catalog.categories.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={buttonStyle({ tone: 'olive', size: 'md' })}>
              Filtrar
            </button>
            {filtered ? (
              <Link href="/atencion/atendido" className={buttonStyle({ tone: 'ghost', size: 'md' })}>
                Quitar filtros
              </Link>
            ) : null}
          </div>
        </form>

        <p className="mt-6 text-[15px] text-text-2" aria-live="polite">
          {data.total === 0 ? '' : data.total === 1 ? '1 caso publicado' : `${data.total} casos publicados`}
          {filtered ? ` ${[municipality ? `en ${municipality.name}` : '', category ? `de ${category.name.toLowerCase()}` : ''].filter(Boolean).join(' ')}` : ''}
        </p>

        {data.items.length === 0 ? (
          <div className="mt-6 flex flex-col items-start gap-4 rounded-[var(--radius-card)] border border-dashed border-border bg-surface p-8">
            <CheckCircle2 className="h-8 w-8 text-accent-ink" aria-hidden />
            <h2 className="text-xl font-bold text-text">{filtered ? 'Nada publicado con esos filtros' : 'Todavía no hay casos publicados'}</h2>
            <p className="max-w-xl text-[15px] leading-relaxed text-text-2">
              {filtered
                ? 'Prueba con otro municipio u otra categoría.'
                : 'Cuando el equipo resuelva casos y los publique, aparecerán aquí, sin datos de las personas.'}
            </p>
            <BtnLink href="/atencion/nueva" tone="action" size="md">
              Hacer un reporte
            </BtnLink>
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-10">
            {groups.map((g, gi) => (
              <section key={g.month} aria-labelledby={`mes-${gi}`} className="grid gap-4 md:grid-cols-[12rem_1fr] md:gap-8">
                <h2 id={`mes-${gi}`} className="text-lg font-bold text-accent-ink first-letter:uppercase md:sticky md:top-24 md:self-start">
                  {g.month}
                </h2>
                <ol className="flex flex-col gap-4">
                  {g.items.map((it, i) => (
                    <AttendedCard key={it.id} it={it} featured={i === 0 && page === 1 && g === groups[0]} muni={muniName} cat={catName} />
                  ))}
                </ol>
              </section>
            ))}
          </div>
        )}

        {data.pages > 1 ? (
          <nav aria-label="Páginas" className="mt-10 flex items-center justify-between gap-3">
            {page > 1 ? (
              <Link href={query(page - 1)} className={buttonStyle({ tone: 'soft', size: 'md' })}>
                Más recientes
              </Link>
            ) : (
              <span />
            )}
            <span className="text-[15px] text-text-2">
              Página {page} de {data.pages}
            </span>
            {page < data.pages ? (
              <Link href={query(page + 1)} className={buttonStyle({ tone: 'soft', size: 'md' })}>
                Anteriores
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </Band>
    </div>
  );
}

function AttendedCard({ it, featured, muni, cat }: { it: AttendedItem; featured: boolean; muni: Map<string, string>; cat: Map<string, string> }) {
  const type = isRequestType(it.type) ? TYPE_COPY[it.type].label : 'Solicitud';
  const denuncia = it.type === 'denuncia';
  const place = it.municipalityId ? muni.get(it.municipalityId) : null;
  const category = it.categoryId ? cat.get(it.categoryId) : null;
  return (
    <li
      className={cn(
        webCard,
        'p-5 shadow-[var(--glass-shadow)] sm:p-6',
        featured && 'border-accent bg-accent-soft sm:p-8',
        denuncia && 'bg-surface-2',
      )}
    >
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm font-semibold text-text-2">
        <span className="text-accent-ink">{type}</span>
        {category && !denuncia ? <span>{category}</span> : null}
        {place ? <span>{place}</span> : null}
      </p>
      <p className={cn('mt-2 leading-relaxed text-text', featured ? 'text-xl font-semibold sm:text-2xl' : 'text-[17px]')}>{it.summary}</p>
      <p className="mt-3 text-sm text-text-2">
        {it.displayName && !denuncia ? <span className="font-semibold text-text">{it.displayName} · </span> : null}
        {it.resolvedOn ? `Resuelto el ${dayDate(it.resolvedOn)}` : `Publicado el ${longDate(it.publishedAt)}`}
      </p>
    </li>
  );
}
