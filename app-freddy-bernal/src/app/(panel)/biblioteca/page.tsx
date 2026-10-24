import Link from 'next/link';
import { FolderOpen, Search } from 'lucide-react';
import { requireRole, db } from '@/lib/auth/session';
import { canSeeSchedule } from '@/lib/roles';
import { PageHeader, EmptyState } from '@/components/ui/page';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { DownloadAll } from '@/components/media/download-all';
import { MEDIA_KIND } from '@/lib/data/labels';
import { fmtDay } from '@/lib/time';
import { RemoveMedia } from '@/app/(panel)/eventos/[id]/remove-media';
import { mediaLockChip, mediaLockSql } from '@/lib/domain/media-lock';

export const metadata = { title: 'Biblioteca' };

// lock = why a file cannot be removed (media-lock.ts), or null.
type Row = { event_id: string; title: string; code: string; day: string | Date | null; media: { id: string; kind: string; label: string; lock: string | null }[] };

// Day → event → material, like the client's Drive. For the social team the day only
// exists once the event is marked done (the date rule).
export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const s = await requireRole('admin', 'social', 'supervisor', 'dispatch');
  const { q } = await searchParams;
  const schedule = canSeeSchedule(s.roles);
  const canRemove = s.roles.includes('admin');
  const rows = await db(s, (sql) =>
    sql.query<Row>(
      `select e.id as event_id, e.title, e.code,
              ${schedule ? `coalesce(e.done_on, (select (sc.starts_at at time zone 'America/Caracas')::date from public.event_schedule sc where sc.event_id = e.id and sc.starts_at < now()))` : 'e.done_on'} as day,
              coalesce((select json_agg(json_build_object('id', m.id, 'kind', m.kind, 'label', m.label,
                                'lock', ${mediaLockSql('m.id')}) order by m.kind, m.created_at)
                          from public.media_assets m where m.event_id = e.id and m.deleted_at is null and m.status = 'ready'), '[]') as media
         from public.events e
        where e.deleted_at is null and exists (select 1 from public.media_assets m where m.event_id = e.id and m.deleted_at is null and m.status = 'ready')
          and ($1::text is null or e.title ilike '%' || $1 || '%' or e.place_name ilike '%' || $1 || '%')
        order by 4 desc nulls last, e.code desc`,
      [q?.trim() || null],
    ),
  );
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = r.day ? fmtDay(r.day, 'yyyy-MM-dd') : 'sin-dia';
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return (
    <>
      <PageHeader title="Biblioteca" subtitle="El material por día y por evento, como el Drive." />
      <form className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <input name="q" defaultValue={q} type="search" placeholder="Buscar por evento o lugar" aria-label="Buscar en la biblioteca" className="min-h-11 w-full rounded-[var(--radius-control)] border border-border bg-surface pl-9 pr-3" />
      </form>
      {rows.length === 0 ? (
        <EmptyState icon={<FolderOpen className="h-8 w-8" />} title="Todavía no hay material." />
      ) : (
        <div className="flex flex-col gap-6">
          {[...groups.entries()].map(([k, list]) => (
            <section key={k}>
              <h2 className="mb-2 flex items-center gap-2 text-lg font-bold first-letter:uppercase">
                <FolderOpen className="h-5 w-5 text-accent-ink" aria-hidden />
                {k === 'sin-dia' ? 'En preparación (todavía sin día)' : fmtDay(list[0].day)}
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {list.map((r) => {
                  const counts = (kind: string[]) => r.media.filter((m) => kind.includes(m.kind)).length;
                  return (
                    <Card key={r.event_id} className="flex flex-col gap-3 p-4">
                      <Link href={`/eventos/${r.event_id}?tab=material`} className="font-semibold hover:underline">{r.title}</Link>
                      <div className="flex flex-wrap gap-1.5">
                        {counts(['boss']) ? <Chip>Jefe: {counts(['boss'])}</Chip> : null}
                        {counts(['drone']) ? <Chip>Dron: {counts(['drone'])}</Chip> : null}
                        {counts(['broll', 'other']) ? <Chip>Apoyo: {counts(['broll', 'other'])}</Chip> : null}
                        {counts(['final']) ? <Chip tone="ok">Finales: {counts(['final'])}</Chip> : null}
                        {counts(['cover']) ? <Chip tone="info">Portadas: {counts(['cover'])}</Chip> : null}
                      </div>
                      <DownloadAll ids={r.media.map((m) => m.id)} />
                      {canRemove ? (
                        <details className="rounded-[var(--radius-control)] border border-border">
                          <summary className="flex min-h-11 cursor-pointer items-center px-3 text-[15px] font-semibold">Ver archivos ({r.media.length})</summary>
                          <ul className="divide-y divide-border border-t border-border">
                            {r.media.map((m) => (
                              <li key={m.id} className="flex items-center gap-2 px-3 py-1">
                                <span className="min-w-0 flex-1 truncate text-[15px]">{m.label || MEDIA_KIND[m.kind]}</span>
                                {mediaLockChip(m.lock) ? <Chip tone="ok">{mediaLockChip(m.lock)}</Chip> : <RemoveMedia id={m.id} label={m.label || MEDIA_KIND[m.kind]} />}
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

