import Link from 'next/link';
import { Filter } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, Input } from '@/components/ui/field';
import { PRIORITIES, PRIORITY, REPORT_STATUSES, REPORT_STATUS, REPORT_TYPES, REPORT_TYPE } from '@/lib/data/ficha-labels';

// «Filtros por municipio, parroquia, tipo, estado y prioridad» (§4.2). A plain form (GET): it works without
// JavaScript, the address can be shared, and «Atrás» brings the previous filter back.
export type FilterValues = { municipio?: string; parroquia?: string; tipo?: string; estado?: string; prioridad?: string; vencidas?: string };

export function FilterBar({
  action,
  values,
  municipalities,
  parishes,
}: {
  action: string;
  values: FilterValues;
  municipalities?: string[];
  parishes: { strict: boolean; options: string[] };
}) {
  const active = Object.values(values).some(Boolean);
  const label = 'flex min-w-0 flex-col gap-1 text-sm font-semibold';
  return (
    <Card className="mb-5 p-4">
      <form action={action} method="get" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {municipalities ? (
          <label className={label}>
            Municipio
            <Select name="municipio" defaultValue={values.municipio ?? ''}>
              <option value="">Todos</option>
              {municipalities.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </Select>
          </label>
        ) : null}
        <label className={label}>
          Parroquia
          {parishes.strict ? (
            <Select name="parroquia" defaultValue={values.parroquia ?? ''}>
              <option value="">Todas</option>
              {parishes.options.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </Select>
          ) : (
            <>
              <Input name="parroquia" list="filtro-parroquias" defaultValue={values.parroquia ?? ''} placeholder="Todas" autoComplete="off" />
              <datalist id="filtro-parroquias">
                {parishes.options.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </>
          )}
        </label>
        <label className={label}>
          Tipo
          <Select name="tipo" defaultValue={values.tipo ?? ''}>
            <option value="">Todos</option>
            {REPORT_TYPES.map((t) => (
              <option key={t} value={t}>{REPORT_TYPE[t]}</option>
            ))}
          </Select>
        </label>
        <label className={label}>
          Estado
          <Select name="estado" defaultValue={values.estado ?? ''}>
            <option value="">Todos</option>
            {REPORT_STATUSES.map((s) => (
              <option key={s} value={s}>{REPORT_STATUS[s].label}</option>
            ))}
          </Select>
        </label>
        <label className={label}>
          Prioridad
          <Select name="prioridad" defaultValue={values.prioridad ?? ''}>
            <option value="">Todas</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{PRIORITY[p].label}</option>
            ))}
          </Select>
        </label>
        <label className="flex min-h-11 items-center gap-3 self-end text-[15px] font-semibold">
          <input type="checkbox" name="vencidas" value="1" defaultChecked={values.vencidas === '1'} className="h-5 w-5 accent-accent" />
          Solo las vencidas
        </label>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-3">
          <Button type="submit">
            <Filter className="h-4 w-4" aria-hidden /> Filtrar
          </Button>
          {active ? (
            <Link href={action} className="inline-flex min-h-11 items-center px-3 text-[15px] font-semibold text-accent-ink">
              Quitar los filtros
            </Link>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
