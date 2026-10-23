'use server';

import { z } from 'zod';
import { DateTime } from 'luxon';
import { act, UserError } from './run';
import { TZ } from '../time';
import { distribute, suggestCategory, tweetLength, type Slot } from '../domain/tweets';
import { contentCategories } from '../data/common';
import { requireSession } from '../auth/session';
import { notify, usersWithRole } from '../notify';

const uuid = z.string().uuid();

// Reads a .docx sent from the browser and returns its plain text. Nothing is stored.
export async function extractDocx(form: FormData): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  await requireSession();
  const file = form.get('file');
  if (!(file instanceof File)) return { ok: false, error: 'No llegó el archivo.' };
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: 'El documento pesa más de 5 MB.' };
  try {
    const mammoth = await import('mammoth');
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(await file.arrayBuffer()) });
    return { ok: true, text: value };
  } catch {
    return { ok: false, error: 'No se pudo leer el documento. Prueba guardarlo como .docx o pega el texto.' };
  }
}

function isPublicHttpUrl(u: string) {
  try {
    const url = new URL(u.startsWith('http') ? u : `https://${u}`);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    const h = url.hostname;
    if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || /^[\d.]+$/.test(h) || h.includes(':')) return null;
    return url;
  } catch {
    return null;
  }
}

// "Links rotos": a quick HEAD (then GET) with a short timeout. Public hosts only.
export async function checkLinks(urls: string[]): Promise<Record<string, boolean>> {
  await requireSession();
  const out: Record<string, boolean> = {};
  await Promise.all(
    [...new Set(urls)].slice(0, 40).map(async (u) => {
      const url = isPublicHttpUrl(u);
      if (!url) return (out[u] = false);
      try {
        const ctrl = AbortSignal.timeout(6000);
        let res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: ctrl });
        if (res.status === 405 || res.status === 403) res = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(6000) });
        out[u] = res.status < 400;
      } catch {
        out[u] = false;
      }
    }),
  );
  return out;
}

export async function suggestCategories(bodies: string[]) {
  return act(z.array(z.string()).max(400), bodies, async (sql) => {
    const cats = await contentCategories(sql);
    return bodies.map((b) => suggestCategory(b, cats));
  });
}

const batchSchema = z.object({
  title: z.string().trim().max(120).default(''),
  sourceName: z.string().max(200).default(''),
  tweets: z.array(z.object({ body: z.string().trim().min(1).max(4000), categoryId: uuid.nullable() })).min(1, 'No hay tweets.').max(400),
});

// Saves the batch and spreads the tweets over the coming days (4-5 per day, in the
// configured slots, avoiding hours already taken).
export async function createBatch(raw: unknown) {
  return act(batchSchema, raw, async (sql, i) => {
    const slots = (await sql.one<{ value: Slot[] }>(`select value from public.app_settings where key = 'tweets.slots'`))?.value ?? [];
    const perDay = (await sql.one<{ value: { min: number; max: number } }>(`select value from public.app_settings where key = 'tweets.per_day'`))?.value ?? { min: 4, max: 5 };
    const taken = (await sql.query<{ scheduled_at: string }>(`select scheduled_at from public.tweets where scheduled_at > now() and status <> 'skipped' and deleted_at is null`)).map((r) =>
      new Date(r.scheduled_at).toISOString(),
    );
    // Start after the last scheduled tweet so a new batch continues the calendar.
    const last = taken.length ? DateTime.fromISO(taken.sort().at(-1)!).setZone(TZ) : null;
    const start = last && last > DateTime.now() ? last.plus({ days: 1 }).startOf('day') : DateTime.now().setZone(TZ);
    const times = distribute(i.tweets.length, { start, slots, perDay, taken, tz: TZ, seed: Date.now() % 100000 });
    const b = await sql.one<{ id: string }>(
      `insert into public.tweet_batches (title, source_name, week_start) values ($1, $2, $3) returning id`,
      [i.title || `Tanda del ${DateTime.now().setZone(TZ).toFormat('d/LL')}`, i.sourceName, start.toISODate()],
    );
    for (const [pos, t] of i.tweets.entries()) {
      await sql.query(
        `insert into public.tweets (batch_id, position, body, weighted_length, category_id, scheduled_at) values ($1, $2, $3, $4, $5, $6)`,
        [b!.id, pos, t.body, tweetLength(t.body), t.categoryId, times[pos] ?? null],
      );
    }
    return { id: b!.id, count: i.tweets.length };
  }, { revalidate: ['/tweets', '/aprobar', '/hoy'] }).then(async (r) => {
    if (r.ok) {
      const sup = await usersWithRole('supervisor');
      await notify({ userIds: sup, kind: 'review_pending', title: `${r.data!.count} tweets por aprobar`, link: '/aprobar?tab=tweets', key: `batch:${r.data!.id}`, email: true });
    }
    return r;
  });
}

