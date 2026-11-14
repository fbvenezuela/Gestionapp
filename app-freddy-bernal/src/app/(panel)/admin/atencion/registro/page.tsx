import Link from 'next/link';
import { requireRole, db } from '@/lib/auth/session';
import { PageHeader, EmptyState } from '@/components/ui/page';
import { Card } from '@/components/ui/card';
import { DeskNav } from '@/components/attention/desk-nav';
import { REQUEST_STATE_LABEL, deskAccess, type RequestState } from '@/lib/domain/attention';
import { fmtDateTime } from '@/lib/time';
import { AUDIT_CHANGED_COUNT_SQL, AUDIT_FROM_WEB_SQL, auditChanged, auditWho, auditWhat } from '@/lib/domain/audit-log';

export const metadata = { title: 'Registro de atención' };

// The attention desk's audit trail (D-93: «Consulta y auditoría» reads the requests and their record of changes; design
// §5 «Audit»): who looked at a person's contact and when, who exported and with what, and every change to a case, its
// messages, files, areas and catalogues, with who and when. Never the content: the audit of these tables keeps the
// workflow fields and the names of the other fields that changed (20261106000200_participacion.sql). Read as the
// person: the auditor's policy covers these tables only; a denuncia's code stays hidden from them (RLS on requests).
const TABLES = ['areas', 'area_members', 'request_categories', 'requests', 'request_supports', 'request_contacts', 'request_events', 'request_messages',
  'request_attachments', 'attended_publications', 'request_reply_templates'];

type Row = {
  id: number; at: Date; action: string; table_name: string; actor: string | null; from_web: boolean | null; request_id: string | null;
  reference: string | null; new_data: Record<string, unknown> | null; old_state: string | null; old_status: string | null; changed: number | null;
};

// The same words as Ajustes → «Registro de cambios» (src/lib/domain/audit-log.ts); here a line can also say which
// request it was (its code, a link to the case), how many it exported and the state a request took.
function what(r: Row): { verb: string; object: string } {
  const d = r.new_data ?? {};
  if (r.action === 'export') {
    const rows = Number(d.rows ?? 0);
    return { verb: 'exportó', object: `${rows === 1 ? '1 solicitud' : `${rows} solicitudes`} en CSV${d.with_contact ? ', con el contacto' : ', sin contactos'}` };
  }
  if (r.table_name === 'requests' && r.action === 'update' && typeof d.state === 'string' && d.state !== r.old_state) {
    return { verb: `pasó a «${REQUEST_STATE_LABEL[d.state as RequestState] ?? 'otro estado'}»`, object: 'una solicitud' };
  }
  if (r.table_name === 'attended_publications' && r.action === 'update' && d.status === 'withdrawn' && r.old_status !== 'withdrawn') {
    return { verb: 'retiró', object: 'un caso atendido' };
  }
  return auditWhat(r.table_name, r.action);
}

// «… de una solicitud» + its code reads «… de la solicitud FB-…».
const withCode = (object: string) => object.replace(/una solicitud$/, 'la solicitud');

export default async function AttentionAuditPage({ searchParams }: { searchParams: Promise<{ antes?: string }> }) {
  const s = await requireRole('auditor', 'admin');
  const access = deskAccess(s.roles);
  const { antes } = await searchParams;
  const before = antes && /^\d{1,18}$/.test(antes) ? antes : null;
  const uuid = (x: string) => `case when ${x} ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (${x})::uuid end`;
  const rows = await db(s, (sql) =>
    sql.query<Row>(
      `select a.id, a.at, a.action, a.table_name, a.new_data, a.old_data ->> 'state' as old_state, a.old_data ->> 'status' as old_status,
              coalesce(nullif(btrim(p.full_name), ''), p.email) as actor, ${AUDIT_FROM_WEB_SQL} as from_web,
              ${AUDIT_CHANGED_COUNT_SQL} as changed, r.id as request_id, r.reference
         from public.audit_log a
         left join public.profiles p on p.id = a.actor_id
         left join public.requests r on r.id = (case
              when a.table_name = 'requests' or (a.table_name = 'request_contacts' and a.action = 'contact_view') then ${uuid('a.row_id')}
              else ${uuid("coalesce(a.new_data ->> 'request_id', a.old_data ->> 'request_id')")} end)
        where a.table_name = any($1::text[]) and ($2::bigint is null or a.id < $2::bigint)
        order by a.id desc limit 100`,
      [TABLES, before],
    ),
  );
  return (
    <div className="flex flex-col">
      <PageHeader title="Registro de atención" subtitle="Quién hizo qué y cuándo: cambios, contactos vistos y exportaciones. No se edita ni se borra, y no guarda lo que dicen." />
      <DeskNav access={access} current="registro" />
      {rows.length ? (
        <Card solid>
          <ul className="divide-y divide-border">
            {rows.map((r) => {
              const { verb, object } = what(r);
              const code = r.action !== 'export' && r.reference && r.request_id;
              const changed = r.action === 'update' && !/^pasó a|^retiró/.test(verb) ? auditChanged(r.changed) : null;
              return (
                <li key={r.id} className="px-4 py-3 text-[15px] [overflow-wrap:anywhere]">
                  <span className="font-semibold">{auditWho(r.actor, r.from_web)}</span> {verb} {code ? withCode(object) : object}
                  {code ? (
                    <>
                      {' '}
                      <Link href={`/admin/atencion/${r.request_id}`} className="font-mono font-semibold text-accent-ink underline-offset-2 hover:underline">{r.reference}</Link>
                    </>
                  ) : null}
                  {changed ? <span className="text-text-2"> {changed}</span> : null}
                  <span className="block text-sm text-text-2">{fmtDateTime(r.at)}</span>
                </li>
              );
            })}
          </ul>
          {rows.length === 100 ? (
            <Link href={`/admin/atencion/registro?antes=${rows[rows.length - 1].id}`} className="block min-h-11 border-t border-border p-4 text-center font-semibold text-accent-ink">
              Ver más antiguos
            </Link>
          ) : null}
        </Card>
      ) : (
        <EmptyState title="Todavía no hay nada en el registro de atención." />
      )}
    </div>
  );
}
