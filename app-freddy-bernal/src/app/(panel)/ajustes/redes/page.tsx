import { requireRole, db } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page';
import { SpecEditor } from './spec-editor';

export const metadata = { title: 'Reglas por red' };

export default async function SpecsPage() {
  const s = await requireRole('admin');
  const rows = await db(s, (sql) =>
    sql.query<{ network: string; label: string; formats: Record<string, Record<string, unknown>>; copy_max_chars: number; notes: string; source_url: string; verified_on: string | Date | null }>(
      `select network, label, formats, copy_max_chars, notes, source_url, verified_on from public.network_specs order by network`,
    ),
  );
  return (
    <>
      <PageHeader title="Reglas de video por red" subtitle="Con esto se revisa cada video antes de programar. Verifica los valores con la documentación de cada red." back={{ href: '/ajustes', label: 'Ajustes' }} />
      <div className="flex flex-col gap-4">{rows.map((r) => <SpecEditor key={r.network} row={r} />)}</div>
    </>
  );
}
