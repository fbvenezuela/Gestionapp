import 'server-only';
import { driveMissingConfig } from '../provider';
import { spaceLevel, type DriveCheckStep } from '../../domain/drive-check';
import { about, openMedia, trashFile, uploadSmall } from './client';
import { driveKey, loadConnection, withDrive } from './connection';
import { DriveError } from './errors';
import { ensureFolder } from './folders';

// «Probar» (Administración), the server's part: variables, the stored permission, the space, the
// folder, and a tiny file written and read back. Stops at the first thing that fails, so the page
// can say what is missing. The browser's own direct upload is tested afterwards (startProbe).

const codeOf = (e: unknown) => (e instanceof DriveError ? (e.reason === 'bad_key' ? 'bad_key' : e.code) : 'busy');
const SAMPLE_SIZE = 1024;

export async function runDriveCheck(): Promise<DriveCheckStep[]> {
  const steps: DriveCheckStep[] = [];
  const missing = driveMissingConfig();
  if (missing.length) return [{ key: 'config', level: 'fail', code: 'missing', missing }];
  if (!driveKey()) return [{ key: 'config', level: 'fail', code: 'bad_key_format' }];
  steps.push({ key: 'config', level: 'ok' });

  const conn = await loadConnection();
  if (!conn || conn.status === 'disconnected' || !conn.token_enc) return [...steps, { key: 'connection', level: 'fail', code: 'not_connected' }];
  if (conn.status !== 'ok') return [...steps, { key: 'connection', level: 'fail', code: conn.last_error === 'bad_key' ? 'bad_key' : 'expired' }];

  let quota: { email: string; usage: number; limit: number | null };
  try {
    quota = await withDrive((t) => about(t));
  } catch (e) {
    return [...steps, { key: 'connection', level: 'fail', code: codeOf(e) }];
  }
  steps.push({ key: 'connection', level: 'ok', account: quota.email });
  steps.push({ key: 'space', level: spaceLevel(quota.usage, quota.limit), usage: quota.usage, limit: quota.limit });

  let folder: string;
  try {
    folder = await withDrive((t) => ensureFolder(t, 'Pruebas'));
  } catch (e) {
    return [...steps, { key: 'folder', level: 'fail', code: codeOf(e) }];
  }
  steps.push({ key: 'folder', level: 'ok' });

  const sample = new Uint8Array(SAMPLE_SIZE);
  crypto.getRandomValues(sample);
  let fileId: string;
  try {
    const f = await withDrive((t) =>
      uploadSmall(t, { name: 'prueba-de-lectura.bin', parents: [folder], mimeType: 'application/octet-stream', appProperties: { fb360: 'probe' } }, sample),
    );
    fileId = f.id;
  } catch (e) {
    return [...steps, { key: 'write', level: 'fail', code: codeOf(e) }];
  }
  steps.push({ key: 'write', level: 'ok' });

  try {
    const res = await withDrive((t) => openMedia(t, fileId, null));
    const back = new Uint8Array(await res.arrayBuffer());
    const same = back.length === sample.length && back.every((b, i) => b === sample[i]);
    steps.push(same ? { key: 'read', level: 'ok' } : { key: 'read', level: 'fail', code: 'mismatch' });
  } catch (e) {
    steps.push({ key: 'read', level: 'fail', code: codeOf(e) });
  } finally {
    await withDrive((t) => trashFile(t, fileId)).catch(() => {});
  }
  return steps;
}
