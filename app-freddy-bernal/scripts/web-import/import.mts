// Brings the old website (freddybernaloficial.com, WordPress) into the new one as DRAFTS — never published — with its
// photos in the library and the redirects of its old addresses. docs/PLAN-MIGRACION-Y-PRODUCCION.md.
//
//   npm run web:import                                   a dry run (the default): reads, counts, shows a sample; writes NOTHING
//   npm run web:import -- --limit 10                     the same, with the newest 10
//   npm run web:import -- --apply --limit 20             writes: DATABASE_URL (Supabase) or LOCAL_DATA_DIR (the local base)
//   npm run web:import -- --apply --since 2026-01-01     only what was published since that day
//   npm run web:import -- --apply --no-media             without photos (they come in a later run)
//   npm run web:import -- --ids 123,456                  only those posts (WordPress ids), to check or bring them again
//
// Other options: --site <https://…> (default the old site), --delay <ms> between two requests (default 1000, at least
// 250), --max-side <px> of the photos (default 2048), --sample <n> rows of the sample, --report <file> (a JSON with every
// post: old address, new one, what was done and what to review; never inside the repository, which is public), --yes
// (does not ask before writing).
//
// It reads only the old site's public API, one request at a time. Run again, it updates only the drafts nobody touched;
// what the team edited, sent, published or archived is never touched again. Nothing of the old site goes to git.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import type { Backend, Row, Sql } from '../../src/lib/db/core';
import { pgTls } from '../../src/lib/db/ssl';
import { PoliteHttp, WpApi } from './wp-client';
import { reportText, runImport } from './run';
import type { MediaStore } from './store';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '../..');
const DEFAULT_SITE = 'https://freddybernaloficial.com';

const say = (s = '') => process.stdout.write(`${s}\n`);
function stop(msg: string, code = 1): never {
  process.stderr.write(`\n${msg}\n`);
  process.exit(code);
}

type Args = {
  apply: boolean;
  limit: number | null;
  since: string | null;
  ids: number[] | null;
  noMedia: boolean;
  site: string;
  delay: number;
  maxSide: number;
  sample: number;
  report: string | null;
  yes: boolean;
};

const HELP = `Uso: npm run web:import -- [--dry-run | --apply] [--limit N] [--since AAAA-MM-DD] [--ids 123,456] [--no-media]
                          [--site https://…] [--delay MS] [--max-side PX] [--sample N] [--report archivo.json] [--yes]
Sin --apply es una prueba: lee la web vieja y no escribe nada.`;

function parseArgs(argv: string[]): Args {
  const a: Args = { apply: false, limit: null, since: null, ids: null, noMedia: false, site: DEFAULT_SITE, delay: 1000, maxSide: 2048, sample: 5, report: null, yes: false };
  let dry = false;
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    const next = () => argv[++i] ?? stop(`Falta el valor de ${v}.\n${HELP}`, 2);
    const int = (name: string, min: number, max: number) => {
      const n = Number(next());
      if (!Number.isInteger(n) || n < min || n > max) stop(`${name} va de ${min} a ${max}.`, 2);
      return n;
    };
    if (v === '--apply') a.apply = true;
    else if (v === '--dry-run') dry = true;
    else if (v === '--no-media') a.noMedia = true;
    else if (v === '--yes' || v === '--si') a.yes = true;
    else if (v === '--limit') a.limit = int('--limit', 1, 100_000);
    else if (v === '--since') {
      a.since = next();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(a.since) || Number.isNaN(Date.parse(`${a.since}T00:00:00Z`))) stop('--since va como AAAA-MM-DD (por ejemplo 2026-01-01).', 2);
    } else if (v === '--ids') {
      const list = next().split(',').map((s) => Number(s.trim()));
      if (!list.length || list.length > 1000 || list.some((n) => !Number.isInteger(n) || n < 1)) stop('--ids va como números separados por comas (por ejemplo 123,456).', 2);
      a.ids = [...new Set(list)];
    } else if (v === '--site') a.site = next().replace(/\/+$/, '');
    else if (v === '--delay') a.delay = int('--delay', 250, 60_000);
    else if (v === '--max-side') a.maxSide = int('--max-side', 600, 6000);
    else if (v === '--sample') a.sample = int('--sample', 0, 200);
    else if (v === '--report') a.report = next();
    else if (v === '--help' || v === '-h' || v === '--ayuda') {
      say(HELP);
      process.exit(0);
    } else stop(`No conozco la opción ${v}.\n${HELP}`, 2);
  }
  if (a.apply && dry) stop('O --dry-run o --apply, no los dos.', 2);
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(a.site)) stop('--site va como https://dominio (sin ruta).', 2);
  return a;
}

// The folder that holds .git: nothing of the old site may live inside the (public) repository.
function repoRoot(): string | null {
  for (let d = APP; ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, '.git'))) return d;
    if (path.dirname(d) === d) return null;
  }
}
const isInside = (p: string, root: string) => {
  const rel = path.relative(root, p);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
};

/** The environment, completed from .env.local / .env of the app (what is already set wins; nothing is printed). */
function readEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of ['.env.local', '.env']) {
    const file = path.join(APP, f);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !(m[1] in out)) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  for (const [k, v] of Object.entries(process.env)) if (typeof v === 'string' && v !== '') out[k] = v;
  return out;
}

