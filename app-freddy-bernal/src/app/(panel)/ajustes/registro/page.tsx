import { requireRole, db } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page';
import { Card } from '@/components/ui/card';
import { fmtDateTime } from '@/lib/time';
import { RETIRED_ROLES, ROLE_LABEL } from '@/lib/roles';
import { AUDIT_CHANGED_COUNT_SQL, AUDIT_NO_ACTOR, auditChanged, auditWhat } from '@/lib/domain/audit-log';

export const metadata = { title: 'Registro de cambios' };

// One summary row of 20261027001600_six_roles.sql: the retired roles keep their names here (history).
const RETIRED = `retiró los roles ${RETIRED_ROLES.map((r) => ROLE_LABEL[r]).join(' y ')}: quedan los seis del equipo y la historia se guarda`;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ antes?: string }> }) {
  const s = await requireRole('admin');
  const { antes } = await searchParams;
  // Only the id of the last line seen; anything else starts from the newest.
  const before = antes && /^\d{1,18}$/.test(antes) ? antes : null;
  const rows = await db(s, (sql) =>
    sql.query<{ id: number; at: string; actor: string | null; table_name: string; action: string; row_id: string | null; changed: number | null }>(
      `select a.id, a.at, coalesce(nullif(btrim(p.full_name), ''), p.email) as actor, a.table_name, a.action, a.row_id,
              ${AUDIT_CHANGED_COUNT_SQL} as changed
         from public.audit_log a left join public.profiles p on p.id = a.actor_id
        where ($1::bigint is null or a.id < $1::bigint) order by a.id desc limit 100`,
      [before],
    ),
  );
  return (
    <>
      <PageHeader title="Registro de cambios" subtitle="Quién cambió qué y cuándo. No se puede editar ni borrar." back={{ href: '/ajustes', label: 'Ajustes' }} />
      <Card solid>
        <ul className="divide-y divide-border">
          {rows.map((r) => {
            const { verb, object } = auditWhat(r.table_name, r.action);
            const changed = auditChanged(r.changed);
            return (
              <li key={r.id} className="px-4 py-3 text-[15px] [overflow-wrap:anywhere]">
                <span className="font-semibold">{r.actor ?? AUDIT_NO_ACTOR}</span>{' '}
                {r.action === 'roles_retired' ? RETIRED : (
                  <>
                    {verb} <span className="font-semibold">{object}</span>
                  </>
                )}
                {changed ? <span className="text-text-2"> {changed}</span> : null}
                <span className="block text-sm text-text-2">{fmtDateTime(r.at)}</span>
              </li>
            );
          })}
        </ul>
        {rows.length === 100 ? (
          <a href={`?antes=${rows[rows.length - 1].id}`} className="block border-t border-border p-4 text-center font-semibold text-accent-ink">Ver más antiguos</a>
        ) : null}
      </Card>
    </>
  );
}
