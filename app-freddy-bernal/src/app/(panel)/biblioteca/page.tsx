import Link from 'next/link';
import { Archive, FolderOpen, Search } from 'lucide-react';
import { requireRole, db } from '@/lib/auth/session';
import { canSeeSchedule } from '@/lib/roles';
import { PageHeader, EmptyState } from '@/components/ui/page';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { DownloadAll } from '@/components/media/download-all';
import { DriveDownload } from '@/components/media/drive-download';
import { DriveThumb } from '@/components/media/drive-thumb';
import { MediaThumb } from '@/components/media/media-thumb';
import { DrivePicker } from '@/components/media/drive-picker';
import { DriveImportScan } from '@/components/media/drive-import-scan';
import { MEDIA_KIND } from '@/lib/data/labels';
import { driveUi } from '@/lib/data/drive';
import { fmtDay } from '@/lib/time';
import { RemoveMedia } from '@/app/(panel)/eventos/[id]/remove-media';
import { mediaLockChip, mediaLockSql } from '@/lib/domain/media-lock';

export const metadata = { title: 'Biblioteca' };

// lock = why a file cannot be removed (media-lock.ts), or null. bucket 'drive' = in Google Drive.
type M = { id: string; kind: string; label: string; lock: string | null; bucket: string; mime: string; size: number; duration_s?: number | null };
type Row = { event_id: string; title: string; code: string; day: string | Date | null; media: M[] };

function size(b: number) {
  return b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`;
}
function dur(s: number | null | undefined) {
  if (!s) return '';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, '0')}`;
}
const driveRefs = (list: M[]) => list.filter((m) => m.bucket === 'drive').map((m) => ({ id: m.id, label: m.label || MEDIA_KIND[m.kind], size: Number(m.size) }));

