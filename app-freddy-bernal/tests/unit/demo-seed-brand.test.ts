// The demo seed takes the client's own words from its config (APP-07): the greeting, the two closings and the hashtags
// of config/clients/<brand>.json, never written in the seed's code (the repository is public: nothing about the client
// in the code, §11.6). Two checks: no file of the seed holds them as text, and a demo seeded with an invented client
// says that client's words, and none of the real one's, in every copy, tweet, storyboard and card field it writes.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import fb from '../../config/clients/fb.json';
import { makeTestDb } from '../rls/setup';

const INVENTED = vi.hoisted(() => ({
  clientName: 'Jefe Demo',
  greeting: '¡Hola, Región Demo!',
  closings: ['Adelante con la gente', 'Siempre cerca'],
  hashtags: ['#RegionDemo', '#JefeDemo', '#PaisDemo'],
}));

// The whole app reads the client through this module; only the brand's words change.
vi.mock('@/lib/client-config', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/client-config')>();
  const config = real.getClientConfig();
  const invented = { ...config, brand: { ...config.brand, ...INVENTED } };
  return { ...real, getClientConfig: () => invented, brand: invented.brand };
});

// What only the real client says (config/clients/fb.json), and its name as a hashtag would write it.
const REAL = [fb.brand.greeting, ...fb.brand.closings, ...fb.brand.hashtags, fb.brand.clientName, fb.brand.clientName.replace(/\s+/g, '')];

const SEED_DIR = path.resolve(__dirname, '../../src/lib/db');
const seedFiles = () => [
  ...fs.readdirSync(SEED_DIR).filter((f) => /^seed.*\.ts$/.test(f)).map((f) => path.join(SEED_DIR, f)),
  ...fs.readdirSync(path.join(SEED_DIR, 'seed-parts')).filter((f) => f.endsWith('.ts')).map((f) => path.join(SEED_DIR, 'seed-parts', f)),
];

describe('la semilla de la demo y las palabras del cliente', () => {
  it('ningún archivo de la semilla escribe el saludo, los cierres, las etiquetas ni el nombre del cliente', () => {
    const files = seedFiles();
    expect(files.map((f) => path.basename(f))).toEqual(expect.arrayContaining(['seed-demo.ts', 'core.ts', 'redes.ts', 'voice.ts']));
    for (const f of files) {
      const text = fs.readFileSync(f, 'utf8');
      for (const words of REAL) expect(text.includes(words), `${path.basename(f)} escribe «${words}»`).toBe(false);
    }
  });

  it('con otro cliente, los copies, los tweets, el guion y los campos de las tarjetas dicen sus palabras', async () => {
    const t = await makeTestDb();
    // Every column of the rows the seed writes for the team's content, as one text per row.
    const tables = ['copies', 'pieces', 'piece_details', 'tweets', 'tweet_batches', 'storyboards', 'storyboard_blocks', 'publications', 'piece_notices', 'reviews'];
    const rows = await t.system(async (sql) => {
      const out: { table: string; text: string }[] = [];
      for (const table of tables) {
        for (const r of await sql.query<{ t: string }>(`select row_to_json(x)::text as t from public.${table} x`)) out.push({ table, text: r.t });
      }
      return out;
    });
    for (const table of ['copies', 'pieces', 'piece_details', 'tweets', 'storyboards']) expect(rows.some((r) => r.table === table), table).toBe(true);
    for (const r of rows) for (const words of REAL) expect(r.text.includes(words), `${r.table}: «${words}» en ${r.text.slice(0, 160)}`).toBe(false);

    const texts = async (q: string) => (await t.system((sql) => sql.query<{ t: string }>(q))).map((r) => r.t);
    const copies = await texts(`select body as t from public.copies`);
    expect(copies.some((c) => c.startsWith('¡Hola, Región Demo! 👋 ') && c.endsWith(' 💛 Siempre cerca.'))).toBe(true);
    expect(copies.some((c) => c.endsWith('Adelante con la gente 👇 #RegionDemo'))).toBe(true);
    expect(copies.some((c) => c.endsWith('Adelante con la gente 👇 #RegionDemo #JefeDemo'))).toBe(true);
    expect(await texts(`select hashtags as t from public.piece_details where hashtags <> ''`)).toEqual(expect.arrayContaining(['#RegionDemo #JefeDemo', '#RegionDemo #CuidaElAgua']));
    expect(await texts(`select body as t from public.tweets`)).toEqual(expect.arrayContaining([expect.stringMatching(/ Siempre cerca\.$/), expect.stringMatching(/ Adelante con la gente\.$/)]));
    expect(await texts(`select speech as t from public.storyboards where speech <> ''`)).toEqual(expect.arrayContaining([expect.stringMatching(/^¡Hola, Región Demo! Hoy entregamos/)]));
    expect(await texts(`select s.value ->> 'on_screen' as t from public.piece_details d, jsonb_array_elements(d.shots) s`)).toContain('Siempre cerca');
  });
});
