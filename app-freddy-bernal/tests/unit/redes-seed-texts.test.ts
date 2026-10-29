// The demo seed of Redes por formato (src/lib/db/seed-parts/redes.ts; design R4 §7.1 and WP-A acceptance) against
// the real demo database (same migrations, same seed):
//   * every text it leaves where Redes reads (titles, copies, card fields, shots and slides, notices, design notes,
//     review comments, month names, pillars) has no day, date, time or phone — with the platform's own detectors;
//   * every seeded day is a day without an event of the demo (-4 to -27), so a card's creation day never names one;
//   * the counts the screens and the tests count on: 6 events, 2 green and 2 new yellow pieces in review, 72 feed places
//     with 21 taken, no live piece without a live month;
//   * seedClient (run on fb-dev too): «Mes 1» once, the pieces without a month into it, the new network formats added
//     without touching what administración edited.
import { describe, expect, it, beforeAll } from 'vitest';
import { DateTime } from 'luxon';
import { makeTestDb, type TestDb } from '../rls/setup';
import { asSystem } from '@/lib/db/core';
import { createMemoryDb } from '@/lib/db/pglite';
import { seedClient } from '@/lib/db/seed-client';
import { DEMO_PILLARS, REDES_SEED_DAYS } from '@/lib/db/seed-parts/redes';
import { hasConcreteDateTime } from '@/lib/domain/chat';
import { phonesIn } from '@/lib/domain/phones';
import { looksLikeDateTime } from '@/lib/push/text';

const TZ = 'America/Caracas';
let t: TestDb;

beforeAll(async () => {
  t = await makeTestDb();
}, 120_000);

const sys = <T>(q: string, p: unknown[] = []) => t.system((sql) => sql.query<T>(q, p));
const n = async (q: string, p: unknown[] = []) => (await sys<{ n: number }>(`select count(*)::int as n from (${q}) x`, p))[0].n;

describe('la semilla de Redes por formato', () => {
  it('ningún texto sembrado lleva día, fecha, hora ni teléfono', async () => {
    const texts = await sys<{ k: string; t: string }>(
      `select 'título' as k, title as t from public.pieces
       union all select 'nota del diseño', design_note from public.pieces where design_note <> ''
       union all select 'copy', body from public.copies
       union all select 'campos', concat_ws(' · ', art_overline, art_headline, art_seals, art_fine_print, visual_concept, hook, cta, hashtags,
                   publication_notes, sticker_text, sticker_url, on_screen, follow_up, idea, links) from public.piece_details
       union all select 'tomas', s.value::text from public.piece_details d, jsonb_array_elements(d.shots) s
       union all select 'láminas', s.value::text from public.piece_details d, jsonb_array_elements(d.slides) s
       union all select 'aviso', body from public.piece_notices
       union all select 'mes', label from public.content_months
       union all select 'comentario del jefe', comment from public.reviews where comment <> ''
       union all select 'pilar', e ->> 'name' from public.app_settings a, jsonb_array_elements(a.value) e where a.key = 'redes.pillars'`,
    );
    expect(texts.filter((x) => x.k === 'tomas').length).toBeGreaterThan(10);
    expect(texts.filter((x) => x.k === 'láminas').length).toBeGreaterThan(10);
    expect(texts.filter((x) => x.k === 'aviso')).toHaveLength(3);
    expect(texts.filter((x) => x.k === 'pilar').map((x) => x.t)).toEqual(DEMO_PILLARS.map((p) => p.name));
    for (const x of texts) {
      expect(hasConcreteDateTime(x.t), `${x.k}: ${x.t}`).toBe(false);
      expect(looksLikeDateTime(x.t), `${x.k}: ${x.t}`).toBe(false);
      expect(phonesIn(x.t), `${x.k}: ${x.t}`).toEqual([]);
    }
  });

  it('cada día sembrado es un día sin evento de la demo (de -4 a -27)', async () => {
    const today = DateTime.now().setZone(TZ).startOf('day');
    const dayOf = (d: Date) => Math.round(DateTime.fromJSDate(d).setZone(TZ).startOf('day').diff(today, 'days').days);
    const eventDays = new Set((await sys<{ at: Date }>(`select starts_at as at from public.event_schedule`)).map((r) => dayOf(r.at)));
    expect([...eventDays].sort((a, b) => a - b)).toEqual([-2, -1, 0, 1, 3, 6]);
    const seeded = await sys<{ k: string; at: Date }>(
      `select 'pieza ' || title as k, created_at as at from public.pieces
       union all select 'mes ' || label, created_at from public.content_months
       union all select 'versión', v.created_at from public.piece_versions v join public.pieces p on p.id = v.piece_id where p.event_id is null
       union all select 'archivo ' || label, created_at from public.media_assets where event_id is null and kind in ('final', 'cover')
       union all select 'campos', created_at from public.piece_details
       union all select 'aviso', created_at from public.piece_notices
       union all select 'publicación', coalesce(published_at, scheduled_at) from public.publications where url like 'https://example.org/demo/%' or status = 'scheduled'`,
    );
    expect(seeded.length).toBeGreaterThan(100);
    for (const s of seeded) {
      const d = dayOf(s.at);
      expect(eventDays.has(d), `${s.k}: día ${d}`).toBe(false);
      if (!s.k.startsWith('publicación')) {
        expect(d, s.k).toBeGreaterThanOrEqual(REDES_SEED_DAYS.min);
        expect(d, s.k).toBeLessThanOrEqual(REDES_SEED_DAYS.max);
      }
    }
  });

  it('lo que cuentan las pantallas: 6 eventos; en revisión 1 roja, 3 amarillas (2 nuevas) y 2 verdes, 72 espacios con 21 puestos, todo en un mes vivo', async () => {
    expect(await n(`select 1 from public.events`)).toBe(6);
    const review = await sys<{ level: string; k: number }>(
      `select review_level as level, count(*)::int as k from public.pieces where status = 'in_review' and deleted_at is null group by 1 order by 1`,
    );
    expect(review).toEqual([{ level: 'amarillo', k: 3 }, { level: 'rojo', k: 1 }, { level: 'verde', k: 2 }]);
    expect(await n(`select 1 from public.feed_slots`)).toBe(72);
    expect(await n(`select 1 from public.feed_slots where piece_id is not null`)).toBe(21);
    expect(await n(`select num from public.feed_slots s join public.content_months m on m.id = s.month_id where m.label = 'Mes 1' and s.piece_id is null`)).toBe(3);
    expect(
      await n(`select 1 from public.pieces p where p.deleted_at is null
                 and not exists (select 1 from public.content_months m where m.id = p.content_month_id and m.deleted_at is null)`),
    ).toBe(0);
    const perFormat = await sys<{ format: string; k: number }>(
      `select p.format, count(*)::int as k from public.pieces p join public.content_months m on m.id = p.content_month_id
        where m.label = 'Mes 1' and p.deleted_at is null group by 1 order by 1`,
    );
    expect(Object.fromEntries(perFormat.map((r) => [r.format, r.k]))).toEqual({ carousel: 4, month_end: 1, post: 8, reel: 12, story: 12, youtube: 2 });
    // The cell of the first one out (#1, the court, published) and the draft without a file (#10).
    const cell = async (num: number) =>
      (await sys<{ title: string }>(
        `select p.title from public.feed_slots s join public.pieces p on p.id = s.piece_id join public.content_months m on m.id = s.month_id
          where m.label = 'Mes 1' and s.num = $1`,
        [num],
      ))[0]?.title;
    expect(await cell(1)).toBe('Cancha techada de El Mirador');
    expect(await cell(10)).toBe('Jornada de salud escolar');
    // Every piece of Mes 1 has one of the demo's pillars.
    expect(await n(`select 1 from public.pieces p join public.content_months m on m.id = p.content_month_id where m.label = 'Mes 1' and (p.pillar is null or p.pillar <> all ($1::text[]))`, [DEMO_PILLARS.map((p) => p.key)])).toBe(0);
  });

  it('ninguna pieza aprobada o publicada queda retenida por un diseño desaprobado', async () => {
    expect(await n(`select 1 from public.pieces where design_status = 'disapproved'`)).toBe(2);
    expect(await n(`select 1 from public.pieces where design_status = 'disapproved' and status <> 'draft'`)).toBe(0);
    expect(await n(`select 1 from public.pieces where design_status = 'approved'`)).toBe(6);
    expect(await n(`select 1 from public.pieces where rating is not null`)).toBe(7);
  });
});

