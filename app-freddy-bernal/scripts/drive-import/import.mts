// Uploads a folder of videos from Juan's Mac to the platform's Google Drive folder
// («<carpeta raíz>/Importado»), so the platform can see them. docs/DRIVE.md, step D.
//
//   npm run drive:import -- --prueba ~/Desktop/claude/freddy-videos-youtube      (only shows what it would do)
//   npm run drive:import -- --cuenta <correo de la cuenta> ~/Desktop/claude/freddy-videos-youtube
//
// - Signs in with the SAME Google OAuth client as the platform (GOOGLE_CLIENT_ID and
//   GOOGLE_CLIENT_SECRET from .env.local) and the same Google account: with the drive.file
//   permission, the platform only sees files that client created. The permission lives in memory
//   for this run only; nothing about it is written or printed.
// - Videos only. Names in Drive are ARCHIVO-001.mp4, ARCHIVO-002.mov… (never the original name, a
//   date or a place). The list that matches each number with its original file stays next to the
//   folder, in <folder>/.drive-import/ (out of git), with the state that lets a cut run continue.
// - Never uploads twice (each file carries a private mark in Drive), and leaves out what the
//   exclude list says: names (or folders) starting with NO-SUBIR, the lines of <folder>/.no-subir,
//   the client's own list (config/clients/<cliente>.json → drive.importExclude) and --excluir <archivo>.
// - Afterwards, in the platform: Biblioteca → «Traer lo nuevo de Drive».
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import readline from 'node:readline/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bytesText, emptyState, excludedBy, isInside, manifestText, parseExcludeFile, parseState, planImport, type ImportState, type LocalFile } from './plan';
import { DriveRest, ImportStop, runUploads } from './run';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '../..');
const SCOPE = 'https://www.googleapis.com/auth/drive.file';

const say = (s = '') => process.stdout.write(`${s}\n`);
function stop(msg: string, code = 1): never {
  process.stderr.write(`\n${msg}\n`);
  process.exit(code);
}

// ---------------------------------------------------------------------------- arguments
type Args = { folder: string; trial: boolean; account: string | null; exclude: string | null; state: string | null; port: number; yes: boolean };

function parseArgs(argv: string[]): Args {
  const a: Args = { folder: '', trial: false, account: null, exclude: null, state: null, port: 8765, yes: false };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    const next = () => argv[++i] ?? stop(`Falta el valor de ${v}.`);
    if (v === '--prueba') a.trial = true;
    else if (v === '--si') a.yes = true;
    else if (v === '--cuenta') a.account = next().trim().toLowerCase();
    else if (v === '--excluir') a.exclude = next();
    else if (v === '--estado') a.state = next();
    else if (v === '--puerto') a.port = Number(next());
    else if (v === '--ayuda' || v === '-h') {
      say('Uso: npm run drive:import -- [--prueba] [--cuenta <correo>] [--excluir <archivo>] [--estado <archivo>] [--si] <carpeta>');
      process.exit(0);
    } else if (v.startsWith('--')) stop(`No conozco la opción ${v}. Usa --ayuda.`);
    else a.folder = v;
  }
  if (!a.folder) stop('Falta la carpeta. Ejemplo: npm run drive:import -- --prueba ~/Desktop/claude/freddy-videos-youtube');
  if (!Number.isInteger(a.port) || a.port < 1024 || a.port > 65535) stop('--puerto tiene que ser un número entre 1024 y 65535.');
  return a;
}

function expandHome(p: string) {
  return p.startsWith('~/') ? path.join(process.env.HOME ?? '', p.slice(2)) : p;
}

// The folder that holds .git: nothing of the import may live inside the (public) repository.
function repoRoot(): string | null {
  let d = APP;
  for (;;) {
    if (fs.existsSync(path.join(d, '.git'))) return d;
    const up = path.dirname(d);
    if (up === d) return null;
    d = up;
  }
}

