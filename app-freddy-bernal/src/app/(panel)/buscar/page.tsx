import Link from 'next/link';
import { Search } from 'lucide-react';
import { requireSession, db } from '@/lib/auth/session';
import { PageHeader, EmptyState } from '@/components/ui/page';
import { Card } from '@/components/ui/card';

export const metadata = { title: 'Buscar' };

// Search runs AS THE USER, so it only finds what RLS lets them read. It never
// searches dates or exact addresses (those columns are not in the query).
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const s = await requireSession();
  const { q: raw } = await searchParams;
  const q = (raw ?? '').trim().slice(0, 80);
  const results = q
    ? await db(s, async (sql) => ({
        events: await sql.query<{ id: string; title: string; place_name: string }>(
          `select id, title, place_name from public.events where deleted_at is null and (title ilike '%' || $1 || '%' or place_name ilike '%' || $1 || '%' or municipality ilike '%' || $1 || '%' or code ilike $1) limit 20`,
          [q],
        ),
        pieces: await sql.query<{ id: string; title: string }>(`select id, title from public.pieces where deleted_at is null and title ilike '%' || $1 || '%' limit 20`, [q]),
      }))
    : { events: [], pieces: [] };
  const canPieces = s.roles.some((r) => r === 'admin' || r === 'social' || r === 'boss');
  return (
    <>
      <PageHeader title="Buscar" />
      <form className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <input name="q" defaultValue={q} type="search" autoFocus placeholder="Evento, lugar, municipio o pieza" aria-label="Buscar" className="min-h-12 w-full rounded-[var(--radius-control)] border border-border bg-surface pl-9 pr-3" />
      </form>
      {q && !results.events.length && !results.pieces.length ? <EmptyState title={`No encontré nada con «${q}».`} /> : null}
      {results.events.length ? (
        <Card className="mb-4">
          <h2 className="border-b border-border px-4 py-3 font-semibold">Eventos</h2>
          <ul className="divide-y divide-border">{results.events.map((e) => <li key={e.id}><Link className="block px-4 py-3 hover:bg-surface-2" href={`/eventos/${e.id}`}><b>{e.title}</b> <span className="text-text-2">· {e.place_name}</span></Link></li>)}</ul>
        </Card>
      ) : null}
      {results.pieces.length ? (
        <Card>
          <h2 className="border-b border-border px-4 py-3 font-semibold">Piezas</h2>
          <ul className="divide-y divide-border">{results.pieces.map((p) => <li key={p.id}><Link className="block px-4 py-3 hover:bg-surface-2" href={canPieces ? `/piezas/${p.id}` : `/aprobar/${p.id}`}>{p.title}</Link></li>)}</ul>
        </Card>
      ) : null}
    </>
  );
}
