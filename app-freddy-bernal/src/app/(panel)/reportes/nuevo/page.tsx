import { requireRole, db } from '@/lib/auth/session';
import { municipalities, parishes } from '@/lib/data/common';
import { parishesInUse } from '@/lib/data/fichas';
import { PageHeader } from '@/components/ui/page';
import { FichaForm } from '@/components/fichas/ficha-form';
import { REPORT_FIELDS, localDateTime, toFormValues } from '@/lib/domain/ficha-fields';
import { municipalitySlug } from '@/lib/domain/territory';

export const metadata = { title: 'Nueva ficha comunitaria' };

// One ficha per activity or situation (§4.2).
export default async function NewReportPage({ searchParams }: { searchParams: Promise<{ municipio?: string }> }) {
  const s = await requireRole('admin', 'boss', 'dispatch', 'politics');
  const { municipio } = await searchParams;
  const data = await db(s, async (sql) => ({
    municipalities: await municipalities(sql),
    parishMap: await parishes(sql),
    used: await parishesInUse(sql),
  }));
  const preset = municipio && data.municipalities.includes(municipio) ? municipio : '';
  const initial = { ...toFormValues(REPORT_FIELDS), municipality: preset, status: 'planned', reported_at: localDateTime(new Date()) };
  const back = preset ? { href: `/municipios/${municipalitySlug(preset)}`, label: preset } : { href: '/municipios', label: 'Municipios' };
  return (
    <>
      <PageHeader
        back={back}
        title="Nueva ficha comunitaria"
        subtitle="Una ficha por actividad o situación. Lo que no sabes, márcalo «Por confirmar»; lo que no corresponde, «No aplica»."
      />
      <FichaForm
        kind="report"
        wantsAgenda={null}
        initial={initial}
        initialMarks={{}}
        municipalities={data.municipalities}
        parishMap={data.parishMap}
        parishesUsed={data.used}
        canPrivate={s.mfaOk}
        cancelHref={back.href}
      />
    </>
  );
}
