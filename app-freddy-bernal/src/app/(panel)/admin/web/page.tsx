import { requireRole, db } from '@/lib/auth/session';
import { PageHeader, Stat } from '@/components/ui/page';
import { Card, CardBody } from '@/components/ui/card';

export const metadata = { title: 'Web' };

// The public website's administration (D-91, D-93): pages by blocks, news, obras, videos, documents, the photo library,
// approval with versions and the site's settings. Built in the next stage; meanwhile, what there is, read as the person
// (RLS: drafts only for the web's people and Administración; the boss publishes too).
export default async function WebAdminPage() {
  const s = await requireRole('writer', 'web_publisher', 'boss', 'admin');
  const counts = await db(s, (sql) =>
    sql.query<{ status: string; n: number }>(`select status, count(*)::int as n from public.web_items group by status`),
  );
  const n = (status: string) => counts.find((c) => c.status === status)?.n ?? 0;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader title="La web" subtitle="Lo que se publica en la página del gobernador." />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Borradores" value={n('draft')} />
        <Stat label="Esperan aprobación" value={n('in_review')} tone={n('in_review') ? 'accent' : undefined} />
        <Stat label="Programados" value={n('scheduled')} />
        <Stat label="Publicados" value={n('published')} tone="ok" />
      </div>
      <Card>
        <CardBody className="flex flex-col gap-2 text-[15px]">
          <p className="font-semibold">Se arma en la siguiente etapa.</p>
          <p className="text-text-2">
            Aquí vas a editar las páginas por bloques, las noticias, las obras, los videos y los documentos, subir fotos con su texto
            alternativo y enviarlo a aprobación. Quien aprueba (o el jefe) lo revisa y lo publica: a la web sale exactamente lo
            aprobado.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
