import { requireRole, db } from '@/lib/auth/session';
import { municipalities, parishes } from '@/lib/data/common';
import { parishesInUse } from '@/lib/data/fichas';
import { PageHeader } from '@/components/ui/page';
import { FichaForm } from '@/components/fichas/ficha-form';
import { OBRA_FIELDS, toFormValues } from '@/lib/domain/ficha-fields';

export const metadata = { title: 'Nueva ficha de obra' };

export default async function NewObraPage() {
  const s = await requireRole('admin', 'boss', 'dispatch', 'ivt');
  const data = await db(s, async (sql) => ({
    municipalities: await municipalities(sql),
    parishMap: await parishes(sql),
    used: await parishesInUse(sql),
  }));
  return (
    <>
      <PageHeader
        back={{ href: '/obras', label: 'Fichas de obra' }}
        title="Nueva ficha de obra"
        subtitle="Respuestas breves. Lo que no sabes, márcalo «Por confirmar»; lo que no corresponde, «No aplica». Sin fecha ni hora de la visita."
      />
      <FichaForm
        kind="obra"
        initial={toFormValues(OBRA_FIELDS)}
        initialMarks={{}}
        municipalities={data.municipalities}
        parishMap={data.parishMap}
        parishesUsed={data.used}
        canPrivate={s.mfaOk}
        cancelHref="/obras"
      />
    </>
  );
}
