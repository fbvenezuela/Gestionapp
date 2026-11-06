import Link from 'next/link';
import { Search } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import {
  REQUEST_PRIORITIES,
  REQUEST_PRIORITY_LABEL,
  REQUEST_STATES,
  REQUEST_STATE_LABEL,
  REQUEST_TYPES,
  REQUEST_TYPE_LABEL,
  hasFilters,
  type InboxFilters,
} from '@/lib/domain/attention';
import type { DeskCatalogs, Option } from '@/lib/data/attention';

const label = 'flex min-w-0 flex-col gap-1 text-sm font-semibold';

// The inbox's filters (design §5): a plain form that goes in the address (GET), so a filtered list can be shared,
// reloaded and used without JavaScript. The search and the state on top; the rest under «Más filtros» (open when one of
// them is on). Only what this person's RLS lets them read is ever listed.
export function InboxFilters({ f, catalogs, assignees, types }: { f: InboxFilters; catalogs: DeskCatalogs; assignees: Option[]; types: readonly (typeof REQUEST_TYPES)[number][] }) {
  const more = !!(f.type || f.categoryId || f.municipalityId || f.parishId || f.sector || f.priority || f.area || f.assignee || f.from || f.to || f.overdue || f.all);
  const parishes = catalogs.municipalities.filter((m) => m.parishes.length);
  return (
    <Card className="mb-4 p-4">
      <form method="get" action="/admin/atencion" className="flex flex-col gap-3" role="search" aria-label="Buscar y filtrar solicitudes">
        {f.view === 'tablero' ? <input type="hidden" name="vista" value="tablero" /> : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_14rem_auto] sm:items-end">
          <label className={label}>
            Buscar por código o título
            <span className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <Input name="q" type="search" defaultValue={f.q} placeholder="AC-2026-K7QM2H" className="pl-9" autoComplete="off" />
            </span>
          </label>
          <label className={label}>
            Estado
            <Select name="estado" defaultValue={f.state ?? ''}>
              <option value="">Todos</option>
              {REQUEST_STATES.map((s) => (
                <option key={s} value={s}>{REQUEST_STATE_LABEL[s]}</option>
              ))}
            </Select>
          </label>
          <Button type="submit" variant="secondary">Filtrar</Button>
        </div>
        <details open={more} className="group">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 text-[15px] font-semibold text-accent-ink [&::-webkit-details-marker]:hidden">
            Más filtros
          </summary>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className={label}>
              Tipo
              <Select name="tipo" defaultValue={f.type ?? ''}>
                <option value="">Todos</option>
                {types.map((t) => (
                  <option key={t} value={t}>{REQUEST_TYPE_LABEL[t]}</option>
                ))}
              </Select>
            </label>
            <label className={label}>
              Categoría
              <Select name="categoria" defaultValue={f.categoryId ?? ''}>
                <option value="">Todas</option>
                {catalogs.categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </label>
            <label className={label}>
              Municipio
              <Select name="municipio" defaultValue={f.municipalityId ?? ''}>
                <option value="">Todos</option>
                {catalogs.municipalities.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </Select>
            </label>
            {parishes.length ? (
              <label className={label}>
                Parroquia
                <Select name="parroquia" defaultValue={f.parishId ?? ''}>
                  <option value="">Todas</option>
                  {parishes.map((m) => (
                    <optgroup key={m.id} label={m.name}>
                      {m.parishes.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </label>
            ) : null}
            <label className={label}>
              Parroquia, localidad o sector
              <Input name="sector" defaultValue={f.sector} autoComplete="off" />
            </label>
            <label className={label}>
              Prioridad
              <Select name="prioridad" defaultValue={f.priority ?? ''}>
                <option value="">Todas</option>
                {REQUEST_PRIORITIES.map((p) => (
                  <option key={p} value={p}>{REQUEST_PRIORITY_LABEL[p]}</option>
                ))}
              </Select>
            </label>
            <label className={label}>
              Área
              <Select name="area" defaultValue={f.area === 'none' ? 'ninguna' : (f.area ?? '')}>
                <option value="">Todas</option>
                <option value="ninguna">Sin área</option>
                {catalogs.areas.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}{a.active ? '' : ' (apagada)'}</option>
                ))}
              </Select>
            </label>
            <label className={label}>
              Responsable
              <Select name="responsable" defaultValue={f.assignee === 'me' ? 'yo' : f.assignee === 'none' ? 'nadie' : (f.assignee ?? '')}>
                <option value="">Cualquiera</option>
                <option value="yo">Las mías</option>
                <option value="nadie">Sin responsable</option>
                {assignees.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </label>
            <label className={label}>
              Llegó desde
              <Input name="desde" type="date" defaultValue={f.from ?? ''} />
            </label>
            <label className={label}>
              Llegó hasta
              <Input name="hasta" type="date" defaultValue={f.to ?? ''} />
            </label>
            <label className="flex min-h-11 items-center gap-2 text-[15px]">
              <input type="checkbox" name="vencidas" value="1" defaultChecked={f.overdue} className="h-5 w-5 accent-accent" />
              Solo las vencidas
            </label>
            <label className="flex min-h-11 items-center gap-2 text-[15px]">
              <input type="checkbox" name="ver" value="todo" defaultChecked={f.all} className="h-5 w-5 accent-accent" />
              Incluir las unidas a otro caso y el spam
            </label>
          </div>
        </details>
        {hasFilters(f) ? (
          <Link href={f.view === 'tablero' ? '/admin/atencion?vista=tablero' : '/admin/atencion'} className="inline-flex min-h-11 w-fit items-center text-[15px] font-semibold text-accent-ink">
            Quitar los filtros
          </Link>
        ) : null}
      </form>
    </Card>
  );
}
