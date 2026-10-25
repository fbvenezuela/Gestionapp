import 'server-only';
import { env } from '../../env';
import { withSystem } from '../../db';
import { notify, usersWithRole } from '../../notify';
import { driveMissingConfig } from '../provider';
import { AAD, DEMO_DRIVE_KEY_INPUT, deriveKey, open, parseKey, seal } from './crypto';
import { DriveError } from './errors';
import { refreshAccess } from './token';

// The one Drive connection: the sealed refresh token in drive_connection (system only), the
// access token in memory (never stored, never logged, never sent to a browser except the
// admin-only Picker), status changes and the admin notice when the grant stops working.
// Callers never hold a transaction open while this talks to Google.

export type DriveStatus = 'ok' | 'expired' | 'error' | 'disconnected';
export type DriveConnection = {
  account_email: string | null;
  token_enc: string | null;
  scope: string;
  root_folder_id: string | null;
  status: DriveStatus;
  last_error: string | null;
};

/** DRIVE_TOKEN_KEY, else derived from SESSION_SECRET, else (demo database only) a fixed demo key. */
export function driveKey(): Buffer | null {
  if (env.drive.tokenKey) return parseKey(env.drive.tokenKey);
  if (env.sessionSecret) return deriveKey(env.sessionSecret);
  return env.dataMode === 'demo' ? deriveKey(DEMO_DRIVE_KEY_INPUT) : null;
}

export async function loadConnection(): Promise<DriveConnection | null> {
  return withSystem((sql) =>
    sql.one<DriveConnection>(`select account_email, token_enc, scope, root_folder_id, status, last_error from public.drive_connection where id`),
  );
}

// `ref` = the sealed grant the token came from. Every use re-reads the connection row (one small
// query), so a «Desconectar» or a reconnect made on another server instance takes effect at once
// instead of when a cached token runs out.
type Cached = { token: string; exp: number; ref: string };
type G = { __fbDriveToken?: Cached | null; __fbDriveRefresh?: Promise<string> | null };
const g = globalThis as unknown as G;

export function forgetAccessToken() {
  g.__fbDriveToken = null;
  g.__fbDriveRefresh = null;
}

function remember(token: string, expiresIn: number, ref: string) {
  g.__fbDriveToken = { token, exp: Date.now() + Math.max(60, expiresIn) * 1000, ref };
}

/** A valid access token (cached until 5 minutes before it expires; one refresh at a time). */
export async function accessToken(force = false): Promise<string> {
  if (driveMissingConfig().length) throw new DriveError('not_configured', 'missing_env');
  const row = await loadConnection();
  if (!row || row.status === 'disconnected' || !row.token_enc) throw new DriveError('not_connected');
  // Expired or broken: only reconnecting fixes it (the admin was told when it happened).
  if (row.status !== 'ok') throw new DriveError('auth', row.last_error ?? row.status);
  const c = g.__fbDriveToken;
  if (!force && c && c.ref === row.token_enc && c.exp - 5 * 60_000 > Date.now()) return c.token;
  if (!g.__fbDriveRefresh) {
    const p = refreshNow(row.token_enc);
    g.__fbDriveRefresh = p;
    p.finally(() => {
      if (g.__fbDriveRefresh === p) g.__fbDriveRefresh = null;
    }).catch(() => {});
  }
  return g.__fbDriveRefresh;
}

async function refreshNow(sealed: string): Promise<string> {
  const key = driveKey();
  if (!key) throw new DriveError('not_configured', 'no_key');
  const opened = open(sealed, AAD.connection, key);
  if (!opened.ok) {
    await markProblem('error', 'bad_key');
    throw new DriveError('auth', 'bad_key');
  }
  try {
    const t = await refreshAccess(opened.value);
    remember(t.accessToken, t.expiresIn, sealed);
    return t.accessToken;
  } catch (e) {
    if (e instanceof DriveError && e.code === 'auth') await markProblem('expired', 'invalid_grant');
    throw e;
  }
}

/**
 * Runs `fn` with an access token. If Google says the token is no longer valid (401), refreshes once
 * and tries again: a token can die before its time (password change, admin action).
 */
