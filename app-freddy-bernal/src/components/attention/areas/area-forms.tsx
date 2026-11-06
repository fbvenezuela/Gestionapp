'use client';

import { useId, useState } from 'react';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { saveArea, saveCategoryDefaults, saveDeskSettings, setAreaMember } from '@/lib/actions/attention-admin';

// Administración's forms for the attention desk (D-93): areas, who is in each, the categories' defaults and the plazos.
// Each one saves as the person; the database's policies (can_manage_catalogs(): Administración with the second factor)
// decide.

export function AreaForm({ area }: { area?: { id: string; name: string; description: string; active: boolean } }) {
  const { run, pending } = useAction();
  const [name, setName] = useState(area?.name ?? '');
  const [description, setDescription] = useState(area?.description ?? '');
  const [active, setActive] = useState(area?.active ?? true);
  const ids = { name: useId(), description: useId(), active: useId() };
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveArea({ id: area?.id, name, description, active }), {
          success: area ? 'Área guardada.' : 'Área creada.',
          onOk: () => {
            if (!area) {
              setName('');
              setDescription('');
            }
          },
        });
      }}
    >
      <Field label="Nombre del área" htmlFor={ids.name}>
        <Input id={ids.name} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} />
      </Field>
      <Field label="Qué atiende" htmlFor={ids.description}>
        <Textarea id={ids.description} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={2} />
      </Field>
      {area ? (
        <label htmlFor={ids.active} className="flex min-h-11 items-center gap-2 text-[15px]">
          <input id={ids.active} type="checkbox" className="h-5 w-5 accent-accent" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Activa (apagada, no recibe casos nuevos; nada se borra)
        </label>
      ) : null}
      <Button type="submit" variant={area ? 'secondary' : 'primary'} className="w-fit" disabled={pending}>{area ? 'Guardar el área' : 'Crear el área'}</Button>
    </form>
  );
}

export function MemberPicker({ areaId, members, candidates }: { areaId: string; members: { id: string; name: string }[]; candidates: { id: string; name: string }[] }) {
  const { run, pending } = useAction();
  const [pick, setPick] = useState('');
  const pickId = useId();
  const free = candidates.filter((c) => !members.some((m) => m.id === c.id));
  return (
    <div className="flex flex-col gap-2">
      {members.length ? (
        <ul className="flex flex-col gap-1">
          {members.map((m) => (
            <li key={m.id} className="flex min-h-11 items-center justify-between gap-2 text-[15px]">
              <span className="min-w-0 truncate">{m.name}</span>
              <Button type="button" variant="ghost" size="sm" className="min-h-11" disabled={pending} onClick={() => run(() => setAreaMember({ areaId, userId: m.id, on: false }), { success: 'Salió del área.' })}>
                Quitar<span className="sr-only"> a {m.name}</span>
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-text-2">Nadie todavía.</p>
      )}
      {free.length ? (
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (pick) run(() => setAreaMember({ areaId, userId: pick, on: true }), { success: 'Quedó en el área.', onOk: () => setPick('') });
          }}
        >
          <Field label="Agregar un responsable" htmlFor={pickId} className="flex-1">
            <Select id={pickId} value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Elige a la persona</option>
              {free.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Button type="submit" variant="secondary" disabled={pending || !pick}>Agregar</Button>
        </form>
      ) : null}
    </div>
  );
}

export function CategoryDefaults({ category, areas }: { category: { id: string; name: string; defaultAreaId: string | null; defaultDueDays: number | null; active: boolean }; areas: { id: string; name: string; active: boolean }[] }) {
  const { run, pending } = useAction();
  const [area, setArea] = useState(category.defaultAreaId ?? '');
  const [days, setDays] = useState(category.defaultDueDays ? String(category.defaultDueDays) : '');
  const [active, setActive] = useState(category.active);
  const ids = { area: useId(), days: useId(), active: useId() };
  return (
    <form
      className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_8rem_auto_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveCategoryDefaults({ id: category.id, defaultAreaId: area || null, defaultDueDays: days ? Number(days) : null, active }), { success: `«${category.name}» guardada.` });
      }}
    >
      <Field label={`${category.name}: área`} htmlFor={ids.area}>
        <Select id={ids.area} value={area} onChange={(e) => setArea(e.target.value)}>
          <option value="">Sin área (la asigna la coordinación)</option>
          {areas.filter((a) => a.active || a.id === category.defaultAreaId).map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </Select>
      </Field>
      <Field label="Días" htmlFor={ids.days}>
        <Input id={ids.days} type="number" inputMode="numeric" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} />
      </Field>
      <label htmlFor={ids.active} className="flex min-h-11 items-center gap-2 text-[15px]">
        <input id={ids.active} type="checkbox" className="h-5 w-5 accent-accent" checked={active} onChange={(e) => setActive(e.target.checked)} />
        En el formulario
      </label>
      <Button type="submit" variant="secondary" disabled={pending}>Guardar</Button>
    </form>
  );
}

const PRIORITY_DAYS = [
  { key: 'urgente', label: 'Urgente' },
  { key: 'alta', label: 'Alta' },
  { key: 'normal', label: 'Normal' },
  { key: 'baja', label: 'Baja' },
] as const;

export function DeskSettingsForm({ byPriority, staleDays }: { byPriority: Partial<Record<'urgente' | 'alta' | 'normal' | 'baja', number>>; staleDays: number }) {
  const { run, pending } = useAction();
  const [v, setV] = useState<Record<string, string>>(Object.fromEntries(PRIORITY_DAYS.map((p) => [p.key, byPriority[p.key] ? String(byPriority[p.key]) : ''])));
  const [stale, setStale] = useState(String(staleDays));
  const staleId = useId();
  const base = useId();
  const num = (s: string) => (s.trim() ? Number(s) : null);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveDeskSettings({ urgente: num(v.urgente), alta: num(v.alta), normal: num(v.normal), baja: num(v.baja), staleDays: Number(stale) }), { success: 'Plazos guardados.' });
      }}
    >
      <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <legend className="mb-1 text-sm font-semibold">Días para la fecha comprometida, por prioridad (gana el más corto entre este y el de la categoría; vacío: el de la categoría)</legend>
        {PRIORITY_DAYS.map((p) => (
          <Field key={p.key} label={p.label} htmlFor={`${base}-${p.key}`}>
            <Input id={`${base}-${p.key}`} type="number" inputMode="numeric" min={1} max={365} value={v[p.key]} onChange={(e) => setV({ ...v, [p.key]: e.target.value })} />
          </Field>
        ))}
      </fieldset>
      <Field label="Avisar de un caso sin movimiento después de (días)" htmlFor={staleId} hint="A la coordinación y a su responsable, una vez al día como máximo. Un caso vencido avisa siempre.">
        <Input id={staleId} type="number" inputMode="numeric" min={1} max={60} value={stale} onChange={(e) => setStale(e.target.value)} required className="sm:w-40" />
      </Field>
      <Button type="submit" className="w-fit" disabled={pending}>Guardar los plazos</Button>
    </form>
  );
}
