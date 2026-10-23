import { requireRole, db } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page';
import { FormulaEditor } from './formula-editor';

export const metadata = { title: 'Fórmulas de copies' };

export default async function FormulasPage() {
  const s = await requireRole('admin');
  const rows = await db(s, (sql) =>
    sql.query<{ id: string; code: string; name: string; description: string; steps: { key: string; label: string; hint: string }[]; active: boolean }>(
      `select id, code, name, description, steps, active from public.copy_formulas where deleted_at is null order by sort`,
    ),
  );
  return (
    <>
      <PageHeader title="Fórmulas de copies" subtitle="Cada fórmula tiene sus pasos. La IA y la plantilla los siguen en orden." back={{ href: '/ajustes', label: 'Ajustes' }} />
      <FormulaEditor rows={rows} />
    </>
  );
}
