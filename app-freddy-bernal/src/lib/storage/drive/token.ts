import 'server-only';
import crypto from 'node:crypto';
import { env } from '../../env';
import { DriveError, googleReason } from './errors';
import { driveFetch } from './http';

// Google OAuth for the one Drive connection. Only drive.file is asked for: the app sees the files
// it creates and the ones an admin picks, nothing else in the account.
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
export const GOOGLE_REVOKE = 'https://oauth2.googleapis.com/revoke';

export function pkce(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(48).toString('base64url');
  return { verifier, challenge: crypto.createHash('sha256').update(verifier).digest('base64url') };
}

export function authUrl(o: { redirectUri: string; state: string; challenge: string }): string {
  const q = new URLSearchParams({
    client_id: env.google.clientId,
    redirect_uri: o.redirectUri,
    response_type: 'code',
    scope: DRIVE_SCOPE,
    access_type: 'offline',
    // Always ask, so Google always returns a refresh token.
    prompt: 'consent',
    include_granted_scopes: 'false',
    code_challenge: o.challenge,
    code_challenge_method: 'S256',
    state: o.state,
  });
  return `${GOOGLE_AUTH}?${q}`;
}

/** True when the scope string Google returned includes drive.file (granular consent may drop it). */
export function hasDriveScope(scope: string): boolean {
  return scope.split(/\s+/).includes(DRIVE_SCOPE);
}

type TokenJson = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string };

async function tokenCall(body: Record<string, string>): Promise<TokenJson> {
  let res: Response;
  try {
    res = await driveFetch(GOOGLE_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
      cache: 'no-store',
    });
  } catch {
    throw new DriveError('busy', 'network');
  }
  const json = (await res.json().catch(() => ({}))) as TokenJson;
  if (res.ok && json.access_token) return json;
  const reason = googleReason(json) || `http_${res.status}`;
  // invalid_grant = the grant expired or was removed; invalid_client = wrong client id/secret.
  if (reason === 'invalid_grant') throw new DriveError('auth', reason);
  if (reason === 'invalid_client' || reason === 'unauthorized_client') throw new DriveError('not_configured', reason);
  if (res.status >= 500 || res.status === 429) throw new DriveError('busy', reason);
  throw new DriveError('refused', reason);
}

export type Tokens = { accessToken: string; refreshToken: string | null; expiresIn: number; scope: string };

export async function exchangeCode(o: { code: string; verifier: string; redirectUri: string }): Promise<Tokens> {
  const j = await tokenCall({
    grant_type: 'authorization_code',
    code: o.code,
    code_verifier: o.verifier,
    redirect_uri: o.redirectUri,
    client_id: env.google.clientId,
    client_secret: env.google.clientSecret,
  });
  return { accessToken: j.access_token!, refreshToken: j.refresh_token ?? null, expiresIn: Number(j.expires_in ?? 3600), scope: j.scope ?? '' };
}

export async function refreshAccess(refreshToken: string): Promise<Tokens> {
  const j = await tokenCall({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: env.google.clientId,
    client_secret: env.google.clientSecret,
  });
  return { accessToken: j.access_token!, refreshToken: null, expiresIn: Number(j.expires_in ?? 3600), scope: j.scope ?? '' };
}

// Removes the app's whole grant for that Google account (every token dies, the import script's
// too). Only the explicit «Quitar el permiso en Google» button calls this; «Desconectar» does not.
export async function revokeGrant(token: string): Promise<void> {
  try {
    await driveFetch(GOOGLE_REVOKE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }).toString(),
      cache: 'no-store',
    });
  } catch {
    // The stored token is deleted anyway.
  }
}
