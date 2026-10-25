import { requireRole } from '@/lib/auth/session';
import { driveOverview } from '@/lib/data/drive';
import { getClientConfig } from '@/lib/client-config';
import { fmtDateTime } from '@/lib/time';
import { PageHeader } from '@/components/ui/page';
import { DriveSettings } from './drive-settings';

export const metadata = { title: 'Google Drive' };

// Ajustes → Google Drive (Administración with 2FA): where the files live, the connection, «Probar»
// and what to do when the permission expires. Never shows a token or a Drive id.
export default async function DrivePage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const s = await requireRole('admin');
  const sp = await searchParams;
  const o = await driveOverview(s);
  let error: string | null = null;
  if (o.enabled && sp.error) {
    const { CONNECT_ERROR } = await import('@/lib/storage/drive/oauth');
    error = (CONNECT_ERROR as Record<string, string>)[sp.error] ?? 'No se pudo conectar. Vuelve a intentar.';
  }
  return (
    <>
      <PageHeader title="Google Drive" subtitle="Dónde se guardan los videos, fotos y archivos del equipo." back={{ href: '/ajustes', label: 'Ajustes' }} />
      <DriveSettings
        enabled={o.enabled}
        fake={o.fake}
        missing={o.missing}
        uploadMode={o.uploadMode}
        status={o.status}
        account={o.accountEmail}
        since={o.connectedAt ? fmtDateTime(o.connectedAt) : null}
        rootReady={o.rootReady}
        monthBytes={o.monthBytes}
        capBytes={o.capBytes}
        folder={getClientConfig().drive?.rootFolderName || 'Operaciones 360'}
        justConnected={o.enabled && sp.ok === '1' && o.status === 'ok'}
        error={error}
      />
    </>
  );
}
