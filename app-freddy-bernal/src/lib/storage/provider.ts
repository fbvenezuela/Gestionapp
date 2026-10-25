import 'server-only';
import { env } from '../env';

export type StorageProvider = 'default' | 'drive';

// Where NEW files go. 'drive' only when STORAGE_PROVIDER=drive AND either the real database is in
// use or the in-memory fake Drive was asked for with the demo database. So a STORAGE_PROVIDER that
// reaches a Vercel preview (the published demo has no DATABASE_URL) changes nothing there.
// Existing rows are served by their own bucket, whatever this says.
export function storageProvider(): StorageProvider {
  if (env.storage.provider !== 'drive') return 'default';
  if (env.dataMode === 'supabase') return 'drive';
  return env.drive.fake ? 'drive' : 'default';
}

// True when Drive calls go to the in-memory fake (demo database + DRIVE_FAKE=1 only).
export function driveIsFake(): boolean {
  return env.dataMode === 'demo' && env.drive.fake;
}

// The variables still to fill for Drive to work (names only, for Ajustes and the logs).
export function driveMissingConfig(): string[] {
  if (driveIsFake()) return [];
  const missing: string[] = [];
  if (!env.google.clientId) missing.push('GOOGLE_CLIENT_ID');
  if (!env.google.clientSecret) missing.push('GOOGLE_CLIENT_SECRET');
  if (!env.drive.tokenKey && !env.sessionSecret) missing.push('DRIVE_TOKEN_KEY o SESSION_SECRET');
  return missing;
}
