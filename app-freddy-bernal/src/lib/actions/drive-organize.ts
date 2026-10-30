'use server';

import { z } from 'zod';
import { actOutside, UserError } from './run';
import { env } from '../env';
import { db } from '../auth/session';
import { withSystem } from '../db';
import { storageProvider } from '../storage/provider';
import { isFormat } from '../domain/redes';
import { planFeedOrganize, type OrganizeSlot } from '../storage/drive/organize';

// «Organizar por orden del feed» (R4, D-74), in Ajustes → Google Drive. Off: it needs four keys, and all four are
// checked here again (a hidden button is not a lock): REDES_DRIVE_ORGANIZE=true, Drive as the storage, Drive
// connected and administración with 2FA. It renames and moves only the pictures of placed pieces, files the app made
// or was given (drive.file); never a public link, never a title in a name. No transaction around a Google call.

export async function organizeFeed(raw: unknown = {}) {
  return actOutside(z.object({}).strict(), raw, async (_i, s) => {
    if (!env.redesDriveOrganize) throw new UserError('«Organizar por orden del feed» está apagado.');
    if (storageProvider() !== 'drive') throw new UserError('Drive no está activado en esta versión.');
    if (!s.roles.includes('admin') || !s.mfaOk) throw new UserError('Solo Administración, con doble factor, puede hacer esto.');
    const status = (await db(s, (sql) => sql.one<{ status: string }>(`select status from public.drive_status()`)))?.status;
    if (status !== 'ok') throw new UserError('Drive no está conectado: conéctalo primero en Ajustes → Google Drive.');

    // The months and the placed pieces' pictures, as the person reads them (RLS).
    const read = await db(s, async (sql) => ({
      months: await sql.query<{ id: string; ordinal: number }>(`select id, ordinal from public.content_months where deleted_at is null order by ordinal`),
      slots: await sql.query<{ month_id: string; num: number; format: string; picture_id: string | null; picture_mime: string | null }>(
        `select x.month_id, x.num, x.format, x.picture_id, pm.mime as picture_mime
           from (select s.month_id, s.num, p.format,
                        coalesce(v.cover_asset_id,
                                 case when m.mime like 'image/%' then v.media_asset_id end,
                                 (select a from unnest(v.slide_asset_ids) a where a is not null limit 1)) as picture_id
                   from public.feed_slots s
                   join public.pieces p on p.id = s.piece_id and p.deleted_at is null
                   left join public.piece_versions v on v.piece_id = p.id and v.version = p.current_version
                   left join public.media_assets m on m.id = v.media_asset_id
                  where s.piece_id is not null) x
           left join public.media_assets pm on pm.id = x.picture_id
          order by x.month_id, x.num`,
      ),
    }));
    // Their Drive ids: a system-only table, read after the person's own query (never inside it).
    const pictureIds = [...new Set(read.slots.map((x) => x.picture_id).filter((x): x is string => !!x))];
    const files = pictureIds.length
      ? await withSystem((sql) => sql.query<{ media_id: string; file_id: string }>(`select media_id, file_id from public.media_drive where media_id = any($1::uuid[])`, [pictureIds]))
      : [];
    const fileOf = new Map(files.map((f) => [f.media_id, f.file_id]));
    const slots: OrganizeSlot[] = read.slots.flatMap((x) =>
      isFormat(x.format)
        ? [{ monthId: x.month_id, num: x.num, format: x.format, pictureId: x.picture_id, pictureMime: x.picture_mime, fileId: x.picture_id ? (fileOf.get(x.picture_id) ?? null) : null }]
        : [],
    );
    const plan = planFeedOrganize(read.months, slots);
    if (!plan.steps.length) return { moved: 0, summary: plan.summary, message: `Nada que ordenar. ${plan.summary.slice(1).join(' ')}`.trim() };

    const { withDrive } = await import('../storage/drive/connection');
    const { ensureFolder } = await import('../storage/drive/folders');
    const { moveFile } = await import('../storage/drive/client');
    let moved = 0;
    await withDrive(async (token) => {
      moved = 0;
      for (const step of plan.steps) {
        const folder = await ensureFolder(token, step.folderPath);
        await moveFile(token, step.fileId, step.name, folder);
        moved++;
      }
    });
    const rest = plan.summary.slice(1).join(' ');
    return { moved, summary: plan.summary, message: `Listo: ${moved === 1 ? '1 portada ordenada' : `${moved} portadas ordenadas`} en Drive.${rest ? ` ${rest}` : ''}` };
  }, { revalidate: ['/ajustes'] }).then((r) => (r.ok ? { ...r, message: r.data!.message } : r));
}