// Day → event → material, like the client's Drive. For the social team the day only
// exists once the event is marked done (the date rule). Search: event title, place or code, and
// the name the platform gave a file («Jefe hablando 2», «Archivo 007»); never dates.
export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const s = await requireRole('admin', 'social', 'dispatch', 'boss');
  const { q } = await searchParams;
  const schedule = canSeeSchedule(s.roles);
  const canRemove = s.roles.includes('admin');
  const term = q?.trim() || null;
  const { rows, archive } = await db(s, async (sql) => ({
    rows: await sql.query<Row>(
      `select e.id as event_id, e.title, e.code,
              ${schedule ? `coalesce(e.done_on, (select (sc.starts_at at time zone 'America/Caracas')::date from public.event_schedule sc where sc.event_id = e.id and sc.starts_at < now()))` : 'e.done_on'} as day,
              coalesce((select json_agg(json_build_object('id', m.id, 'kind', m.kind, 'label', m.label, 'bucket', m.bucket, 'mime', m.mime, 'size', m.size_bytes,
                                'lock', ${mediaLockSql('m.id')}) order by m.kind, m.created_at)
                          from public.media_assets m where m.event_id = e.id and m.deleted_at is null and m.status = 'ready'), '[]') as media
         from public.events e
        where e.deleted_at is null and exists (select 1 from public.media_assets m where m.event_id = e.id and m.deleted_at is null and m.status = 'ready')
          and ($1::text is null or e.title ilike '%' || $1 || '%' or e.place_name ilike '%' || $1 || '%' or e.code ilike '%' || $1 || '%'
               or exists (select 1 from public.media_assets m where m.event_id = e.id and m.deleted_at is null and m.status = 'ready' and m.label ilike '%' || $1 || '%'))
        order by 4 desc nulls last, e.code desc`,
      [term],
    ),
    // «Archivo»: what came from Drive with no event (picked here, or brought by the import script).
    archive: await sql.query<M>(
      `select m.id, m.kind, m.label, m.bucket, m.mime, m.size_bytes as size, m.duration_s, ${mediaLockSql('m.id')} as lock
         from public.media_assets m
        where m.event_id is null and m.bucket = 'drive' and m.kind = 'other' and m.deleted_at is null and m.status = 'ready'
          and ($1::text is null or m.label ilike '%' || $1 || '%')
        order by m.created_at desc limit 300`,
      [term],
    ),
  }));
  // Its own short query, after (never inside) the one above.
  const drive = await driveUi(s);
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = r.day ? fmtDay(r.day, 'yyyy-MM-dd') : 'sin-dia';
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return (
    <>
      <PageHeader title="Biblioteca" subtitle="El material por día y por evento, como el Drive." />
      {drive.problem ? (
        <p role="alert" className="mb-4 rounded-[var(--radius-control)] bg-danger-soft px-3 py-2 text-[15px] text-danger">
          {drive.problem === 'disconnected' ? 'Drive no está conectado: no se puede subir ni abrir lo que está ahí.' : 'Se venció el permiso de Google Drive: no se puede subir ni abrir lo que está ahí.'}{' '}
          <Link href="/ajustes/drive" className="font-semibold underline">Ajustes → Google Drive</Link>
        </p>
      ) : null}
      <form className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <input name="q" defaultValue={q} type="search" placeholder="Buscar por evento o lugar" aria-label="Buscar en la biblioteca" className="min-h-11 w-full rounded-[var(--radius-control)] border border-border bg-surface pl-9 pr-3" />
      </form>
      {drive.picker ? (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <DrivePicker eventId={null} kind="other" label="Elegir de Drive" />
          <DriveImportScan />
        </div>
      ) : null}
      {rows.length === 0 && archive.length === 0 ? (
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
                  // The pictures made at upload time (any storage) or Drive's; a file without one shows its icon.
                  const thumbs = r.media.filter((m) => /^(image|video)\//.test(m.mime) || m.bucket === 'drive').slice(0, 4);
                  return (
                    <Card key={r.event_id} className="flex flex-col gap-3 p-4">
                      <Link href={`/eventos/${r.event_id}?tab=material`} className="font-semibold hover:underline">{r.title}</Link>
                      {thumbs.length ? (
                        <div className="flex gap-2" aria-hidden>
                          {thumbs.map((m) => <MediaThumb key={m.id} ids={[m.id]} mime={m.mime} className="h-14 w-14" />)}
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-1.5">
                        {counts(['boss']) ? <Chip>Jefe: {counts(['boss'])}</Chip> : null}
                        {counts(['drone']) ? <Chip>Dron: {counts(['drone'])}</Chip> : null}
                        {counts(['broll', 'other']) ? <Chip>Apoyo: {counts(['broll', 'other'])}</Chip> : null}
                        {counts(['final']) ? <Chip tone="ok">Finales: {counts(['final'])}</Chip> : null}
                        {counts(['cover']) ? <Chip tone="info">Portadas: {counts(['cover'])}</Chip> : null}
                      </div>
                      <DownloadAll ids={r.media.map((m) => m.id)} drive={driveRefs(r.media)} />
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
          {archive.length ? (
            <section>
              <h2 className="mb-1 flex items-center gap-2 text-lg font-bold">
                <Archive className="h-5 w-5 text-accent-ink" aria-hidden /> Archivo (sin evento)
              </h2>
              <p className="mb-2 text-[15px] text-text-2">Lo que se trajo de Drive sin un evento.</p>
              <Card>
                <ul className="divide-y divide-border">
                  {archive.map((m) => {
                    const label = m.label || MEDIA_KIND[m.kind];
                    return (
                      <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                        <DriveThumb id={m.id} mime={m.mime} />
                        <div className="min-w-0 flex-[1_1_9rem]">
                          <p className="truncate font-semibold">{label}</p>
                          <p className="text-sm text-text-2">{[size(Number(m.size)), dur(m.duration_s != null ? Number(m.duration_s) : null)].filter(Boolean).join(' · ')}</p>
                        </div>
                        <div className="ml-auto flex items-center gap-2">
                          <DriveDownload file={{ id: m.id, label, size: Number(m.size) }} />
                          {canRemove ? (mediaLockChip(m.lock) ? <Chip tone="ok">{mediaLockChip(m.lock)}</Chip> : <RemoveMedia id={m.id} label={label} />) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}
