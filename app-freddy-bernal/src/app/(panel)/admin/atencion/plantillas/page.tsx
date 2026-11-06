import { requireRole, db } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { DeskNav } from '@/components/attention/desk-nav';
import { TemplateForm } from '@/components/attention/template-form';
import { replyTemplates } from '@/lib/data/attention';
import { deskAccess } from '@/lib/domain/attention';

export const metadata = { title: 'Respuestas guardadas' };

// The saved replies of the attention desk (design §5): what the team writes to the person most often, chosen in the case
// page and adjusted before sending. The coordinator writes them; the responsibles and the denuncias desk use them (RLS:
// can_answer_requests() to read, the coordinator to write).
export default async function AttentionTemplatesPage() {
  const s = await requireRole('attention_coordinator', 'reports_operator', 'complaints_operator');
  const access = deskAccess(s.roles);
  const templates = await db(s, (sql) => replyTemplates(sql, { all: access.coordinator }));
  const groups = [
    { kind: 'public_reply' as const, title: 'Para responder' },
    { kind: 'info_request' as const, title: 'Para pedir información' },
  ];
  return (
    <div className="flex flex-col">
      <PageHeader title="Respuestas guardadas" subtitle="Lo que más se le escribe a la persona. En cada caso se elige y se ajusta antes de enviar." />
      <DeskNav access={access} current="respuestas" />
      <div className="flex flex-col gap-5">
        {groups.map((g) => {
          const list = templates.filter((t) => t.kind === g.kind);
          return (
            <Card key={g.kind} solid>
              <CardHeader title={g.title} subtitle={list.length === 1 ? '1 respuesta' : `${list.length} respuestas`} />
              {list.length ? (
                <ul className="divide-y divide-border">
                  {list.map((t) => (
                    <li key={t.id} className="flex flex-col gap-2 px-4 py-3">
                      <p className="flex flex-wrap items-center gap-2 font-semibold">
                        {t.title} {t.active ? null : <Chip>Apagada</Chip>}
                      </p>
                      <p className="whitespace-pre-line text-[15px] text-text-2 [overflow-wrap:anywhere]">{t.body}</p>
                      {access.coordinator ? (
                        <details>
                          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-accent-ink">Cambiar</summary>
                          <div className="mt-2">
                            <TemplateForm template={t} />
                          </div>
                        </details>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="p-4 text-[15px] text-text-2">Ninguna todavía.</p>
              )}
            </Card>
          );
        })}
        {access.coordinator ? (
          <Card>
            <CardHeader title="Nueva respuesta guardada" />
            <CardBody>
              <TemplateForm />
            </CardBody>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
