import { requireRole, db } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page';
import { contentCategories } from '@/lib/data/common';
import { monthContext } from '@/lib/data/redes';
import { hasConcreteDateTime } from '@/lib/domain/chat';
import { isFormat, type Format } from '@/lib/domain/redes';
import { NewPieceForm } from './new-piece-form';

export const metadata = { title: 'Nueva pieza' };

// «Nueva pieza» from an event's «Piezas» tab (/piezas/nueva?evento=, R4, D-60): the event, the «Formato» (six big
// buttons with their help), the «Mes» (the open one by default; never from the event's date, D-75), the category and
// the title. Redes' own «Crear» opens «¿Qué quieres crear?» instead (/redes?crear=1). Of the events, only id, title and
// category: never when nor where.
export default async function NewPiecePage({ searchParams }: { searchParams: Promise<{ evento?: string; formato?: string }> }) {
  const s = await requireRole('admin', 'social', 'boss');
  const { evento, formato } = await searchParams;
  const data = await db(s, async (sql) => ({
    categories: await contentCategories(sql),
    mc: await monthContext(sql, null),
    events: await sql.query<{ id: string; title: string; category_id: string | null }>(
      `select id, title, category_id from public.events where deleted_at is null and cancelled_at is null and boss_decision <> 'rejected' order by created_at desc limit 100`,
    ),
  }));
  // Redes reads the title of a piece: an event's title that carries a date or an hour is not offered as the piece's
  // (whoever knows the agenda could not save it, guard_piece_title, and Redes should not read it).
  const events = data.events.map((e) => ({ id: e.id, title: e.title, category_id: e.category_id, pieceTitle: hasConcreteDateTime(e.title) ? '' : e.title }));
  const ev = events.find((e) => e.id === evento);
  return (
    <>
      <PageHeader title="Nueva pieza" back={ev ? { href: `/eventos/${ev.id}?tab=piezas`, label: 'Evento' } : { href: '/redes', label: 'Redes' }} />
      <NewPieceForm
        categories={data.categories}
        events={events}
        eventId={ev?.id ?? ''}
        months={data.mc.months}
        monthId={data.mc.active?.id ?? ''}
        format={isFormat(formato) ? (formato as Format) : 'reel'}
      />
    </>
  );
}
