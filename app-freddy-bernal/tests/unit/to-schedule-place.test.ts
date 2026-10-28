// «Ponerle fecha» starts with the same «A dónde se va» from «Por ponerle fecha» (/agenda/por-fecha) as from the ficha's
// own page: the obra's sector and parish, the report's community (eventFromObra / eventFromReport), not the parish
// alone. Demo database (PGlite, invented data); every read as the person (RLS).
import { describe, expect, it } from 'vitest';
import { withUser } from '@/lib/db';
import type { Claims } from '@/lib/db/core';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import { toSchedule } from '@/lib/data/events';
import { eventFromObra, eventFromReport } from '@/lib/domain/ficha-event';

const claimsOf = (key: DemoUserKey): Claims => ({ sub: DEMO_USERS.find((x) => x.key === key)!.id, aal: 'aal2', role: 'authenticated' });

describe('«Por ponerle fecha»: el mismo lugar que en la ficha', () => {
  for (const key of ['boss', 'dispatch', 'admin'] as DemoUserKey[]) {
    it(`${key}: cada obra con su sector y parroquia, cada reporte con su comunidad`, async () => {
      const { rows, pages } = await withUser(claimsOf(key), async (sql) => {
        const rows = await toSchedule(sql, 200);
        // What the obra and report pages pass to «Ponerle fecha» (their full row, read the same way).
        const pages = new Map<string, string>();
        for (const r of rows) {
          const table = r.kind === 'obra' ? 'obra_fichas' : 'community_reports';
          const row = (await sql.one<Record<string, unknown>>(`select * from public.${table} where id = $1`, [r.id]))!;
          pages.set(r.id, (r.kind === 'obra' ? eventFromObra(row) : eventFromReport(row)).placeName);
        }
        return { rows, pages };
      });
      expect(rows.some((r) => r.kind === 'obra'), 'an obra waits').toBe(true);
      expect(rows.some((r) => r.kind === 'report'), 'a report waits').toBe(true);
      for (const r of rows) expect(r.place, r.title).toBe(pages.get(r.id));
      // Not the parish alone any more.
      expect(rows.filter((r) => r.place && r.place !== r.parish).length).toBe(rows.length);
    });
  }
});
