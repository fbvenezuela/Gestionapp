import { requireRole, db } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page';
import { contentCategories } from '@/lib/data/common';
import { NewPieceForm } from './new-piece-form';

export const metadata = { title: 'Nueva pieza' };

export default async function NewPiecePage({ searchParams }: { searchParams: Promise<{ evento?: string }> }) {
  const s = await requireRole('admin', 'social', 'boss');
  const { evento } = await searchParams;
  const data = await db(s, async (sql) => ({
    categories: await contentCategories(sql),
    events: await sql.query<{ id: string; title: string; category_id: string | null }>(
      `select id, title, category_id from public.events where deleted_at is null and cancelled_at is null and boss_decision <> 'rejected' order by created_at desc limit 100`,
    ),
  }));
  return (
    <>
      <PageHeader title="Nueva pieza" back={{ href: '/piezas', label: 'Piezas' }} />
      <NewPieceForm {...data} eventId={evento ?? ''} />
    </>
  );
}
