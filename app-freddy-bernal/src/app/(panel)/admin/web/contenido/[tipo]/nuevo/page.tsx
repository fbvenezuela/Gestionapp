import { notFound, redirect } from 'next/navigation';
import { requireRole, db } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody } from '@/components/ui/card';
import { NewItemForm } from '@/components/cms/new-item-form';
import { webCaps } from '@/lib/data/web-admin';
import { ADMIN_WEB, sectionBySlug } from '@/lib/web/cms/kinds';
import { noPermissionUrl } from '@/components/shell/no-permission';

export const metadata = { title: 'Nuevo · Web' };

// «Nuevo»: the title first (the address comes from it), then the editor. Only for whom the database lets write drafts.
export default async function NewItemPage({ params }: { params: Promise<{ tipo: string }> }) {
  const s = await requireRole('writer', 'web_publisher', 'boss', 'admin');
  const section = sectionBySlug((await params).tipo);
  if (!section || !section.create || section.kind === 'page') notFound();
  const caps = await db(s, (sql) => webCaps(sql));
  if (!caps.canEdit) redirect(noPermissionUrl(ADMIN_WEB.list(section.kind)));
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={section.create} subtitle="Empieza por el título: la dirección en la web sale de él y la puedes cambiar después." back={{ href: ADMIN_WEB.list(section.kind), label: section.label }} />
      <Card>
        <CardBody>
          <NewItemForm kind={section.kind} />
        </CardBody>
      </Card>
    </div>
  );
}
