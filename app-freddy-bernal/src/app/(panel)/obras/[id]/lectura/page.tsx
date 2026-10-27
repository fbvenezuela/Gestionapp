import { notFound } from 'next/navigation';
import { requireRole, db } from '@/lib/auth/session';
import { Teleprompter } from '../../../eventos/[id]/lectura/teleprompter';

export const metadata = { title: 'Modo lectura' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// «Lo que voy a decir» of an obra, big, for the boss's iPad (same teleprompter as an event's).
export default async function ObraReadingMode({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireRole('admin', 'boss', 'dispatch', 'ivt');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const f = await db(s, (sql) => sql.one<{ name: string; fab_dialog: string }>(`select name, fab_dialog from public.obra_fichas where id = $1 and deleted_at is null`, [id]));
  if (!f) notFound();
  const parts = f.fab_dialog.split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean);
  return <Teleprompter title={f.name} backHref={`/obras/${id}`} parts={parts.length ? parts : ['Todavía no hay «Lo que voy a decir» en esta ficha.']} />;
}
