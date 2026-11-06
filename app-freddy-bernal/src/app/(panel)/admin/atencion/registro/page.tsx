import Link from 'next/link';
import { requireRole, db } from '@/lib/auth/session';
import { PageHeader, EmptyState } from '@/components/ui/page';
import { Card } from '@/components/ui/card';
import { DeskNav } from '@/components/attention/desk-nav';
import { REQUEST_STATE_LABEL, deskAccess, type RequestState } from '@/lib/domain/attention';
import { fmtDateTime } from '@/lib/time';

export const metadata = { title: 'Registro de atención' };

// The attention desk's audit trail (D-93: «Consulta y auditoría» reads the requests and their record of changes; design
// §5 «Audit»): who looked at a person's contact and when, who exported and with what, and every change to a case, its
// messages, files, areas and catalogues, with who and when. Never the content: the audit of these tables keeps the
// workflow fields and the names of the other fields that changed (20261106000200_participacion.sql). Read as the
// person: the auditor's policy covers these tables only; a denuncia's code stays hidden from them (RLS on requests).
const TABLES = ['areas', 'area_members', 'request_categories', 'requests', 'request_supports', 'request_contacts', 'request_events', 'request_messages',
  'request_attachments', 'attended_publications', 'request_reply_templates'];

const TABLE: Record<string, string> = {
  areas: 'un área', area_members: 'quién está en un área', request_categories: 'una categoría', requests: 'una solicitud', request_supports: 'un apoyo',
  request_contacts: 'un contacto', request_events: 'la historia de una solicitud', request_messages: 'un mensaje', request_attachments: 'un archivo',
  attended_publications: '«lo atendido»', request_reply_templates: 'una respuesta guardada',
};
const ACTION: Record<string, string> = { insert: 'agregó', update: 'cambió', delete: 'quitó' };

type Row = {
  id: number; at: Date; action: string; table_name: string; actor: string | null; request_id: string | null; reference: string | null;
  new_data: Record<string, unknown> | null;
};

function what(r: Row): string {
  const d = r.new_data ?? {};
  if (r.action === 'contact_view') return 'vio el contacto de';
  if (r.action === 'export') {
    const rows = Number(d.rows ?? 0);
    return `exportó ${rows === 1 ? '1 solicitud' : `${rows} solicitudes`} en CSV${d.with_contact ? ', con el contacto' : ', sin contactos'}`;
  }
  if (r.table_name === 'requests' && r.action === 'update' && typeof d.state === 'string') {
    return `cambió (${REQUEST_STATE_LABEL[d.state as RequestState] ?? d.state})`;
  }
  return `${ACTION[r.action] ?? r.action} ${TABLE[r.table_name] ?? r.table_name}`;
}

export default async function AttentionAuditPage({ searchParams }: { searchParams: Promise<{ antes?: string }> }) {
  const s = await requireRole('auditor', 'admin');
  const access = deskAccess(s.roles);
  const { antes } = await searchParams;
  const before = antes && /^\d{1,18}$/.test(antes) ? antes : null;
  const uuid = (x: string) => `case when ${x} ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (${x})::uuid end`;
  const rows = await db(s, (sql) =>
    sql.query<Row>(
      `select a.id, a.at, a.action, a.table_name, a.new_data, coalesce(nullif(btrim(p.full_name), ''), p.email) as actor, r.id as request_id, r.reference
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
            {rows.map((r) => (
              <li key={r.id} className="px-4 py-3 text-[15px]">
                <span className="font-semibold">{r.actor ?? 'El sistema o la persona desde la web'}</span> {what(r)}
                {r.action === 'export' ? null : r.reference && r.request_id ? (
                  <>
                    {' '}
                    <Link href={`/admin/atencion/${r.request_id}`} className="font-mono font-semibold text-accent-ink underline-offset-2 hover:underline">{r.reference}</Link>
                  </>
                ) : r.action === 'contact_view' ? (
                  ' una solicitud'
                ) : null}
                <span className="block text-sm text-text-2">{fmtDateTime(r.at)}</span>
              </li>
            ))}
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
