import { notFound } from 'next/navigation';
import { requireRole, db } from '@/lib/auth/session';
import { beforeSpeaking, readingParts } from '@/lib/domain/ficha-tab';
import { Teleprompter } from '../../../eventos/[id]/lectura/teleprompter';

export const metadata = { title: 'Modo lectura' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// «Lo que voy a decir» of an obra, big, for the boss's iPad (same teleprompter as an event's). «Antes de hablar» for
// the boss, despacho and administración, only when the database returns the contacts (2FA).
export default async function ObraReadingMode({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireRole('admin', 'boss', 'dispatch', 'ivt');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const contacts = s.roles.some((r) => r === 'admin' || r === 'boss' || r === 'dispatch');
  const data = await db(s, async (sql) => {
    const f = await sql.one<{ name: string; fab_dialog: string }>(`select name, fab_dialog from public.obra_fichas where id = $1 and deleted_at is null`, [id]);
    if (!f) return null;
    const priv = contacts ? await sql.one<Record<string, unknown>>(`select * from public.obra_ficha_private where id = $1`, [id]) : null;
    return { f, priv };
  });
  if (!data) notFound();
  const { parts } = readingParts('', [], data.f.fab_dialog);
  return (
    <Teleprompter
      title={data.f.name}
      backHref={`/obras/${id}`}
      parts={parts.length ? parts : ['Todavía no hay «Lo que voy a decir» en esta ficha.']}
      before={beforeSpeaking('obra', data.priv)}
    />
  );
}
