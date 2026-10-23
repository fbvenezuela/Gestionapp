import { requireRole, db } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { BrandForm } from './brand-form';

export const metadata = { title: 'Marca' };

export default async function BrandPage() {
  const s = await requireRole('admin');
  const brandRow = await db(s, (sql) => sql.one<{ value: Record<string, unknown> }>(`select value from public.app_settings where key = 'brand'`));
  const b = (brandRow?.value ?? {}) as { appName?: string; shortName?: string; greeting?: string; closings?: string[]; hashtags?: string[] };
  return (
    <>
      <PageHeader title="Marca" subtitle="Textos de la marca que usan los copies y los correos." back={{ href: '/ajustes', label: 'Ajustes' }} />
      <div className="grid gap-4 lg:grid-cols-2">
        <BrandForm value={{ appName: b.appName ?? '', shortName: b.shortName ?? '', greeting: b.greeting ?? '', closings: b.closings ?? [], hashtags: b.hashtags ?? [], raw: brandRow?.value ?? {} }} />
        <Card>
          <CardHeader title="Colores y logos" />
          <CardBody className="flex flex-col gap-3 text-[15px]">
            <p>Los colores son <b>provisionales</b> (modelo de Stitch) hasta que llegue el manual de marca «F BERNAL».</p>
            <p>Cuando llegue, solo se cambia el archivo de colores (<code>src/app/tokens.css</code>) y los logos: ninguna pantalla se toca.</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Paleta actual">
              {['bg-accent', 'bg-slate', 'bg-olive', 'bg-bg', 'bg-ok', 'bg-warn', 'bg-danger', 'bg-info'].map((c) => <span key={c} className={`h-10 w-10 rounded-[var(--radius-control)] border border-border ${c}`} />)}
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
