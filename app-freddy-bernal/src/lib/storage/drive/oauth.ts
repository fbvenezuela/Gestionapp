import 'server-only';
import crypto from 'node:crypto';
import type { Session } from '../../auth/session';
import { env } from '../../env';
import { UserError } from '../../actions/run';
import { driveIsFake, driveMissingConfig, storageProvider } from '../provider';
import { about, getFile } from './client';
import { driveKey, loadConnection, saveConnection } from './connection';
import { AAD, open, seal } from './crypto';
import { DriveError } from './errors';
import { findOrCreateRoot, forgetFolders } from './folders';
import { authUrl, exchangeCode, hasDriveScope, pkce } from './token';
import { pageOrigin } from './upload';

// «Conectar Drive» (Administración with 2FA, once): server-side OAuth web flow with PKCE. The
// state and the PKCE verifier travel in one sealed, httpOnly cookie bound to the admin, valid 10
// minutes. The refresh token is sealed before it is stored and never logged or sent anywhere.

export const OAUTH_COOKIE = 'fb_drive_oauth';
export const OAUTH_COOKIE_PATH = '/api/drive';
const TEN_MINUTES = 10 * 60_000;

type OAuthState = { uid: string; state: string; verifier: string; redirectUri: string; exp: number };

// What /ajustes/drive?error=<code> shows.
export const CONNECT_ERROR = {
  permiso: 'Solo Administración, con doble factor, puede conectar Drive.',
  estado: 'El intento de conexión venció o no es de esta sesión. Vuelve a tocar «Conectar Drive».',
  negado: 'No diste el permiso en Google. Vuelve a intentar y acepta.',
  alcance: 'Marca la casilla de Google Drive en la pantalla de Google y vuelve a intentar.',
  cuenta: 'Esa no es la cuenta de Google de la plataforma. Entra con la de siempre (la ves en Ajustes → Google Drive).',
  google: 'Google no respondió. Intenta en un momento.',
  config: 'Drive no está configurado. Faltan variables en Vercel (ver docs/DRIVE.md).',
} as const;
export type ConnectError = keyof typeof CONNECT_ERROR;

const isAdmin = (s: Session | null): s is Session => !!s && s.roles.includes('admin') && s.mfaOk;

function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Starts the flow: returns Google's consent URL and the sealed cookie value to set. */
export function beginConnect(s: Session, requestOrigin: string | null): { url: string; cookie: string; maxAge: number } {
  if (!isAdmin(s)) throw new UserError(CONNECT_ERROR.permiso);
  if (storageProvider() !== 'drive') throw new UserError('Drive no está activado en esta versión (STORAGE_PROVIDER).');
  const missing = driveMissingConfig();
  if (missing.length) throw new UserError(`Falta llenar en Vercel: ${missing.join(', ')}.`);
  const key = driveKey();
  if (!key) throw new UserError('DRIVE_TOKEN_KEY no es válida: tienen que ser 32 bytes en base64.');
  let origin: string;
  if (driveIsFake()) origin = pageOrigin(requestOrigin);
  else {
    // Google only accepts redirect addresses registered exactly: production (APP_URL) or local.
    origin = new URL(env.appUrl).origin;
    if (requestOrigin && requestOrigin !== origin) throw new UserError(`Conecta Drive desde la dirección principal de la plataforma: ${origin}`);
  }
  const state = crypto.randomBytes(24).toString('base64url');
  const { verifier, challenge } = pkce();
  const redirectUri = `${origin}/api/drive/callback`;
  const url = driveIsFake()
    ? `${redirectUri}?${new URLSearchParams({ code: `fake-code-${crypto.randomBytes(6).toString('hex')}`, state })}`
    : authUrl({ redirectUri, state, challenge });
  const payload: OAuthState = { uid: s.userId, state, verifier, redirectUri, exp: Date.now() + TEN_MINUTES };
  return { url, cookie: seal(JSON.stringify(payload), AAD.oauthState, key), maxAge: TEN_MINUTES / 1000 };
}

/** Google came back to /api/drive/callback. Stores the connection or says what went wrong. */
export async function finishConnect(s: Session | null, q: URLSearchParams, cookie: string | undefined): Promise<{ ok: true } | { ok: false; code: ConnectError }> {
  if (!isAdmin(s)) return { ok: false, code: 'permiso' };
  if (driveMissingConfig().length) return { ok: false, code: 'config' };
  const key = driveKey();
  if (!key) return { ok: false, code: 'config' };
  const opened = cookie ? open(cookie, AAD.oauthState, key) : null;
  let st: OAuthState | null = null;
  try {
    st = opened?.ok ? (JSON.parse(opened.value) as OAuthState) : null;
  } catch {
    st = null;
  }
  const state = q.get('state') ?? '';
  if (!st || st.uid !== s.userId || st.exp < Date.now() || !state || !sameText(st.state, state)) return { ok: false, code: 'estado' };
  if (q.get('error')) return { ok: false, code: q.get('error') === 'access_denied' ? 'negado' : 'google' };
  const code = q.get('code');
  if (!code || code.length > 2000) return { ok: false, code: 'estado' };

  try {
    const t = await exchangeCode({ code, verifier: st.verifier, redirectUri: st.redirectUri });
    if (!hasDriveScope(t.scope)) return { ok: false, code: 'alcance' };
    if (!t.refreshToken) return { ok: false, code: 'google' };
    const { email } = await about(t.accessToken);
    if (!email) return { ok: false, code: 'google' };
    const prev = await loadConnection();
    if (prev?.account_email && prev.account_email.toLowerCase() !== email.toLowerCase()) return { ok: false, code: 'cuenta' };
    // Same account: keep its root folder if it is still there; otherwise find (or make) it again.
    let root: string | null = prev?.root_folder_id ?? null;
    if (root) {
      const f = await getFile(t.accessToken, root, 'id,trashed').catch((e) => {
        if (e instanceof DriveError && e.code === 'not_found') return null;
        throw e;
      });
      if (!f || f.trashed) root = null;
    }
    if (!root) {
      if (prev?.root_folder_id) await forgetFolders();
      root = await findOrCreateRoot(t.accessToken);
    }
    await saveConnection({ email, refreshToken: t.refreshToken, scope: t.scope, rootFolderId: root, userId: s.userId, accessToken: t.accessToken, expiresIn: t.expiresIn });
    return { ok: true };
  } catch (e) {
    if (e instanceof DriveError) {
      if (e.code === 'not_configured') return { ok: false, code: 'config' };
      if (e.code === 'auth') return { ok: false, code: 'estado' };
    }
    console.error('[drive] connect failed:', e instanceof DriveError ? e.message : 'error');
    return { ok: false, code: 'google' };
  }
}
