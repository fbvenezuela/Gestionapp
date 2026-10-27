'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { act, actOutside, UserError, type Result } from './run';
import { env } from '../env';
import { withSystem } from '../db';
import { db } from '../auth/session';
import { MEDIA_KIND } from '../data/labels';
import { notify, usersWithRole } from '../notify';
import { MEDIA_LOCK, mediaLockSql, type MediaLock } from '@/lib/domain/media-lock';
import { kindTargetError, MEDIA_KINDS, RAW_KINDS, storageMime, targetOf, type TargetKind } from '@/lib/domain/media-mime';
import { THUMB_MAX_BASE64 } from '@/lib/domain/thumb';
import { storageProvider } from '../storage/provider';
import type { StartUpload } from '../storage/drive/upload';

// The fifteen kinds of media_assets_kind_check (20261027001900_media_handoff.sql).
const KINDS = MEDIA_KINDS;

// Where the file goes: at most one of an event, an obra ficha or a community report (none: piece versions,
// screenshots, tweet images). The database refuses anything else too (media_assets_one_parent, *_parent_kinds).
const PARENT_COLUMN: Record<Exclude<TargetKind, 'none'>, { column: string; codeFrom: string }> = {
  event: { column: 'event_id', codeFrom: 'public.events' },
  obra: { column: 'obra_ficha_id', codeFrom: 'public.obra_fichas' },
  report: { column: 'community_report_id', codeFrom: 'public.community_reports' },
};

const createSchema = z.object({
  eventId: z.string().uuid().nullish(),
  obraFichaId: z.string().uuid().nullish(),
  reportId: z.string().uuid().nullish(),
  kind: z.enum(KINDS),
  mime: z.string().max(100),
  sizeBytes: z.number().int().positive(),
  ext: z.string().regex(/^[a-z0-9]{1,5}$/i).transform((s) => s.toLowerCase()),
  probe: z
    .object({
      durationS: z.number().nullable(),
      width: z.number().nullable(),
      height: z.number().nullable(),
      fps: z.number().nullable(),
      videoCodec: z.string().nullable(),
      audioCodec: z.string().nullable(),
    })
    .partial()
    .default({}),
}).superRefine((i, ctx) => {
  const error = kindTargetError(i.kind, targetOf(i));
  if (error) ctx.addIssue({ code: 'custom', message: error });
});

// mode 'drive' (STORAGE_PROVIDER=drive): endpoint is Google's resumable session URL for this one
// file (or /api/drive/upload/<id> with DRIVE_UPLOAD_MODE=proxy); no token is ever handed out.
// mime: the type the file is stored with (the browser sends it as the upload's content type).
export type UploadTicket = {
  id: string;
  bucket: string;
  path: string;
  endpoint: string;
  chunkSize: number;
  token: string | null;
  mode: 'demo' | 'supabase' | 'drive';
  mime?: string;
};

