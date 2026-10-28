import { requireRole, db } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page';
import { Card } from '@/components/ui/card';
import { fmtDateTime } from '@/lib/time';
import { RETIRED_ROLES, ROLE_LABEL } from '@/lib/roles';

export const metadata = { title: 'Registro de cambios' };

const TABLE: Record<string, string> = {
  two_factor: 'Doble factor',
  events: 'Evento', event_schedule: 'Fecha y lugar', event_brief: 'Ficha técnica', event_assignments: 'Asignación',
  storyboards: 'Storyboard', storyboard_blocks: 'Bloque de storyboard', media_assets: 'Material', pieces: 'Pieza',
  piece_versions: 'Versión de pieza', copies: 'Copy', reviews: 'Revisión', review_comments: 'Comentario',
  voice_line_requests: 'Frase del jefe', tweets: 'Tweet', tweet_batches: 'Tanda de tweets', publications: 'Publicación',
  publication_metrics: 'Resultados', profiles: 'Persona', user_roles: 'Rol', invitations: 'Invitación',
  app_settings: 'Ajuste', categories: 'Categoría', copy_formulas: 'Fórmula', network_specs: 'Reglas de red',
  obra_fichas: 'Ficha de obra', obra_ficha_private: 'Contactos de obra', community_reports: 'Ficha comunitaria',
  community_report_private: 'Contactos del reporte', ficha_updates: 'Historia de ficha',
  recording_notes: 'Nota de grabación',
};
const ACTION: Record<string, string> = { insert: 'creó', update: 'cambió', delete: 'quitó', soft_delete: 'borró', mfa_reset: 'reinició' };
// One summary row of 20261027001600_six_roles.sql: the retired roles keep their names here (history).
const RETIRED = `retiró los roles ${RETIRED_ROLES.map((r) => ROLE_LABEL[r]).join(' y ')}: quedan los seis del equipo y la historia se guarda`;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ antes?: string }> }) {
  const s = await requireRole('admin');
  const { antes } = await searchParams;
  const rows = await db(s, (sql) =>
    sql.query<{ id: number; at: string; actor: string | null; table_name: string; action: string; row_id: string | null; changed: string[] | null }>(
      `select a.id, a.at, coalesce(p.full_name, p.email) as actor, a.table_name, a.action, a.row_id,
              (select array_agg(k) from jsonb_object_keys(coalesce(a.new_data, '{}'::jsonb)) k
                where a.action = 'update' and (a.new_data -> k) is distinct from (a.old_data -> k) and k not in ('updated_at')) as changed
         from public.audit_log a left join public.profiles p on p.id = a.actor_id
        where ($1::bigint is null or a.id < $1) order by a.id desc limit 100`,
      [antes ?? null],
    ),
  );
  return (
    <>
      <PageHeader title="Registro de cambios" subtitle="Quién cambió qué y cuándo. No se puede editar ni borrar." back={{ href: '/ajustes', label: 'Ajustes' }} />
      <Card solid>
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="px-4 py-3 text-[15px]">
              <span className="font-semibold">{r.actor ?? 'El sistema'}</span>{' '}
              {r.action === 'roles_retired' ? RETIRED : (
                <>
                  {ACTION[r.action] ?? r.action} <span className="font-semibold">{TABLE[r.table_name] ?? r.table_name}</span>
                </>
              )}
              {r.changed?.length ? <span className="text-text-2"> ({r.changed.join(', ')})</span> : null}
              <span className="block text-sm text-text-2">{fmtDateTime(r.at)}</span>
            </li>
          ))}
        </ul>
        {rows.length === 100 ? (
          <a href={`?antes=${rows[rows.length - 1].id}`} className="block border-t border-border p-4 text-center font-semibold text-accent-ink">Ver más antiguos</a>
        ) : null}
      </Card>
    </>
  );
}
