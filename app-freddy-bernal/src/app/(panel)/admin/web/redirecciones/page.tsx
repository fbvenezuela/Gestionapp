import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Search } from 'lucide-react';
import { requireRole, db } from '@/lib/auth/session';
import { EmptyState, PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { CmsNav } from '@/components/cms/chrome';
import { NewRedirectForm, RedirectRowForm } from '@/components/cms/redirect-forms';
import { noPermissionUrl } from '@/components/shell/no-permission';
import { REDIRECT_PAGE_SIZE, redirectList, reviewQueue, webCaps } from '@/lib/data/web-admin';
import { ADMIN_WEB } from '@/lib/web/cms/kinds';
import { fmtDateTime } from '@/lib/time';
import { cn } from '@/lib/cn';

export const metadata = { title: 'Redirecciones · Web' };

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

// The old addresses and where they go now (design §2, web_redirects): who keeps the site adds, fixes and removes them;
// the importer of the old site fills most (source «importador»). Changing one is live in about a minute (the proxy and
// the lookup remember answers that long; this server forgets at once).
export default async function RedirectsPage({ searchParams }: { searchParams: Search }) {
  const s = await requireRole('admin', 'web_publisher', 'boss', 'writer');
  const sp = await searchParams;
  const q = one(sp.q).trim().slice(0, 120);
  const page = Math.max(1, Number.parseInt(one(sp.pagina), 10) || 1);
  const data = await db(s, async (sql) => ({ caps: await webCaps(sql), list: await redirectList(sql, { q, page }), waiting: (await reviewQueue(sql)).length }));
  if (!data.caps.canManageSite) redirect(noPermissionUrl(ADMIN_WEB.home));
  const { list } = data;
  const pages = Math.max(1, Math.ceil(list.total / REDIRECT_PAGE_SIZE));
  const hrefFor = (p: number) => `${ADMIN_WEB.redirects}?${new URLSearchParams({ ...(q ? { q } : {}), ...(p > 1 ? { pagina: String(p) } : {}) })}`;
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <PageHeader title="Redirecciones" subtitle="Direcciones viejas que llevan a las nuevas, para que ningún enlace guardado o compartido se pierda." back={{ href: ADMIN_WEB.home, label: 'La web' }} />
      <CmsNav current="redirecciones" caps={data.caps} waiting={data.waiting} />
      <Card>
        <CardHeader title="Nueva redirección" />
        <CardBody>
          <NewRedirectForm />
        </CardBody>
      </Card>
      <form action={ADMIN_WEB.redirects} method="get" role="search" aria-label="Buscar redirecciones" className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1.5 text-sm font-semibold">
          Buscar
          <Input name="q" type="search" defaultValue={q} placeholder="Parte de la dirección vieja o nueva" />
        </label>
        <button type="submit" className={buttonVariants({ variant: 'secondary' })}>
          <Search className="h-4 w-4" aria-hidden /> Buscar
        </button>
      </form>
      <p className="text-sm text-text-2">{list.total === 1 ? '1 redirección' : `${list.total} redirecciones`}</p>
      {list.rows.length ? (
        <Card solid>
          <ul className="divide-y divide-border">
            {list.rows.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 px-4 py-3">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="break-all font-mono text-[15px] font-semibold">{r.from}</span>
                  <Chip tone={r.source === 'importador' ? 'info' : 'neutral'}>{r.source === 'importador' ? 'Del importador' : 'A mano'}</Chip>
                </span>
                <span className="text-xs text-text-2">
                  {fmtDateTime(r.createdAt)}
                  {r.createdByName ? ` · ${r.createdByName}` : ''}
                </span>
                <RedirectRowForm r={r} />
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState title={q ? 'Ninguna redirección coincide.' : 'Todavía no hay redirecciones.'} />
      )}
      {pages > 1 ? (
        <nav aria-label="Páginas" className="flex items-center justify-between gap-2">
          <Link href={hrefFor(page - 1)} aria-disabled={page <= 1} className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), page <= 1 && 'pointer-events-none opacity-50')}>
            ← Anteriores
          </Link>
          <span className="text-sm text-text-2">
            Página {page} de {pages}
          </span>
          <Link href={hrefFor(page + 1)} aria-disabled={page >= pages} className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), page >= pages && 'pointer-events-none opacity-50')}>
            Siguientes →
          </Link>
        </nav>
      ) : null}
    </div>
  );
}
