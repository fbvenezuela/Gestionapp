import { requireRole, db } from '@/lib/auth/session';
import { PageHeader, EmptyState } from '@/components/ui/page';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { fmtDateTime } from '@/lib/time';

export const metadata = { title: 'Buzón de correos' };

export default async function OutboxPage() {
  const s = await requireRole('admin');
  const rows = await db(s, (sql) =>
    sql.query<{ id: string; to_email: string; subject: string; text_body: string; status: string; created_at: string; error: string | null }>(
      `select id, to_email, subject, text_body, status, created_at, error from public.outbox order by created_at desc limit 100`,
    ),
  );
  return (
    <>
      <PageHeader
        title="Buzón de correos"
        subtitle="Todo correo pasa por aquí. Mientras el envío real está apagado, se quedan guardados y nadie los recibe."
        back={{ href: '/ajustes', label: 'Ajustes' }}
      />
      {rows.length === 0 ? (
        <EmptyState title="Todavía no se ha generado ningún correo." />
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((r) => (
            <Card key={r.id} solid>
              <details>
                <summary className="flex cursor-pointer list-none flex-col gap-1 p-4 sm:flex-row sm:items-center">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{r.subject}</span>
                    <span className="block truncate text-sm text-text-2">Para {r.to_email} · {fmtDateTime(r.created_at)}</span>
                  </span>
                  <Chip tone={r.status === 'sent' ? 'ok' : r.status === 'failed' ? 'danger' : 'neutral'}>
                    {r.status === 'sent' ? 'Enviado' : r.status === 'failed' ? 'Falló' : 'Guardado (no enviado)'}
                  </Chip>
                </summary>
                <pre className="whitespace-pre-wrap border-t border-border p-4 font-sans text-sm text-text-2">{r.text_body}</pre>
                {r.error ? <p className="px-4 pb-4 text-sm text-danger">{r.error}</p> : null}
              </details>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
