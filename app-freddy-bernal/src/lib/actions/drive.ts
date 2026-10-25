'use server';

import { z } from 'zod';
import { cookies, headers } from 'next/headers';
import { actOutside, UserError } from './run';
import { env } from '../env';
import type { Session } from '../auth/session';
import { storageProvider } from '../storage/provider';
import { MEDIA_KINDS } from '../storage/drive/names';

// Google Drive (docs/DRIVE.md). Everything here is for Administración with 2FA, and refused
// before any Drive call for everyone else. No action opens a transaction around a Google call.

function adminOnly(s: Session) {
  if (!s.roles.includes('admin') || !s.mfaOk) throw new UserError('Solo Administración, con doble factor, puede hacer esto.');
  if (storageProvider() !== 'drive') throw new UserError('Drive no está activado en esta versión.');
}

/** «Conectar Drive»: returns Google's consent URL; the browser goes there. */
export async function startDriveConnect(raw: unknown = {}) {
  return actOutside(z.object({}).strict(), raw, async (_i, s) => {
    adminOnly(s);
    const { beginConnect, OAUTH_COOKIE, OAUTH_COOKIE_PATH } = await import('../storage/drive/oauth');
    const r = beginConnect(s, (await headers()).get('origin'));
    (await cookies()).set(OAUTH_COOKIE, r.cookie, {
      httpOnly: true,
      secure: env.appUrl.startsWith('https://'),
      sameSite: 'lax',
      path: OAUTH_COOKIE_PATH,
      maxAge: r.maxAge,
    });
    return { url: r.url };
  });
}

/**
 * «Desconectar»: deletes the stored permission only (nothing is sent to Google, so reconnecting
 * the same account brings every file back). changeAccount = also forget which account it was;
 * files saved in that account stop opening.
 */
export async function disconnectDrive(raw: unknown = {}) {
  return actOutside(z.object({ changeAccount: z.boolean().default(false) }), raw, async (i, s) => {
    adminOnly(s);
    const { clearConnection } = await import('../storage/drive/connection');
    await clearConnection(i.changeAccount);
  }, { revalidate: ['/ajustes'] });
}

/**
 * «Quitar el permiso en Google»: revokes the app's grant at Google (every token of it dies, the
 * import script's too) and deletes it here. Separate from «Desconectar», with its own warning.
 */
export async function removeDriveGrant(raw: unknown = {}) {
  return actOutside(z.object({}).strict(), raw, async (_i, s) => {
    adminOnly(s);
    const { clearConnection, storedRefreshToken } = await import('../storage/drive/connection');
    const { revokeGrant } = await import('../storage/drive/token');
    const t = await storedRefreshToken();
    if (t) await revokeGrant(t);
    await clearConnection(false);
  }, { revalidate: ['/ajustes'] });
}

/**
 * What the Google Picker needs in the admin's browser: a short-lived (≤ 1 h) drive.file access
 * token of the platform's own account, the restricted Picker key and the project number. Held in
 * memory by the page, never stored. Not revoked afterwards: revoking it would end the grant.
 */
export async function drivePickerConfig(raw: unknown = {}) {
  return actOutside(z.object({}).strict(), raw, async (_i, s) => {
    adminOnly(s);
    const { accessToken } = await import('../storage/drive/connection');
    const { driveIsFake } = await import('../storage/provider');
    const fake = driveIsFake();
    if (!fake && !env.google.pickerApiKey) throw new UserError('Falta GOOGLE_PICKER_API_KEY en Vercel.');
    const appId = env.google.projectNumber || /^(\d+)-/.exec(env.google.clientId)?.[1] || '';
    return { accessToken: await accessToken(), apiKey: fake ? 'fake-picker-key' : env.google.pickerApiKey, appId: fake ? '0' : appId };
  });
}

const pickSchema = z.object({
  fileId: z.string().regex(/^[A-Za-z0-9_-]{10,200}$/, 'Ese archivo no es válido.'),
  eventId: z.string().uuid().nullable(),
  kind: z.enum(MEDIA_KINDS),
});

/** «Elegir de Drive»: registers one picked file (call it once per file). */
export async function registerDriveFile(raw: unknown) {
  return actOutside(pickSchema, raw, async (i, s) => {
    adminOnly(s);
    const { registerPicked } = await import('../storage/drive/register');
    return registerPicked(s, i);
  }, { revalidate: ['/eventos', '/biblioteca'] });
}

/**
 * «Probar conexión», step 1: a tiny upload session for the admin's browser to fill directly.
 * The page then PUTs 256 KiB of zeros to sessionUrl and calls finishDriveProbe.
 */
export async function startDriveProbe(raw: unknown = {}) {
  return actOutside(z.object({}).strict(), raw, async (_i, s) => {
    adminOnly(s);
    const { pageOrigin, startProbe } = await import('../storage/drive/upload');
    return startProbe(pageOrigin((await headers()).get('origin')));
  });
}

/** «Probar conexión», step 2: cleans up and says what the result means. */
export async function finishDriveProbe(raw: unknown) {
  return actOutside(z.object({ direct: z.boolean() }), raw, async (i, s) => {
    adminOnly(s);
    const { cleanProbes } = await import('../storage/drive/upload');
    await cleanProbes();
    return {
      direct: i.direct,
      message: i.direct
        ? 'Todo bien: los videos van del teléfono directo a Drive.'
        : env.drive.uploadMode === 'proxy'
          ? 'Google no deja subir directo desde aquí; las subidas pasan por la plataforma (DRIVE_UPLOAD_MODE=proxy).'
          : 'Google no deja subir directo desde este navegador. Pasar las subidas por la plataforma gasta transferencia de Vercel: hace falta el OK de Juan para poner DRIVE_UPLOAD_MODE=proxy.',
    };
  });
}

/**
 * «Probar», the server's part: variables, the stored permission, space, folder, and a tiny file
 * written and read back. Returns each step; the page says in plain words what is missing.
 */
export async function testDrive(raw: unknown = {}) {
  return actOutside(z.object({}).strict(), raw, async (_i, s) => {
    adminOnly(s);
    const { runDriveCheck } = await import('../storage/drive/check');
    return runDriveCheck();
  });
}

/** «Traer lo nuevo de Drive»: registers what the import script uploaded (a batch per call). */
export async function scanDriveImports(raw: unknown = {}) {
  return actOutside(z.object({}).strict(), raw, async (_i, s) => {
    adminOnly(s);
    const { scanImports } = await import('../storage/drive/imports');
    return scanImports(s);
  }, { revalidate: ['/biblioteca'] });
}

const codec = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9 ._/-]{0,31}$/).nullable();
const remoteProbeSchema = z.object({
  id: z.string().uuid(),
  probe: z.object({
    durationS: z.number().positive().max(86400).nullable(),
    width: z.number().int().positive().max(20000).nullable(),
    height: z.number().int().positive().max(20000).nullable(),
    fps: z.number().positive().max(1000).nullable(),
    videoCodec: codec,
    audioCodec: codec,
  }),
});

/**
 * After «Elegir de Drive» or «Traer lo nuevo de Drive»: what the admin's browser read from the
 * video (fps and codecs, which Drive does not give), so the per-network rules can check them.
 */
export async function saveDriveProbe(raw: unknown) {
  return actOutside(remoteProbeSchema, raw, async (i, s) => {
    adminOnly(s);
    const { saveRemoteProbe } = await import('../storage/drive/register');
    await saveRemoteProbe(s, i.id, i.probe);
  });
}
