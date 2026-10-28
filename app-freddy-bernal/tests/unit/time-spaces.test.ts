// «8:07 a. m.»: ICU writes the meridiem with a no-break space in Node (the server's HTML) and with a plain one in some
// browsers, and React then threw its hydration error on the tweet screens (every role, the boss too). Every formatted
// date and time leaves with plain spaces, on both sides (fmtAt in src/lib/time.ts).
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { fmtAt, fmtDateTime, fmtTime, TZ } from '@/lib/time';

const ODD = /[  ]/;

describe('las horas salen igual en el servidor y en el teléfono', () => {
  it('fmtTime, fmtDateTime y fmtAt nunca dejan un espacio duro', () => {
    for (const iso of ['2026-10-28T12:07:00Z', '2026-10-28T23:45:00Z', '2026-10-29T04:00:00Z']) {
      for (const text of [fmtTime(iso), fmtDateTime(iso), fmtAt(DateTime.fromISO(iso).setZone(TZ).setLocale('es'), 'h:mm a'), fmtAt(DateTime.fromObject({ hour: 9 }).setLocale('es'), 'h a')]) {
        expect(text, JSON.stringify(text)).not.toMatch(ODD);
        expect(text).toMatch(/\d/);
      }
    }
    expect(fmtAt(null, 'h:mm a')).toBe('');
  });

  it('las pantallas que pintan horas en el navegador usan fmtAt (los tweets y el calendario)', () => {
    for (const f of ['src/components/tweets/tweet-board.tsx', 'src/components/agenda/calendar.tsx']) {
      const src = fs.readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/\.toFormat\(['"][^'"]*\ba['"]\)/);
      expect(src, f).toContain('fmtAt(');
    }
  });
});