// Paths inside the repository that .gitignore keeps out of git.
function ignoredInRepo(p: string, root: string): boolean {
  const rel = path.relative(root, p).split(path.sep).join('/');
  return /(^|\/)\.drive-import\//.test(rel) || /^(app-freddy-bernal\/)?scripts\/drive-import\/[^/]+\.json$/.test(rel);
}

// Reads GOOGLE_* from the environment or from .env.local (never printed).
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
  return { ...out, ...Object.fromEntries(Object.entries(process.env).filter(([, v]) => typeof v === 'string') as [string, string][]) };
}

function clientConfig(): { rootName: string; exclude: string[] } {
  const brand = (process.env.APP_BRAND ?? 'fb').replace(/[^a-z0-9-]/gi, '') || 'fb';
  try {
    const c = JSON.parse(fs.readFileSync(path.join(APP, 'config', 'clients', `${brand}.json`), 'utf8')) as { drive?: { rootFolderName?: string; importExclude?: unknown } };
    const exclude = Array.isArray(c.drive?.importExclude) ? c.drive!.importExclude.filter((x): x is string => typeof x === 'string') : [];
    return { rootName: c.drive?.rootFolderName || 'Operaciones 360', exclude };
  } catch {
    return { rootName: 'Operaciones 360', exclude: [] };
  }
}

// ---------------------------------------------------------------------------- local files
async function walk(root: string): Promise<LocalFile[]> {
  const out: LocalFile[] = [];
  async function go(dir: string) {
    for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue; // .drive-import, .no-subir, .DS_Store
      const abs = path.join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) await go(abs);
      else if (e.isFile()) out.push({ rel: path.relative(root, abs), size: (await fsp.stat(abs)).size });
    }
  }
  await go(root);
  return out;
}

async function saveState(file: string, state: ImportState) {
  await fsp.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp`;
  // It holds the upload sessions of unfinished files (each one a key to that one upload).
  await fsp.writeFile(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
  await fsp.rename(tmp, file);
  await fsp.writeFile(path.join(path.dirname(file), 'lista.txt'), manifestText(state), { mode: 0o600 });
}

// ---------------------------------------------------------------------------- Google sign-in
type Tokens = { access: string; refresh: string | null; exp: number };
const b64url = (b: Buffer) => b.toString('base64url');

function openBrowser(url: string) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '""', url] : [url];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
  } catch {}
}

async function signIn(clientId: string, secret: string, port: number): Promise<Tokens> {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(24));
  const redirect = `http://localhost:${port}/oauth2callback`;
  const url = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    client_id: clientId, redirect_uri: redirect, response_type: 'code', scope: SCOPE, access_type: 'offline', prompt: 'consent',
    code_challenge: challenge, code_challenge_method: 'S256', state,
  })}`;
  const code = await new Promise<string>((resolve, reject) => {
    const servers: http.Server[] = [];
    const close = () => servers.forEach((s) => s.close());
    const timer = setTimeout(() => {
      close();
      reject(new Error('No se completó la entrada a Google en 5 minutos.'));
    }, 5 * 60_000);
    const handler: http.RequestListener = (req, res) => {
      const u = new URL(req.url ?? '/', redirect);
      if (u.pathname !== '/oauth2callback') {
        res.writeHead(404).end();
        return;
      }
      const ok = u.searchParams.get('state') === state && !!u.searchParams.get('code');
      res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(ok ? '<p>Listo. Vuelve a la terminal.</p>' : '<p>No se pudo entrar. Vuelve a la terminal.</p>');
      if (u.searchParams.get('state') !== state) return; // someone else's request: keep waiting
      clearTimeout(timer);
      close();
      if (!ok) reject(new Error(u.searchParams.get('error') === 'access_denied' ? 'No diste el permiso en Google.' : 'Google no devolvió el código.'));
      else resolve(u.searchParams.get('code')!);
    };
    // Only this computer: «localhost» can be IPv4 or IPv6.
    for (const host of ['127.0.0.1', '::1']) {
      const s = http.createServer(handler);
      s.on('error', (e: NodeJS.ErrnoException) => {
        if (host === '127.0.0.1') {
          clearTimeout(timer);
          close();
          reject(new Error(e.code === 'EADDRINUSE' ? `El puerto ${port} está ocupado. Usa --puerto con otro número (y regístralo en Google).` : 'No se pudo abrir el puerto local.'));
        }
      });
      s.listen(port, host);
      servers.push(s);
    }
    say('Se abre el navegador para entrar a Google. Si no se abre, copia esta dirección:');
    say(url);
    openBrowser(url);
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: secret, redirect_uri: redirect, grant_type: 'authorization_code', code_verifier: verifier }),
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string };
  if (!res.ok || !j.access_token) stop(`Google no aceptó la entrada (${j.error ?? res.status}). Revisa que http://localhost:${port}/oauth2callback esté en las redirecciones del cliente OAuth.`);
  if (!(j.scope ?? '').split(' ').includes(SCOPE)) stop('No marcaste la casilla de Google Drive en la pantalla de Google. Vuelve a correr el script y márcala.');
  return { access: j.access_token, refresh: j.refresh_token ?? null, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
}