// Step 1: create the media row (RLS decides whether this person may upload here),
// then the browser uploads the file in chunks to exactly that path.
export async function createUpload(raw: unknown): Promise<Result<UploadTicket>> {
  const drive = storageProvider() === 'drive';
  const res = await act(createSchema, raw, async (sql, i): Promise<UploadTicket | { drive: Omit<StartUpload, 'origin'> }> => {
    // Every provider: an empty type takes the extension's (a PDF from Android). Drive files and the new kinds
    // (storyboard, ficha photos) must match their kind; elsewhere a page, script or SVG is kept as a plain download.
    const c = storageMime(i.kind, i.mime, i.ext, drive);
    if (!c.ok) throw new UserError(c.error);
    const mime = c.mime;
    const maxMb = Number((await sql.one<{ value: number }>(`select value from public.app_settings where key = 'upload.max_mb'`))?.value ?? 10240);
    if (i.sizeBytes > maxMb * 1024 * 1024) throw new UserError(`El archivo pesa más de ${Math.round(maxMb / 1024)} GB, el máximo permitido.`);
    const target = targetOf(i)!;
    const parent = target.kind === 'none' ? null : PARENT_COLUMN[target.kind];
    const n = parent
      ? (await sql.one<{ n: number }>(`select count(*)::int + 1 as n from public.media_assets where ${parent.column} = $1 and kind = $2`, [target.id, i.kind]))!.n
      : 1;
    // Never a date or the original file name in the path (rule 4).
    const path = `${target.id ?? i.kind}/${crypto.randomUUID()}.${i.ext}`;
    const bucket = drive ? 'drive' : i.kind === 'cover' ? 'covers' : 'material';
    const label = `${MEDIA_KIND[i.kind]} ${n}`;
    const row = await sql.one<{ id: string }>(
      `insert into public.media_assets (event_id, obra_ficha_id, community_report_id, kind, bucket, storage_path, label, mime, size_bytes,
                                        duration_s, width, height, fps, video_codec, audio_codec, status, uploaded_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'uploading', auth.uid()) returning id`,
      [i.eventId ?? null, i.obraFichaId ?? null, i.reportId ?? null, i.kind, bucket, path, label, mime, i.sizeBytes, i.probe.durationS ?? null,
        i.probe.width ?? null, i.probe.height ?? null, i.probe.fps ?? null, i.probe.videoCodec ?? null, i.probe.audioCodec ?? null],
    );
    if (!row) throw new UserError('No puedes subir material aquí.');
    if (drive) {
      // Google is called after this transaction ends, never inside it. The folder is the parent's code.
      const code = parent ? await sql.one<{ code: string }>(`select code from ${parent.codeFrom} where id = $1`, [target.id]) : null;
      return { drive: { mediaId: row.id, path, kind: i.kind, eventCode: code?.code ?? null, label, ext: i.ext, mime, size: i.sizeBytes } };
    }
    if (env.dataMode === 'demo') {
      return { id: row.id, bucket, path, endpoint: '/api/demo-upload', chunkSize: env.uploadChunkMb * 1024 * 1024, token: null, mode: 'demo', mime };
    }
    const { supabaseServer } = await import('../supabase/server');
    const { data } = await (await supabaseServer()).auth.getSession();
    // Supabase resumable uploads require 6 MB chunks.
    return { id: row.id, bucket, path, endpoint: `${env.supabaseUrl}/storage/v1/upload/resumable`, chunkSize: 6 * 1024 * 1024, token: data.session?.access_token ?? null, mode: 'supabase', mime };
  });
  if (!res.ok || !res.data || !('drive' in res.data)) return res as Result<UploadTicket>;
  const { startDriveUpload, pageOrigin } = await import('../storage/drive/upload');
  const { driveMessage } = await import('../storage/drive/errors');
  try {
    const origin = pageOrigin((await headers()).get('origin'));
    return { ok: true, data: await startDriveUpload({ ...res.data.drive, origin }) };
  } catch (e) {
    console.error('[upload] drive:', (e as Error).message);
    return { ok: false, error: driveMessage(e) };
  }
}

type Finished = { event_id: string | null; kind: string };

