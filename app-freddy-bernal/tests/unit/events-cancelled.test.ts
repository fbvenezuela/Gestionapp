// A cancelled event (events.cancelled_at, the shared agenda of 27/10/2026) stays in the database, struck through on the
// screens. Every query that lists or counts events must decide what to do with it: leave it out («Hoy», «por
// decidir», the digest, the assistant, the piece picker) or show it as cancelled (the calendar, the lists, the
// library, search). This reads every SQL text in src/app and src/lib that reads events and checks that it says
// «cancelled»; lookups of one event by its id, joins from a piece or a file, and the title indexes below are exempt.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['src/app', 'src/lib'];
// Files whose event reads are not lists or counts of the agenda (each with its reason).
const ALLOW: Record<string, string> = {
  'src/lib/assistant/titles.ts': 'every title ever used, to recognize an event named in a question (never shown as a list)',
  'src/lib/assistant/escalate.ts': 'every title and place, to take them out of a message before it is escalated',
};

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? files(p) : /\.(ts|tsx)$/.test(d.name) ? [p] : [];
  });
}

const READS = /\b(from|join)\s+public\.(events|event_calendar)\b/i;
const BY_ID = /\b(e\.|ev\.)?id\s*=\s*\$1\b/;
const VIA_PIECE_OR_FILE = /join public\.events e on e\.id = (p|m)\.event_id/;

describe('cada consulta de eventos decide qué hace con los cancelados', () => {
  const offenders: string[] = [];
  for (const root of ROOTS) {
    for (const f of files(root)) {
      if (ALLOW[f.split(path.sep).join('/')]) continue;
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(/`([^`]*)`/g)) {
        const q = m[1];
        if (!READS.test(q)) continue;
        if (/cancelled/.test(q) || BY_ID.test(q) || VIA_PIECE_OR_FILE.test(q)) continue;
        const line = src.slice(0, m.index).split('\n').length;
        offenders.push(`${f}:${line}`);
      }
    }
  }
  it('ninguna se olvida', () => {
    expect(offenders).toEqual([]);
  });
  it('la lista de excepciones sigue existiendo', () => {
    for (const f of Object.keys(ALLOW)) expect(fs.existsSync(f), f).toBe(true);
  });
});
