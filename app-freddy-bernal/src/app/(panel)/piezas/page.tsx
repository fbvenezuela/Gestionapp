import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requireRole, db } from '@/lib/auth/session';
import { PageHeader, EmptyState } from '@/components/ui/page';
import { Tip } from '@/components/ui/tip';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { LinkButton } from '@/components/ui/button';
import { PIECE_KIND, PIECE_STATUS } from '@/lib/data/labels';
import { cn } from '@/lib/cn';

export const metadata = { title: 'Piezas' };

const FILTERS = [
  { key: 'activas', label: 'En curso', statuses: ['draft', 'changes_requested', 'in_review'] },
  { key: 'aprobadas', label: 'Aprobadas', statuses: ['approved'] },
  { key: 'todas', label: 'Todas', statuses: ['draft', 'changes_requested', 'in_review', 'approved', 'archived'] },
];

export default async function PiecesPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const s = await requireRole('admin', 'social');
  const { ver } = await searchParams;
  const filter = FILTERS.find((f) => f.key === ver) ?? FILTERS[0];
  const rows = await db(s, (sql) =>
    sql.query<{ id: string; title: string; kind: string; status: string; current_version: number; event_title: string | null; pubs: number }>(
      `select p.id, p.title, p.kind, p.status, p.current_version, e.title as event_title,
              (select count(*)::int from public.publications x where x.piece_id = p.id and x.status = 'published' and x.deleted_at is null) as pubs
         from public.pieces p left join public.events e on e.id = p.event_id
        where p.deleted_at is null and p.status = any($1::text[])
        order by array_position(array['changes_requested','draft','in_review','approved','archived'], p.status), p.updated_at desc`,
      [filter.statuses],
    ),
  );
  return (
    <>
      <PageHeader title="Piezas" subtitle="Videos, portadas, carruseles y fotos, con sus copies." actions={<LinkButton href="/piezas/nueva"><Plus className="h-4 w-4" aria-hidden /> Nueva pieza</LinkButton>} />
      <Tip id="piezas">Abre una pieza para subir el archivo, escribir los copies y mandarla a aprobar.</Tip>
      <div className="mb-4 flex gap-1 overflow-x-auto" role="tablist">
        {FILTERS.map((f) => (
          <Link key={f.key} role="tab" aria-selected={filter.key === f.key} href={`/piezas?ver=${f.key}`} className={cn('min-h-10 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold', filter.key === f.key ? 'bg-slate text-on-slate' : 'bg-surface text-text-2 border border-border')}>
            {f.label}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No hay piezas aquí." action={<LinkButton href="/piezas/nueva">Crear la primera</LinkButton>} />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {rows.map((p) => (
              <li key={p.id}>
                <Link href={`/piezas/${p.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-surface-2">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{p.title}</span>
                    <span className="block truncate text-sm text-text-2">{PIECE_KIND[p.kind]} · v{p.current_version || 0}{p.event_title ? ` · ${p.event_title}` : ''}</span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <Chip tone={PIECE_STATUS[p.status]?.tone}>{PIECE_STATUS[p.status]?.label}</Chip>
                    {p.pubs ? <span className="text-xs text-text-2">Publicada en {p.pubs}</span> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
