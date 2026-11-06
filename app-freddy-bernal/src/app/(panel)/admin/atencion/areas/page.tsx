import { requireRole, db } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { DeskNav } from '@/components/attention/desk-nav';
import { AreaForm, CategoryDefaults, DeskSettingsForm, MemberPicker } from '@/components/attention/areas/area-forms';
import { staleDaysSetting } from '@/lib/data/attention-alerts';
import { REQUEST_PRIORITY_LABEL, deskAccess, type RequestPriority } from '@/lib/domain/attention';

export const metadata = { title: 'Áreas y plazos' };

type Priorities = Partial<Record<RequestPriority, number>>;

// The areas of the attention desk, who is in each, the area and the days of each category, the days by priority and
// when a quiet case is told about (design §3, §5; D-93: Administración keeps them; the coordination, auditoría and the
// boss read them). Everything read as the person: the policies of areas, area_members and request_categories, and
// app_settings for the plazos.
export default async function AttentionAreasPage() {
  const s = await requireRole('admin', 'attention_coordinator', 'auditor', 'boss');
  const access = deskAccess(s.roles);
  const edit = access.catalogs;
  const data = await db(s, async (sql) => {
    const areas = await sql.query<{ id: string; name: string; description: string; active: boolean }>(`select id, name, description, active from public.areas order by active desc, name`);
    const members = await sql.query<{ area_id: string; id: string; name: string }>(
      `select m.area_id, p.id, coalesce(nullif(btrim(p.full_name), ''), p.email) as name
         from public.area_members m join public.profiles p on p.id = m.user_id where p.active and p.deleted_at is null order by 3`,
    );
    // Administración reads who has «Responsable de área» (user_roles); nobody else needs it here.
    const candidates = edit
      ? await sql.query<{ id: string; name: string }>(
          `select p.id, coalesce(nullif(btrim(p.full_name), ''), p.email) as name from public.profiles p
            where p.active and p.deleted_at is null and exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role = 'reports_operator')
            order by 2`,
        )
      : [];
    const categories = await sql.query<{ id: string; name: string; default_area_id: string | null; default_due_days: number | null; active: boolean }>(
      `select id, name, default_area_id, default_due_days, active from public.request_categories order by sort, name`,
    );
    const byPriority = ((await sql.one<{ value: Priorities }>(`select value from public.app_settings where key = 'participation.due_days_by_priority'`))?.value ?? {}) as Priorities;
    const staleDays = await staleDaysSetting(sql);
    return { areas, members, candidates, categories, byPriority, staleDays };
  });
  const areaName = new Map(data.areas.map((a) => [a.id, a.name]));
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Áreas y plazos"
        subtitle={edit ? 'Las áreas que atienden lo que llega, quién está en cada una y los plazos.' : 'Las áreas, quién está en cada una y los plazos. Los cambia administración.'}
        back={access.readsCases ? { href: '/admin/atencion', label: 'Bandeja' } : { href: '/admin/atencion', label: 'Atención' }}
      />
      <DeskNav access={access} current="areas" />
      <div className="grid gap-5 lg:grid-cols-2">
        {data.areas.map((a) => {
          const members = data.members.filter((m) => m.area_id === a.id);
          return (
            <Card key={a.id}>
              <CardHeader title={a.name} subtitle={a.active ? a.description || undefined : 'Apagada: no recibe casos nuevos.'} action={a.active ? undefined : <Chip>Apagada</Chip>} />
              <CardBody className="flex flex-col gap-4">
                <section aria-label={`Responsables de ${a.name}`} className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold">Responsables</h3>
                  {edit ? (
                    <MemberPicker areaId={a.id} members={members.map((m) => ({ id: m.id, name: m.name }))} candidates={data.candidates} />
                  ) : members.length ? (
                    <ul className="flex flex-col gap-1 text-[15px]">
                      {members.map((m) => <li key={m.id}>{m.name}</li>)}
                    </ul>
                  ) : (
                    <p className="text-sm text-text-2">Nadie todavía.</p>
                  )}
                </section>
                {edit ? (
                  <details>
                    <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-accent-ink">Cambiar el nombre o apagarla</summary>
                    <div className="mt-2">
                      <AreaForm area={a} />
                    </div>
                  </details>
                ) : null}
              </CardBody>
            </Card>
          );
        })}
        {edit ? (
          <Card>
            <CardHeader title="Nueva área" />
            <CardBody>
              <AreaForm />
            </CardBody>
          </Card>
        ) : null}
      </div>

      <Card className="mt-5" solid>
        <CardHeader title="Categorías" subtitle="A qué área va cada solicitud nueva y cuántos días se compromete el equipo." />
        <CardBody className="flex flex-col gap-4">
          {edit
            ? data.categories.map((c) => (
                <CategoryDefaults
                  key={c.id}
                  category={{ id: c.id, name: c.name, defaultAreaId: c.default_area_id, defaultDueDays: c.default_due_days, active: c.active }}
                  areas={data.areas}
                />
              ))
            : (
              <ul className="divide-y divide-border">
                {data.categories.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[15px]">
                    <span className="font-semibold">{c.name}{c.active ? '' : ' (fuera del formulario)'}</span>
                    <span className="text-text-2">{c.default_area_id ? (areaName.get(c.default_area_id) ?? '—') : 'Sin área'} · {c.default_due_days ? `${c.default_due_days} días` : 'sin días'}</span>
                  </li>
                ))}
              </ul>
            )}
        </CardBody>
      </Card>

      <Card className="mt-5">
        <CardHeader title="Plazos y avisos" />
        <CardBody>
          {edit ? (
            <DeskSettingsForm byPriority={data.byPriority} staleDays={data.staleDays} />
          ) : (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[15px]">
              {(['urgente', 'alta', 'normal', 'baja'] as const).map((p) => (
                <div key={p} className="contents">
                  <dt className="font-semibold">{REQUEST_PRIORITY_LABEL[p]}</dt>
                  <dd>{data.byPriority[p] ? `${data.byPriority[p]} días` : 'los de la categoría'}</dd>
                </div>
              ))}
              <dt className="font-semibold">Sin movimiento</dt>
              <dd>aviso después de {data.staleDays} días</dd>
            </dl>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