describe('seedClient y Redes por formato (también en fb-dev)', () => {
  it('crea «Mes 1» una sola vez, le pasa las piezas sin mes y suma historias y carruseles sin pisar lo editado', async () => {
    const { db, backend } = await createMemoryDb();
    try {
      // A database from before the months: a piece without a month, and a network rule administración edited.
      await asSystem(backend, async (sql) => {
        await sql.query(`insert into public.network_specs (network, label, formats, copy_max_chars, length_group) values ('instagram', 'Instagram', $1::text::jsonb, 2200, 'long')`, [
          JSON.stringify({ reel: { max_duration_s: 90 } }),
        ]);
        await sql.query(`insert into public.pieces (kind, format, title) values ('video', 'reel', 'Pieza de antes de los meses')`);
      });
      const loose = (await db.query<{ m: string | null }>(`select content_month_id as m from public.pieces`)).rows[0];
      expect(loose.m).toBeNull();
      for (let i = 0; i < 2; i++) await asSystem(backend, (sql) => seedClient(sql));
      const months = (await db.query<{ id: string; label: string }>(`select id, label from public.content_months where deleted_at is null`)).rows;
      expect(months.map((m) => m.label)).toEqual(['Mes 1']);
      expect((await db.query<{ n: number }>(`select count(*)::int as n from public.feed_slots`)).rows[0].n).toBe(24);
      expect((await db.query<{ m: string }>(`select content_month_id as m from public.pieces`)).rows[0].m).toBe(months[0].id);
      const ig = (await db.query<{ formats: Record<string, Record<string, unknown>> }>(`select formats from public.network_specs where network = 'instagram'`)).rows[0].formats;
      expect(ig.reel).toEqual({ max_duration_s: 90 });
      expect(Object.keys(ig).sort()).toEqual(['carousel', 'reel', 'story']);
      expect(ig.carousel).toMatchObject({ max_items: 20 });
      const fb = (await db.query<{ formats: Record<string, unknown> }>(`select formats from public.network_specs where network = 'facebook'`)).rows[0].formats;
      expect(fb).toHaveProperty('story');
      expect(fb).toHaveProperty('carousel');
      const settings = (await db.query<{ key: string; value: unknown }>(`select key, value from public.app_settings where key like 'redes.%' order by key`)).rows;
      expect(settings).toEqual([
        { key: 'redes.pillars', value: [] },
        { key: 'redes.quotas', value: { reel: 12, post: 8, carousel: 4, story: 30, youtube: 4 } },
      ]);
    } finally {
      await db.close();
    }
  }, 120_000);
});
