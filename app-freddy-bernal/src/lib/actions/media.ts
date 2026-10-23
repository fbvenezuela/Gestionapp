'use server';

import { z } from 'zod';
import { act, UserError } from './run';
import { env } from '../env';
import { withSystem } from '../db';
import { MEDIA_KIND } from '../data/labels';
import { notify, usersWithRole } from '../notify';

const KINDS = ['boss', 'drone', 'broll', 'other', 'final', 'cover', 'editable', 'voice_line', 'evidence', 'tweet_image'] as const;

const createSchema = z.object({
  eventId: z.string().uuid().nullable(),
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
});

export type UploadTicket = {
  id: string;
  bucket: string;
  path: string;
  endpoint: string;
  chunkSize: number;
  token: string | null;
  mode: 'demo' | 'supabase';
};

// Step 1: create the media row (RLS decides whether this person may upload here),
// then the browser uploads the file in chunks to exactly that path.
export async function createUpload(raw: unknown) {
  return act(createSchema, raw, async (sql, i): Promise<UploadTicket> => {
    const maxMb = Number((await sql.one<{ value: number }>(`select value from public.app_settings where key = 'upload.max_mb'`))?.value ?? 10240);
    if (i.sizeBytes > maxMb * 1024 * 1024) throw new UserError(`El archivo pesa más de ${Math.round(maxMb / 1024)} GB, el máximo permitido.`);
    const n = i.eventId
      ? (await sql.one<{ n: number }>(`select count(*)::int + 1 as n from public.media_assets where event_id = $1 and kind = $2`, [i.eventId, i.kind]))!.n
      : 1;
    // Never a date or the original file name in the path (rule 4).
    const path = `${i.eventId ?? i.kind}/${crypto.randomUUID()}.${i.ext}`;
    const bucket = i.kind === 'cover' ? 'covers' : 'material';
    const row = await sql.one<{ id: string }>(
      `insert into public.media_assets (event_id, kind, bucket, storage_path, label, mime, size_bytes, duration_s, width, height, fps, video_codec, audio_codec, status, uploaded_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'uploading', auth.uid()) returning id`,
      [i.eventId, i.kind, bucket, path, `${MEDIA_KIND[i.kind]} ${n}`, i.mime, i.sizeBytes, i.probe.durationS ?? null, i.probe.width ?? null,
        i.probe.height ?? null, i.probe.fps ?? null, i.probe.videoCodec ?? null, i.probe.audioCodec ?? null],
    );
    if (!row) throw new UserError('No puedes subir material a este evento.');
    if (env.dataMode === 'demo') {
      return { id: row.id, bucket, path, endpoint: '/api/demo-upload', chunkSize: env.uploadChunkMb * 1024 * 1024, token: null, mode: 'demo' };
    }
    const { supabaseServer } = await import('../supabase/server');
    const { data } = await (await supabaseServer()).auth.getSession();
    // Supabase resumable uploads require 6 MB chunks.
    return { id: row.id, bucket, path, endpoint: `${env.supabaseUrl}/storage/v1/upload/resumable`, chunkSize: 6 * 1024 * 1024, token: data.session?.access_token ?? null, mode: 'supabase' };
  });
}

export async function finishUpload(raw: unknown) {
  return act(z.object({ id: z.string().uuid() }), raw, async (sql, i) => {
    const r = await sql.one<{ event_id: string | null; kind: string }>(
      `update public.media_assets set status = 'ready' where id = $1 and uploaded_by = auth.uid() returning event_id, kind`,
      [i.id],
    );
    if (!r) throw new UserError('No se encontró la subida.');
    return r;
  }, { revalidate: ['/eventos', '/biblioteca'] }).then(async (res) => {
    if (res.ok && res.data?.event_id && ['boss', 'drone', 'broll', 'other'].includes(res.data.kind)) {
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

export async function removeMedia(raw: unknown) {
  return act(z.object({ id: z.string().uuid() }), raw, async (sql, i) => {
    const r = await sql.query(`update public.media_assets set deleted_at = now() where id = $1 returning id`, [i.id]);
    if (!r.length) throw new UserError('No autorizado.');
  }, { revalidate: ['/eventos', '/biblioteca'] });
}