// ---------------------------------------------------------------------------- tokens
/** Access token for the run, renewed with the refresh token (both in memory only). */
function tokenSource(t: Tokens, clientId: string, secret: string) {
  return async (force: boolean): Promise<string> => {
    if (!force && t.exp - 120_000 > Date.now()) return t.access;
    if (!t.refresh) throw new ImportStop('El permiso de Google se venció a mitad. Vuelve a correr el script: sigue donde quedó.');
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: secret, refresh_token: t.refresh, grant_type: 'refresh_token' }),
    });
    const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
    if (!res.ok || !j.access_token) throw new ImportStop('Google no renovó el permiso. Vuelve a correr el script: sigue donde quedó.');
    t.access = j.access_token;
    t.exp = Date.now() + (j.expires_in ?? 3600) * 1000;
    return t.access;
  };
}

function progress(name: string, sent: number, size: number) {
  if (!process.stdout.isTTY) return;
  const line = `  ${name}  ${Math.floor((sent / size) * 100)} %  (${bytesText(sent)} de ${bytesText(size)})`;
  process.stdout.write(`\r${line.padEnd(70)}`);
  if (sent >= size) process.stdout.write('\n');
}

async function ask(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const a = (await rl.question(`${question} (s/n) `)).trim().toLowerCase();
  rl.close();
  return a === 's' || a === 'si' || a === 'sí';
}