export async function withDrive<T>(fn: (token: string) => Promise<T>): Promise<T> {
  const token = await accessToken();
  try {
    return await fn(token);
  } catch (e) {
    if (!(e instanceof DriveError) || e.code !== 'auth' || e.reason === 'invalid_grant' || e.reason === 'bad_key') throw e;
    forgetAccessToken();
    return fn(await accessToken(true));
  }
}

/** ok → expired/error, once: the first request that sees it tells Administración. */
export async function markProblem(status: 'expired' | 'error', code: string) {
  forgetAccessToken();
  const changed = await withSystem((sql) =>
    sql.one<{ status: string }>(
      `update public.drive_connection set status = $1, last_error = $2, status_at = now() where id and status = 'ok' returning status`,
      [status, code.replace(/[^a-z_]/g, '').slice(0, 40) || 'unknown'],
    ),
  );
  if (changed) {
    await noticeAdmins({
      kind: 'drive_down',
      title: status === 'expired' ? 'Se venció el permiso de Google Drive' : 'Hay que volver a conectar Google Drive',
      body: 'Entra a Ajustes → Google Drive y toca «Conectar Drive». Mientras tanto, el material de Drive no se puede ver ni subir.',
      key: `drive_down:${new Date().toISOString().slice(0, 10)}`,
    });
  }
}

/** A notice to every active admin. Never carries a Drive file name, an event date or a place. */
export async function noticeAdmins(n: { kind: string; title: string; body: string; key: string; link?: string }) {
  try {
    const admins = await usersWithRole('admin');
    if (admins.length) await notify({ userIds: admins, kind: n.kind, title: n.title, body: n.body, link: n.link ?? '/ajustes/drive', key: n.key });
  } catch (e) {
    console.error('[drive] notice failed:', (e as Error).message);
  }
}

export type NewConnection = { email: string; refreshToken: string; scope: string; rootFolderId: string; userId: string; accessToken: string; expiresIn: number };

export async function saveConnection(c: NewConnection) {
  const key = driveKey();
  if (!key) throw new DriveError('not_configured', 'no_key');
  const sealed = seal(c.refreshToken, AAD.connection, key);
  await withSystem((sql) =>
    sql.query(
      `insert into public.drive_connection (id, account_email, token_enc, scope, root_folder_id, status, status_at, last_error, connected_by, connected_at)
       values (true, $1, $2, $3, $4, 'ok', now(), null, $5, now())
       on conflict (id) do update set account_email = excluded.account_email, token_enc = excluded.token_enc, scope = excluded.scope,
         root_folder_id = excluded.root_folder_id, status = 'ok', status_at = now(), last_error = null,
         connected_by = excluded.connected_by, connected_at = now()`,
      [c.email.toLowerCase(), sealed, c.scope.slice(0, 1000), c.rootFolderId, c.userId],
    ),
  );
  remember(c.accessToken, c.expiresIn, sealed);
}

/**
 * «Desconectar»: deletes the stored token only. Nothing is sent to Google, so the per-file access
 * Google keeps for the app stays and reconnecting the same account brings everything back. The
 * account is remembered so another one cannot be connected by mistake. `changeAccount` forgets
 * it too (and the folder cache): files saved in the old account stop opening.
 */
export async function clearConnection(changeAccount = false) {
  forgetAccessToken();
  await withSystem(async (sql) => {
    await sql.query(
      `update public.drive_connection set token_enc = null, status = 'disconnected', status_at = now(), last_error = null
         ${changeAccount ? ', account_email = null, root_folder_id = null' : ''} where id`,
    );
    if (changeAccount) await sql.query(`delete from public.drive_folders`);
  });
}

/** The refresh token itself, only for «Quitar el permiso en Google» (revocation). */
export async function storedRefreshToken(): Promise<string | null> {
  const row = await loadConnection();
  const key = driveKey();
  if (!row?.token_enc || !key) return null;
  const o = open(row.token_enc, AAD.connection, key);
  return o.ok ? o.value : null;
}