export async function updateTweet(raw: unknown) {
  return act(
    z.object({
      id: uuid,
      body: z.string().trim().min(1).max(4000).optional(),
      categoryId: uuid.nullable().optional(),
      scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
      imageAssetId: uuid.nullable().optional(),
    }),
    raw,
    async (sql, i) => {
      const sets: string[] = [];
      const params: unknown[] = [i.id];
      const add = (col: string, v: unknown) => {
        params.push(v);
        sets.push(`${col} = $${params.length}`);
      };
      if (i.body !== undefined) {
        add('body', i.body);
        add('weighted_length', tweetLength(i.body));
      }
      if (i.categoryId !== undefined) add('category_id', i.categoryId);
      if (i.scheduledAt !== undefined) {
        if (i.scheduledAt && new Date(i.scheduledAt) < new Date()) throw new UserError('Esa hora ya pasó.');
        add('scheduled_at', i.scheduledAt);
      }
      if (i.imageAssetId !== undefined) add('image_asset_id', i.imageAssetId);
      if (!sets.length) return;
      const r = await sql.query(`update public.tweets set ${sets.join(', ')} where id = $1 returning id`, params);
      if (!r.length) throw new UserError('No se pudo cambiar el tweet.');
    },
    { revalidate: ['/tweets', '/aprobar'] },
  );
}

export async function skipTweet(raw: unknown) {
  return act(z.object({ id: uuid }), raw, async (sql, i) => {
    await sql.query(`update public.tweets set status = 'skipped' where id = $1`, [i.id]);
  }, { revalidate: ['/tweets', '/aprobar'] });
}

// Supervisor approves (all ids at once). The database refuses anyone else.
export async function approveTweets(raw: unknown) {
  return act(z.object({ ids: z.array(uuid).min(1).max(400) }), raw, async (sql, i) => {
    const r = await sql.query(
      `update public.tweets set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = any($1::uuid[]) and status = 'draft' returning id`,
      [i.ids],
    );
    return { n: r.length };
  }, { revalidate: ['/tweets', '/aprobar', '/hoy'] });
}

// "Programar": approved tweets get scheduled. With the X API connected and publishing
// switched on, a job publishes them; otherwise they stay with "Copiar" and "Ya lo publiqué".
export async function scheduleTweets(raw: unknown) {
  return act(z.object({ batchId: uuid }), raw, async (sql, i) => {
    const missing = await sql.one<{ n: number }>(`select count(*)::int as n from public.tweets where batch_id = $1 and status = 'approved' and scheduled_at is null`, [i.batchId]);
    if (missing?.n) throw new UserError(`Hay ${missing.n} tweets sin hora.`);
    const r = await sql.query(`update public.tweets set status = 'scheduled' where batch_id = $1 and status = 'approved' returning id`, [i.batchId]);
    return { n: r.length };
  }, { revalidate: ['/tweets', '/hoy'] });
}

export async function markTweetPublished(raw: unknown) {
  return act(z.object({ id: uuid, url: z.string().url('Pega el link del tweet.').max(500) }), raw, async (sql, i) => {
    const r = await sql.query(`update public.tweets set status = 'published', published_at = now(), published_url = $2 where id = $1 and status in ('approved', 'scheduled') returning id`, [i.id, i.url]);
    if (!r.length) throw new UserError('Ese tweet no está aprobado.');
  }, { revalidate: ['/tweets'] });
}

export async function redistributeBatch(raw: unknown) {
  return act(z.object({ batchId: uuid }), raw, async (sql, i) => {
    const slots = (await sql.one<{ value: Slot[] }>(`select value from public.app_settings where key = 'tweets.slots'`))?.value ?? [];
    const perDay = (await sql.one<{ value: { min: number; max: number } }>(`select value from public.app_settings where key = 'tweets.per_day'`))?.value ?? { min: 4, max: 5 };
    const pending = await sql.query<{ id: string }>(`select id from public.tweets where batch_id = $1 and status in ('draft', 'approved', 'scheduled') and deleted_at is null order by position`, [i.batchId]);
    const taken = (await sql.query<{ scheduled_at: string }>(
      `select scheduled_at from public.tweets where scheduled_at > now() and batch_id <> $1 and status <> 'skipped' and deleted_at is null`,
      [i.batchId],
    )).map((r) => new Date(r.scheduled_at).toISOString());
    const times = distribute(pending.length, { start: DateTime.now().setZone(TZ), slots, perDay, taken, tz: TZ, seed: Date.now() % 100000 });
    for (const [k, t] of pending.entries()) await sql.query(`update public.tweets set scheduled_at = $2 where id = $1`, [t.id, times[k] ?? null]);
  }, { revalidate: ['/tweets'] });
}