// ---------------------------------------------------------------------------- main
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const folder = path.resolve(expandHome(args.folder));
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) stop(`No encuentro la carpeta ${folder}.`);
  const root = repoRoot();
  if (root && isInside(folder, root)) stop('Esa carpeta está dentro del repositorio, que es público. Usa la carpeta de tu Mac (por ejemplo ~/Desktop/...).');
  const stateFile = path.resolve(expandHome(args.state ?? path.join(folder, '.drive-import', 'estado.json')));
  if (root && isInside(stateFile, root) && !ignoredInRepo(stateFile, root)) stop('El estado no puede guardarse dentro del repositorio. Déjalo en la carpeta de los videos (sin --estado).');

  const cfg = clientConfig();
  const patterns = [...cfg.exclude];
  const localList = path.join(folder, '.no-subir');
  if (fs.existsSync(localList)) patterns.push(...parseExcludeFile(fs.readFileSync(localList, 'utf8')));
  if (args.exclude) {
    const f = path.resolve(expandHome(args.exclude));
    if (!fs.existsSync(f)) stop(`No encuentro la lista para excluir: ${f}`);
    patterns.push(...parseExcludeFile(fs.readFileSync(f, 'utf8')));
  }

  const state = fs.existsSync(stateFile) ? parseState(fs.readFileSync(stateFile, 'utf8')) : emptyState();
  const files = await walk(folder);
  const plan = planImport(files, state, patterns);
  const total = plan.upload.reduce((n, f) => n + f.size, 0);

  say(`\nCarpeta: ${folder}`);
  if (plan.excluded.length) {
    say(`\nSe quedan fuera (${plan.excluded.length}):`);
    for (const e of plan.excluded) say(`  - ${e.rel}   [${e.why}]`);
  }
  if (plan.skipped.length) say(`\nNo son videos y no se suben: ${plan.skipped.length} (por ejemplo ${plan.skipped.slice(0, 3).map((s) => s.rel).join(', ')}).`);
  if (plan.done.length) say(`Ya estaban subidos: ${plan.done.length}.`);
  say(`\nPara subir: ${plan.upload.length} videos, ${bytesText(total)} en total.`);
  for (const u of plan.upload) say(`  ${u.name}  ←  ${u.rel}  (${bytesText(u.size)})`);
  // A file excluded now but uploaded in an earlier run: say it, it has to be deleted in Drive.
  const already = Object.entries(state.files).filter(([rel, f]) => f.done && excludedBy(rel, patterns));
  for (const [rel, f] of already) say(`\nOjo: ${rel} ya se había subido como ${f.name}. Bórralo en Drive, vacía la papelera y quítalo en la plataforma.`);

  if (args.trial) {
    say('\nEsto fue solo una prueba: no se subió nada. Corre lo mismo sin --prueba para subir.');
    return;
  }
  if (!plan.upload.length) {
    say('\nNo hay nada nuevo para subir. En la plataforma: Biblioteca → «Traer lo nuevo de Drive».');
    return;
  }

  const env = readEnv();
  const clientId = env.GOOGLE_CLIENT_ID ?? '';
  const secret = env.GOOGLE_CLIENT_SECRET ?? '';
  if (!clientId || !secret) stop('Faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en app-freddy-bernal/.env.local (los mismos de Vercel). Llénalos y vuelve a correr.');

  const drive = new DriveRest((u, i) => fetch(u, i), tokenSource(await signIn(clientId, secret, args.port), clientId, secret));
  const me = await drive.about();
  const expected = args.account ?? state.account;
  if (expected && me.email !== expected) stop(`Entraste con ${me.email}, pero la cuenta de la plataforma es ${expected}. Vuelve a correr el script y entra con esa.`);
  if (!expected && !args.yes && !(await ask(`\nVas a subir a la cuenta ${me.email}. ¿Es la misma que sale en Ajustes → Google Drive?`))) stop('No se subió nada.', 0);
  state.account = me.email;
  if (me.limit != null && me.limit - me.usage < total) stop(`No cabe: hay ${bytesText(Math.max(0, me.limit - me.usage))} libres y hacen falta ${bytesText(total)}. Libera espacio y vuelve a correr.`);
  if (me.limit != null) say(`Espacio en Drive: ${bytesText(me.usage)} usados de ${bytesText(me.limit)}.`);
  if (!args.yes && !(await ask(`¿Subir ${plan.upload.length} videos (${bytesText(total)})?`))) stop('No se subió nada.', 0);

  // The platform's folder (made when Administración connected Drive) or a new one with its mark.
  const { importId } = await drive.folders(cfg.rootName);
  process.on('SIGINT', () => {
    void saveState(stateFile, state).finally(() => stop('\nSe detuvo. Vuelve a correr el script: sigue donde quedó.', 130));
  });
  const r = await runUploads({
    drive,
    fetcher: (u, i) => fetch(u, i),
    folder,
    plan,
    state,
    importId,
    save: (s) => saveState(stateFile, s),
    log: say,
    onProgress: progress,
  });
  say(`\nListo: ${r.sent} subidos${r.already ? `, ${r.already} ya estaban` : ''}.`);
  say(`La lista de qué es cada ARCHIVO-xxx está en ${path.join(path.dirname(stateFile), 'lista.txt')} (no la subas a git).`);
  say('Ahora, en la plataforma (Administración): Biblioteca → «Traer lo nuevo de Drive».');
}

main().catch((e) => stop(e instanceof ImportStop ? e.message : `Algo falló: ${(e as Error).message}`));
