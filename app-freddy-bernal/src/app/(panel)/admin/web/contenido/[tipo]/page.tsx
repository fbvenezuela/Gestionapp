import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import { requireRole, db } from '@/lib/auth/session';
import { EmptyState, PageHeader } from '@/components/ui/page';
import { Card } from '@/components/ui/card';
import { LinkButton, buttonVariants } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { CmsNav, FlowChips, KindTabs, flowLine } from '@/components/cms/chrome';
import { ADMIN_PAGE_SIZE, adminList, kindCounts, reviewQueue, webCaps } from '@/lib/data/web-admin';
import { ADMIN_WEB, sectionBySlug } from '@/lib/web/cms/kinds';
import { sectionLabel } from '@/lib/web/cms/section-label';
import { isStatusFilter, STATUS_FILTERS } from '@/lib/web/cms/status';
import { pagePath, itemPath } from '@/lib/web/routes';
import { fmtDateTime } from '@/lib/time';
import { cn } from '@/lib/cn';
import type { WebKind } from '@/lib/web/schema';

type Params = Promise<{ tipo: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }) {
  const section = sectionBySlug((await params).tipo);
  return { title: section ? `${sectionLabel(section)} · Web` : 'Web' };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

// One kind's list (design §3): every item with its chips (borrador, en revisión, programado, publicado, archivado and
// what else matters), by state and by words, newest change first (what waits for approval on top). «Nuevo» only for whom
// the database lets write drafts (the editor, the publisher, the boss); pages are the site's own and are not created.
export default async function ContentListPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const s = await requireRole('writer', 'web_publisher', 'boss', 'admin');
  const section = sectionBySlug((await params).tipo);
  if (!section) notFound();
  const sp = await searchParams;
  const status = isStatusFilter(one(sp.estado)) ? (one(sp.estado) as keyof typeof STATUS_FILTERS) : null;
  const q = one(sp.q).trim().slice(0, 80);
  const page = Math.max(1, Number.parseInt(one(sp.pagina), 10) || 1);
  const data = await db(s, async (sql) => ({
    caps: await webCaps(sql),
    list: await adminList(sql, { kind: section.kind, status, q, page }),
    kinds: await kindCounts(sql),
    waiting: (await reviewQueue(sql)).length,
  }));
  const { caps, list } = data;
  const counts = Object.fromEntries(data.kinds.map((k) => [k.kind, k.total])) as Partial<Record<WebKind, number>>;
  const pages = Math.max(1, Math.ceil(list.total / ADMIN_PAGE_SIZE));
  const hrefFor = (p: number) => {
    const u = new URLSearchParams();
    if (status) u.set('estado', status);
    if (q) u.set('q', q);
    if (p > 1) u.set('pagina', String(p));
    const qs = u.toString();
    return `${ADMIN_WEB.list(section.kind)}${qs ? `?${qs}` : ''}`;
  };
  const filtered = !!(status || q);
  const label = sectionLabel(section);

  return (
    <div className="mx-auto flex max-w-5xl flex-col">
      <PageHeader
        title={label}
        subtitle={section.hint}
        back={{ href: ADMIN_WEB.home, label: 'La web' }}
        actions={
          caps.canEdit && section.create ? (
            <LinkButton href={ADMIN_WEB.create(section.kind)}>
              <Plus className="h-4 w-4" aria-hidden /> {section.create}
            </LinkButton>
          ) : null
        }
      />
      <CmsNav current="contenido" caps={caps} waiting={data.waiting} />
      <KindTabs current={section.kind} counts={counts} />

      <form action={ADMIN_WEB.list(section.kind)} method="get" role="search" aria-label={`Buscar en ${label}`} className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1.5 text-sm font-semibold">
          Buscar
          <Input name="q" type="search" defaultValue={q} placeholder="Palabras del título o del resumen" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold sm:w-52">
          Estado
          <Select name="estado" defaultValue={status ?? ''}>
            <option value="">Todos</option>
            {Object.entries(STATUS_FILTERS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </Select>
        </label>
        <button type="submit" className={buttonVariants({ variant: 'secondary' })}>
          <Search className="h-4 w-4" aria-hidden /> Filtrar
        </button>
      </form>

      <p className="mb-2 text-sm text-text-2" aria-live="polite">
        {list.total === 1 ? '1 resultado' : `${list.total} resultados`}
        {filtered ? (
          <>
            {' · '}
            <Link href={ADMIN_WEB.list(section.kind)} className="font-semibold text-accent-ink underline underline-offset-4">
              Quitar los filtros
            </Link>
          </>
        ) : null}
      </p>

      {list.rows.length ? (
        <Card solid>
          <ul className="divide-y divide-border">
            {list.rows.map((r) => {
              const where = section.kind === 'page' ? pagePath(r.slug) : itemPath(section.kind, r.slug);
              const line = flowLine(r);
              return (
                <li key={r.id}>
                  <Link href={ADMIN_WEB.edit(r.id)} className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 hover:bg-surface-2">
                    <span className="min-w-0 flex-1 basis-56">
                      <span className="block font-semibold">{r.title || 'Sin título'}</span>
                      {r.excerpt ? <span className="line-clamp-2 block text-sm text-text-2">{r.excerpt}</span> : null}
                      <span className="mt-0.5 block text-sm text-text-2">
                        {line ? `${line} · ` : ''}Cambiado {fmtDateTime(r.updatedAt)}
                        {r.updatedByName ? ` por ${r.updatedByName}` : ''}
                        {where ? <span className="ml-1 break-all font-mono text-xs">{where}</span> : null}
                      </span>
                    </span>
                    <FlowChips flow={r} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : (
        <EmptyState
          title={filtered ? 'Nada coincide con esos filtros.' : `Todavía no hay ${section.kind === 'episode' ? 'episodios' : label.toLowerCase()}.`}
          action={
            caps.canEdit && section.create && !filtered ? (
              <LinkButton href={ADMIN_WEB.create(section.kind)} variant="secondary">
                <Plus className="h-4 w-4" aria-hidden /> {section.create}
              </LinkButton>
            ) : null
          }
        />
      )}

      {pages > 1 ? (
        <nav aria-label="Páginas" className="mt-4 flex items-center justify-between gap-2">
          <Link
            href={hrefFor(page - 1)}
            aria-disabled={page <= 1}
            className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), page <= 1 && 'pointer-events-none opacity-50')}
          >
            ← Anteriores
          </Link>
          <span className="text-sm text-text-2">
            Página {page} de {pages}
          </span>
          <Link
            href={hrefFor(page + 1)}
            aria-disabled={page >= pages}
            className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), page >= pages && 'pointer-events-none opacity-50')}
          >
            Siguientes →
          </Link>
        </nav>
      ) : null}
    </div>
  );
}
