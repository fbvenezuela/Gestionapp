import { requireRole, db } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page';
import { contentCategories } from '@/lib/data/common';
import { NewBatch } from './new-batch';

export const metadata = { title: 'Tweets de la semana' };

export default async function NewBatchPage() {
  const s = await requireRole('admin', 'social');
  const categories = await db(s, (sql) => contentCategories(sql));
  return (
    <>
      <PageHeader title="Tweets de la semana" subtitle="Sube el documento (o pega el texto). La plataforma los separa, revisa y reparte en la semana." back={{ href: '/tweets', label: 'Tweets' }} />
      <NewBatch categories={categories} />
    </>
  );
}