// Step 2: the browser says the upload ended. With Drive, Google must have the whole file first.
// thumb: the small JPEG the browser made (base64, best effort). A bad one is dropped, never blocks the finish.
export async function finishUpload(raw: unknown) {
  const schema = z.object({ id: z.string().uuid(), thumb: z.string().max(THUMB_MAX_BASE64).nullish().catch(null) });
  const revalidate = ['/eventos', '/biblioteca', '/obras', '/reportes'];
  // Who finished it and their thumbnail, kept for the step after the person's own (never nested in it).
  type Keep = { id: string; by: string; thumb: string };
  let keep: Keep | null = null;
  const remember = (i: { id: string; thumb?: string | null }, by: string) => {
    keep = i.thumb ? { id: i.id, by, thumb: i.thumb } : null;
  };
  const done: Promise<Result<Finished>> = storageProvider() !== 'drive'
    ? act(schema, raw, async (sql, i, s) => {
        remember(i, s.userId);
        const r = await sql.one<Finished>(
          `update public.media_assets set status = 'ready' where id = $1 and uploaded_by = auth.uid() and bucket <> 'drive' returning event_id, kind`,
          [i.id],
        );
        if (!r) throw new UserError('No se encontró la subida.');
        return r;
      }, { revalidate })
    : actOutside(schema, raw, async (i, s) => {
        remember(i, s.userId);
        const row = await db(s, (sql) =>
          sql.one<{ bucket: string; status: string; size_bytes: string | number; mime: string; event_id: string | null; kind: string }>(
            `select bucket, status, size_bytes, mime, event_id, kind from public.media_assets where id = $1 and uploaded_by = auth.uid()`,
            [i.id],
          ),
        );
        if (!row) throw new UserError('No se encontró la subida.');
        if (row.bucket === 'drive') {
          if (row.status === 'ready') return { event_id: row.event_id, kind: row.kind };
          if (row.status !== 'uploading') throw new UserError('Esta subida no se completó. Súbelo otra vez.');
          const { checkDriveUpload, settleDriveUpload, UploadIncomplete } = await import('../storage/drive/upload');
          try {
            await settleDriveUpload(i.id, await checkDriveUpload({ mediaId: i.id, sizeBytes: Number(row.size_bytes), mime: row.mime }));
          } catch (e) {
            if (e instanceof UploadIncomplete) throw new UserError(e.message);
            throw e;
          }
        }
        const r = await db(s, (sql) =>
          sql.one<Finished>(`update public.media_assets set status = 'ready' where id = $1 and uploaded_by = auth.uid() returning event_id, kind`, [i.id]),
        );
        if (!r) throw new UserError('No se encontró la subida.');
        return r;
      }, { revalidate });
  return done.then(async (res) => {
    const k = keep as Keep | null;
    if (res.ok && k) {
      // After the person's step ended (RLS said the file is theirs and finished): insert only, system connection.
      try {
        const { storeThumb } = await import('../storage/thumbs');
        await storeThumb(k.id, k.by, k.thumb);
      } catch (e) {
        console.error('[upload] thumb:', (e as Error).message);
      }
    }
    if (res.ok && res.data?.event_id && (RAW_KINDS as readonly string[]).includes(res.data.kind)) {
      const eventId = res.data.event_id;
      const title = await withSystem(async (sql) => {
        await sql.query(`update public.events set work_status = 'material' where id = $1 and work_status in ('brief', 'storyboard', 'recording')`, [eventId]);
        return (await sql.one<{ title: string }>(`select title from public.events where id = $1`, [eventId]))?.title ?? '';
      });
      const social = await usersWithRole('social');
      // One notice per event per hour, not one per file.
      await notify({ userIds: social, kind: 'material_ready', title: 'Llegó material nuevo', body: title, link: `/eventos/${eventId}?tab=material`, key: `material:${eventId}:${new Date().toISOString().slice(0, 13)}` });
    }
    return res;
  });
}

export async function failUpload(raw: unknown) {
  return act(z.object({ id: z.string().uuid() }), raw, async (sql, i) => {
    await sql.query(`update public.media_assets set status = 'failed' where id = $1 and uploaded_by = auth.uid() and status = 'uploading'`, [i.id]);
  });
}

// Removes something uploaded by mistake (soft delete: the row stays, audited). The database
// only lets admin set deleted_at; here we also refuse files that are under review, approved,
// published or received as the boss's voice line (media-lock.ts).
export async function removeMedia(raw: unknown) {
  return act(z.object({ id: z.string().uuid() }), raw, async (sql, i, s) => {
    if (!s.roles.includes('admin')) throw new UserError('Solo administración puede quitar archivos.');
    const lock = await sql.one<{ lock: MediaLock | null }>(`select ${mediaLockSql('$1::uuid')} as lock`, [i.id]);
    if (lock?.lock) throw new UserError(MEDIA_LOCK[lock.lock]?.error ?? 'No se puede quitar este archivo.');
    const r = await sql.query(`update public.media_assets set deleted_at = now() where id = $1 and deleted_at is null returning id`, [i.id]);
    if (!r.length) throw new UserError('Ese archivo ya no está.');
  }, { revalidate: ['/eventos', '/biblioteca', '/obras', '/reportes'] });
}
