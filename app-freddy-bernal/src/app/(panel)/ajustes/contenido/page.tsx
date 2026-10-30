import { requireRole, db } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page';
import { getDeletedPieces, getRedesSettings } from '@/lib/data/redes';
import { agoText } from '@/components/redes/card/card-core';
import { FORMAT } from '@/lib/domain/redes';
import { ContentSettings, DeletedPieces } from './content-settings';

export const metadata = { title: 'Cupo y pilares' };

// Ajustes → Cupo y pilares (R4, D-68, D-70): the month's quota per format, the pillars and «Piezas eliminadas» with
// «Recuperar». Administración with 2FA, like the rest of Ajustes (requireSession asks for it); the database checks the
// same rules (guard_redes_settings) and only administración brings a deleted piece back (restorePiece).
export default async function ContentSettingsPage() {
  const s = await requireRole('admin');
  const data = await db(s, async (sql) => ({ settings: await getRedesSettings(sql), deleted: await getDeletedPieces(sql) }));
  // Relative times are written here, once: the same text on the server and in the browser.
  const deleted = data.deleted.map((d) => ({ id: d.id, title: d.title, format: FORMAT[d.format].label, month: d.monthLabel, ago: agoText(d.deletedAt) }));
  return (
    <>
      <PageHeader title="Cupo y pilares" subtitle="El cupo del mes de cada formato, los pilares del contenido y las piezas eliminadas." back={{ href: '/ajustes', label: 'Ajustes' }} />
      <div className="flex min-w-0 flex-col gap-4">
        <ContentSettings quotas={data.settings.quotas} pillars={data.settings.pillars} />
        <DeletedPieces pieces={deleted} />
      </div>
    </>
  );
}
