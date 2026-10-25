import 'server-only';
import { db, type Session } from '../auth/session';
import { env } from '../env';
import { driveIsFake, driveMissingConfig, storageProvider } from '../storage/provider';

export type DriveOverview = {
  enabled: boolean;
  fake: boolean;
  missing: string[];
  uploadMode: 'direct' | 'proxy';
  capBytes: number | null;
  // From drive_status(): one row for admin with 2FA, none for everyone else.
  status: 'ok' | 'expired' | 'error' | 'disconnected' | null;
  accountEmail: string | null;
  connectedAt: Date | null;
  statusAt: Date | null;
  lastError: string | null;
  rootReady: boolean;
  monthBytes: number;
};

/** What Ajustes → Google Drive shows. Never a token or a Drive id. */
export async function driveOverview(s: Session): Promise<DriveOverview> {
  const enabled = storageProvider() === 'drive';
  const row = enabled
    ? await db(s, (sql) =>
        sql.one<{ status: DriveOverview['status']; account_email: string | null; connected_at: Date | null; status_at: Date | null; last_error: string | null; root_ready: boolean; month_bytes: string | number }>(
          `select * from public.drive_status()`,
        ),
      )
    : null;
  const gb = env.drive.transferCapGb;
  return {
    enabled,
    fake: driveIsFake(),
    missing: enabled ? driveMissingConfig() : [],
    uploadMode: env.drive.uploadMode,
    capBytes: Number.isFinite(gb) && gb > 0 ? Math.floor(gb * 1024 ** 3) : null,
    status: row?.status ?? null,
    accountEmail: row?.account_email ?? null,
    connectedAt: row?.connected_at ?? null,
    statusAt: row?.status_at ?? null,
    lastError: row?.last_error ?? null,
    rootReady: row?.root_ready ?? false,
    monthBytes: Number(row?.month_bytes ?? 0),
  };
}

export type DriveUi = {
  // New files go to Drive (STORAGE_PROVIDER=drive).
  enabled: boolean;
  // «Elegir de Drive» and «Traer lo nuevo de Drive»: Administración with 2FA, connected.
  picker: boolean;
  // For Administración only: what is wrong with the connection (null = fine, or not admin).
  problem: 'expired' | 'error' | 'disconnected' | null;
};

/** What the material screens show about Drive for this person. Never a token or a Drive id. */
export async function driveUi(s: Session): Promise<DriveUi> {
  if (storageProvider() !== 'drive') return { enabled: false, picker: false, problem: null };
  if (!s.roles.includes('admin') || !s.mfaOk) return { enabled: true, picker: false, problem: null };
  const row = await db(s, (sql) => sql.one<{ status: DriveOverview['status'] }>(`select status from public.drive_status()`));
  const status = row?.status ?? 'disconnected';
  return { enabled: true, picker: status === 'ok', problem: status === 'ok' ? null : status };
}
