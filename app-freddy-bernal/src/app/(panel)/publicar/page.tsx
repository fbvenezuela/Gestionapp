import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requireRole, db } from '@/lib/auth/session';
import { PageHeader, EmptyState } from '@/components/ui/page';
import { Card, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { LinkButton } from '@/components/ui/button';
import { NETWORK_LABEL, PUB_STATUS } from '@/lib/data/labels';
import { fmtDateTime, fmtDay, dt, ms } from '@/lib/time';

export const metadata = { title: 'Publicar' };

type Pub = { id: string; network: string; format: string; status: string; scheduled_at: string | null; published_at: string | null; title: string; failure_reason: string | null; republish_of: string | null; origin: string };

export default async function PublishPage() {
  const s = await requireRole('admin', 'social');
  const data = await db(s, async (sql) => ({
    ready: await sql.query<{ id: string; title: string }>(
      `select p.id, p.title from public.pieces p where p.status = 'approved' and p.deleted_at is null
         and not exists (select 1 from public.publications x where x.piece_id = p.id and x.deleted_at is null) order by p.approved_at desc limit 20`,
    ),
    pubs: await sql.query<Pub>(
      `select x.id, x.network, x.format, x.status, x.scheduled_at, x.published_at, coalesce(p.title, x.title) as title, x.failure_reason, x.republish_of, x.origin
         from public.publications x left join public.pieces p on p.id = x.piece_id
        where x.deleted_at is null and (x.status in ('draft', 'scheduled', 'failed') or x.published_at > now() - interval '14 days')
        order by coalesce(x.scheduled_at, x.published_at, x.created_at) desc limit 200`,
    ),
  }));
  const upcoming = data.pubs.filter((p) => p.status === 'scheduled' || p.status === 'draft' || p.status === 'failed').sort((a, b) => (ms(a.scheduled_at) || Infinity) - (ms(b.scheduled_at) || Infinity));
  const done = data.pubs.filter((p) => p.status === 'published');
  const byDay = new Map<string, Pub[]>();
  for (const p of upcoming) {
    const k = p.scheduled_at ? dt(p.scheduled_at)!.toISODate()! : 'sin-hora';
    byDay.set(k, [...(byDay.get(k) ?? []), p]);
  }
  return (
    <>
      <PageHeader title="Publicar" subtitle="Calendario de publicaciones por red. Por ahora se publica a mano: descarga el paquete y marca «Ya lo publiqué»." actions={
          <div className="flex flex-wrap gap-2">
            <LinkButton variant="secondary" href="/publicar/espontanea">Registrar lo que publicó el jefe</LinkButton>
            <LinkButton href="/publicar/nueva"><Plus className="h-4 w-4" aria-hidden /> Nueva publicación</LinkButton>
          </div>
        } />
      {data.ready.length ? (
        <Card className="mb-5">
          <CardHeader title="Aprobadas y sin publicar" />
          <ul className="divide-y divide-border">
            {data.ready.map((p) => (
              <li key={p.id}>
                <Link href={`/publicar/nueva?pieza=${p.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-surface-2">
                  <span className="flex-1 font-semibold">{p.title}</span>
                  <Chip tone="ok">Lista</Chip>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <h2 className="mb-2 text-lg font-bold">Lo que viene</h2>
      {upcoming.length === 0 ? (
        <EmptyState title="No hay publicaciones programadas." />
      ) : (
        <div className="mb-6 flex flex-col gap-4">
          {[...byDay.entries()].map(([k, list]) => (
            <Card key={k}>
              <CardHeader title={<span className="first-letter:uppercase">{k === 'sin-hora' ? 'Sin hora' : fmtDay(k)}</span>} />
              <ul className="divide-y divide-border">{list.map((p) => <PubRow key={p.id} p={p} />)}</ul>
            </Card>
          ))}
        </div>
      )}
      <h2 className="mb-2 text-lg font-bold">Publicado (últimas 2 semanas)</h2>
      {done.length ? (
        <Card><ul className="divide-y divide-border">{done.map((p) => <PubRow key={p.id} p={p} />)}</ul></Card>
      ) : (
        <EmptyState title="Nada publicado todavía." />
      )}
    </>
  );
}

function PubRow({ p }: { p: Pub }) {
  return (
    <li>
      <Link href={`/publicar/${p.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-surface-2">
        <span className="w-20 shrink-0 font-mono text-sm font-semibold">{p.scheduled_at || p.published_at ? fmtDateTime(p.published_at ?? p.scheduled_at).split(', ').pop() : '—'}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{p.title}</span>
          <span className="block text-sm text-text-2">{NETWORK_LABEL[p.network]} · {p.origin === 'boss_spontaneous' ? 'la publicó el jefe' : p.format}{p.republish_of ? ' · republicación' : ''}{p.failure_reason ? ` · ${p.failure_reason}` : ''}</span>
        </span>
        <Chip tone={PUB_STATUS[p.status]?.tone}>{PUB_STATUS[p.status]?.label}</Chip>
      </Link>
    </li>
  );
}