function postgresBackend(url: string): { backend: Backend; end: () => Promise<void> } {
  const client = postgres(url, { ...pgTls(url), prepare: false, max: 1, onnotice: () => {} });
  const wrap = (tx: postgres.TransactionSql): Sql => ({
    query: async <T = Row,>(t: string, p: unknown[] = []) => (await tx.unsafe(t, p as never[])) as unknown as T[],
    one: async <T = Row,>(t: string, p: unknown[] = []) => ((await tx.unsafe(t, p as never[])) as unknown as T[])[0] ?? null,
  });
  return {
    backend: { transaction: (fn) => client.begin((tx) => fn(wrap(tx))) as Promise<never>, exec: async (t) => void (await client.unsafe(t)) },
    end: () => client.end(),
  };
}

async function ask(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`${question} (s/n) `)).trim().toLowerCase();
  rl.close();
  return answer === 's' || answer === 'si' || answer === 'sí';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = readEnv();
  const root = repoRoot();
  if (args.report) {
    args.report = path.resolve(args.report);
    if (root && isInside(args.report, root)) stop('El reporte no puede guardarse dentro del repositorio (es público). Usa otra carpeta, por ejemplo ~/Desktop.');
  }
  const host = new URL(args.site).hostname.toLowerCase();
  const site = host.replace(/^www\./, '');
  const ownHosts = [site, `www.${site}`];

  // Where it writes (--apply) or what it may read (a dry run): Supabase, the local base, or nothing.
  let backend: Backend | null = null;
  let store: MediaStore | null = null;
  let where = '';
  let close = async () => {};
  if (env.DATABASE_URL) {
    const pg = postgresBackend(env.DATABASE_URL);
    backend = pg.backend;
    close = pg.end;
    where = `la base de DATABASE_URL (${new URL(env.DATABASE_URL).hostname})`;
    if (args.apply && !args.noMedia) {
      if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
        stop('Para traer las fotos a Supabase faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (o usa --no-media).');
      }
      const { supabaseMediaStore } = await import('./store');
      store = await supabaseMediaStore(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, env.STORAGE_BUCKET_WEB_PUBLIC || 'web-public');
    }
  } else if (env.LOCAL_DATA_DIR && args.apply) {
    const dir = path.resolve(APP, env.LOCAL_DATA_DIR);
    if (!fs.existsSync(path.join(dir, 'pglite.json'))) {
      stop(`No hay base local en ${dir}. Arranca la app una vez con LOCAL_DATA_DIR (npm run dev) para crearla, ciérrala y vuelve a correr esto.`);
    }
    const { openLocalDb } = await import('../../src/lib/db/local-data');
    const { asSystem } = await import('../../src/lib/db/core');
    const { seedClient } = await import('../../src/lib/db/seed-client');
    const local = await openLocalDb(dir, {
      seed: async () => {
        throw new Error('la base local no está creada');
      },
      refresh: (b) => asSystem(b, (sql) => seedClient(sql)),
    }).catch((e: Error) => stop(e.message));
    backend = local.backend;
    close = () => local.db.close();
    const { localMediaStore } = await import('./store');
    store = args.noMedia ? null : localMediaStore(dir);
    where = `la base local (${dir})`;
  } else if (args.apply) {
    stop('Para --apply hace falta DATABASE_URL (Supabase) o LOCAL_DATA_DIR (la base local, con la app cerrada).');
  }

  const which = args.ids ? ` · los artículos ${args.ids.length > 5 ? `de ${args.ids.length} números` : args.ids.join(', ')}` : args.limit ? ` · hasta ${args.limit} artículos` : ' · todos los artículos';
  say(`\n${args.apply ? 'IMPORTAR' : 'PRUEBA (no escribe nada)'} · ${args.site}${which}${args.since ? ` · desde ${args.since}` : ''}${args.noMedia ? ' · sin fotos' : ''}`);
  if (where) say(`${args.apply ? 'Escribe en' : 'Lee (solo lectura)'}: ${where}${store ? `; fotos en ${store.where}` : ''}.`);
  else if (!args.apply) say(env.LOCAL_DATA_DIR ? 'La base local no se abre en una prueba (abrirla ya la cambia): todo se cuenta como nuevo.' : 'Sin base a la mano: todo se cuenta como nuevo.');
  say(`Una petición a la vez, con ${args.delay} ms entre una y otra.`);
  if (args.apply && !args.yes) {
    if (!process.stdin.isTTY) stop('Para escribir sin preguntar, agrega --yes.');
    if (!(await ask('Los artículos entran como BORRADORES (nada se publica). ¿Seguir?'))) stop('No se escribió nada.', 0);
  }

  const http = new PoliteHttp({ fetcher: (u, i) => fetch(u, i), allowedHosts: ownHosts, delayMs: args.delay, log: say });
  const api = new WpApi(http, args.site);
  let failed = false;
  try {
    const report = await runImport({
      api,
      photos: http,
      site,
      ownHosts,
      apply: args.apply,
      limit: args.limit,
      since: args.since,
      ids: args.ids,
      noMedia: args.noMedia,
      maxSide: args.maxSide,
      tz: env.APP_TZ || 'America/Caracas',
      db: backend,
      store,
      sample: args.sample,
      log: say,
    });
    say('');
    say(reportText(report, { where }));
    if (args.report) {
      fs.mkdirSync(path.dirname(args.report), { recursive: true });
      fs.writeFileSync(args.report, JSON.stringify(report, null, 2), { mode: 0o600 });
      say(`\nEl reporte completo quedó en ${args.report} (no lo subas a git).`);
    }
    failed = report.errors.length > 0;
    if (!args.apply) say('\nEsto fue una prueba: no se escribió nada. Para importar, agrega --apply.');
  } finally {
    await close();
  }
  if (failed) process.exitCode = 1;
}

main().catch((e) => stop(`Algo falló: ${(e as Error).message}`));
