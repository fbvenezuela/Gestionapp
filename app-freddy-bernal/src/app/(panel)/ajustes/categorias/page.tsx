import { requireRole, db } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page';
import { CategoryEditor } from './category-editor';

export const metadata = { title: 'Categorías' };

export default async function CategoriesPage() {
  const s = await requireRole('admin');
  const rows = await db(s, (sql) =>
    sql.query<{ id: string; parent_id: string | null; name: string; emoji: string | null; active: boolean }>(
      `select id, parent_id, name, emoji, active from public.categories where kind = 'content' and deleted_at is null order by parent_id nulls first, sort, name`,
    ),
  );
  return (
    <>
      <PageHeader title="Categorías" subtitle="La lista de categorías del contenido. Desactiva en vez de borrar." back={{ href: '/ajustes', label: 'Ajustes' }} />
      <CategoryEditor rows={rows} />
    </>
  );
}
