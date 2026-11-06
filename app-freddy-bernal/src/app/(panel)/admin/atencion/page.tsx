import { requireRole, db } from '@/lib/auth/session';
import { ATTENTION_ROLES, type Role } from '@/lib/roles';
import { PageHeader, Stat } from '@/components/ui/page';
import { Card, CardBody } from '@/components/ui/card';

export const metadata = { title: 'Atención' };

// The citizen attention desk (D-91, D-92, D-93): what people send from the website (reportes, peticiones, acotaciones,
// sugerencias, reconocimientos and denuncias), assigned, answered and resolved. Built in the next stage; meanwhile the
// counts of what this person may read (RLS: a denuncia only the denuncias operator and the coordinator; a responsible,
// their area's; Administración, none: it keeps the areas and the categories).
export default async function AttentionAdminPage() {
  const s = await requireRole('attention_coordinator', 'reports_operator', 'complaints_operator', 'auditor', 'boss', 'admin');
  const readsCases = s.roles.some((r) => r === 'boss' || (ATTENTION_ROLES as readonly Role[]).includes(r));
  const c = readsCases
    ? await db(s, (sql) =>
        sql.one<{ arrived: number; working: number; resolved: number; overdue: number }>(
          `select count(*) filter (where state in ('recibido', 'en_revision'))::int as arrived,
                  count(*) filter (where state in ('asignado', 'en_atencion', 'requiere_informacion', 'derivado'))::int as working,
                  count(*) filter (where state in ('resuelto', 'cerrado'))::int as resolved,
                  count(*) filter (where due_at < now() and state not in ('resuelto', 'cerrado', 'no_procede'))::int as overdue
             from public.requests where duplicate_of is null and not is_spam`,
        ),
      )
    : null;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader title="Atención ciudadana" subtitle="Lo que llega de la web: reportes, peticiones, acotaciones y denuncias." />
      {c ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Por revisar" value={c.arrived} tone={c.arrived ? 'accent' : undefined} />
          <Stat label="En atención" value={c.working} />
          <Stat label="Resueltas" value={c.resolved} tone="ok" />
          <Stat label="Vencidas" value={c.overdue} tone={c.overdue ? 'danger' : undefined} />
        </div>
      ) : null}
      <Card>
        <CardBody className="flex flex-col gap-2 text-[15px]">
          <p className="font-semibold">Se arma en la siguiente etapa.</p>
          <p className="text-text-2">
            {readsCases
              ? 'Aquí vas a ver cada solicitud que te toca, asignarla, responderle a la persona, dejar notas internas y marcarla resuelta. Todo queda en el historial.'
              : 'Administración arma aquí las áreas, quién está en cada una y las categorías. Las solicitudes no las lee: las atienden la coordinación y cada área.'}
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
