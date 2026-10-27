'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send } from 'lucide-react';
import { saveObraFicha } from '@/lib/actions/obras';
import { saveReport } from '@/lib/actions/reports';
import { useAction } from '@/lib/hooks/use-action';
import { useDraft } from '@/lib/hooks/use-draft';
import { Button, LinkButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FichaField } from './ficha-field';
import { FichaGroup } from './ficha-group';
import type { Mark } from '@/lib/data/ficha-labels';
import { FIELDS, GROUPS, groupProgress, missingFields, missingMessage, type FichaKind, type FormValues, type Marks } from '@/lib/domain/ficha-fields';
import { parishOptions, type ParishMap } from '@/lib/domain/territory';

// The form of a ficha (obra or community report), group by group. What is typed is kept in the phone (useDraft)
// until it is saved, so a cut of signal loses nothing; the contacts (third-party names and phones) are NOT kept
// there. Obra: «Guardar y avisar al jefe» (every field answered; the boss and despacho get «Por ponerle fecha») or
// «Guardar borrador» (no notice). Report: «¿Va a la agenda del jefe?» decides whether that notice goes.
type Props = {
  kind: FichaKind;
  id?: string;
  rev?: number;
  stage?: string; // obra
  wantsAgenda?: boolean | null; // report: null = new (on by default for type «Evento»)
  initial: FormValues;
  initialMarks: Marks;
  municipalities: string[];
  parishMap: ParishMap;
  parishesUsed: Record<string, string[]>;
  canPrivate: boolean;
  cancelHref: string;
};

type Draft = { values: FormValues; marks: Marks; wantsAgenda: boolean | null };

export function FichaForm(p: Props) {
  const router = useRouter();
  const { run, pending } = useAction();
  const defs = useMemo(() => FIELDS[p.kind].filter((d) => p.canPrivate || !d.private), [p.kind, p.canPrivate]);
  const pick = (v: FormValues, priv: boolean) => Object.fromEntries(defs.filter((d) => !!d.private === priv).map((d) => [d.key, v[d.key] ?? '']));
  const draftKey = `ficha:${p.kind}:${p.id ?? 'nueva'}`;
  const { value: draft, setValue: setDraft, restored, clear } = useDraft<Draft>(draftKey, {
    values: pick(p.initial, false),
    marks: p.initialMarks,
    wantsAgenda: p.wantsAgenda ?? null,
  });
  const [priv, setPriv] = useState<FormValues>(() => pick(p.initial, true));
  const values: FormValues = { ...draft.values, ...priv };
  const marks = draft.marks;

  const setValue = (key: string, v: string, isPrivate: boolean) => {
    if (isPrivate) setPriv((x) => ({ ...x, [key]: v }));
    else setDraft((d) => ({ ...d, values: { ...d.values, [key]: v } }));
  };
  const setMark = (key: string, m: Mark | undefined) =>
    setDraft((d) => {
      const next = { ...d.marks };
      if (m) next[key] = m;
      else delete next[key];
      return { ...d, marks: next };
    });

  const missing = missingFields(defs, values, marks);
  const isNew = !p.id;
  const obraDraft = p.kind === 'obra' && (isNew || p.stage === 'draft');
  // Report: «¿Va a la agenda?» on by default for a new «Evento», until someone touches it.
  const wants = p.kind === 'report' ? (draft.wantsAgenda ?? (isNew ? values.type === 'event' : false)) : false;
  const notifies = p.kind === 'report' ? wants && (isNew || !p.wantsAgenda) : obraDraft;

  const save = (submit: boolean) => {
    const payload = { id: p.id, rev: p.rev, values, marks };
    run(() => (p.kind === 'obra' ? saveObraFicha({ ...payload, submit }) : saveReport({ ...payload, wantsAgenda: wants })), {
      onOk: (r) => {
        clear();
        const id = (r as { data?: { id?: string } }).data?.id ?? p.id;
        router.push(p.kind === 'obra' ? `/obras/${id}` : `/reportes/${id}`);
      },
      refresh: false,
    });
  };

  const parishesFor = (municipality: string) => parishOptions(p.parishMap, municipality, p.parishesUsed[municipality] ?? []);

  return (
    <form
      className="flex flex-col gap-4"
      // Only the buttons save: an Enter in a box never sends «Guardar y avisar» by accident.
      onSubmit={(e) => e.preventDefault()}
      noValidate
    >
      {restored ? (
        <p className="rounded-[var(--radius-control)] bg-info-soft px-3 py-2 text-sm text-info" role="status">
          Recuperamos lo que estabas escribiendo en este teléfono.
        </p>
      ) : null}
      {!p.canPrivate ? (
        <p className="rounded-[var(--radius-control)] bg-warn-soft px-3 py-2 text-sm text-warn" role="status">
          Los contactos (nombres y teléfonos) piden el doble factor: entra con tu código para verlos y llenarlos.
        </p>
      ) : null}
      {GROUPS[p.kind].map((g, gi) => {
        const prog = groupProgress(defs, g.key, values, marks);
        const fields = defs.filter((d) => d.group === g.key);
        if (!fields.length) return null;
        return (
          <FichaGroup key={g.key} title={g.title} done={prog.done} total={prog.total} open={gi < 2 || isNew}>
            <div className="grid gap-4 sm:grid-cols-2">
              {fields.map((d) => (
                <div key={d.key} className={d.type === 'long' || d.type === 'title' ? 'sm:col-span-2' : undefined}>
                  <FichaField
                    def={d}
                    idPrefix={p.kind}
                    value={values[d.key] ?? ''}
                    mark={marks[d.key]}
                    onChange={(v) => setValue(d.key, v, !!d.private)}
                    onMark={(m) => setMark(d.key, m)}
                    municipalities={p.municipalities}
                    parishes={d.type === 'parish' ? parishesFor(values.municipality ?? '') : undefined}
                  />
                </div>
              ))}
            </div>
          </FichaGroup>
        );
      })}

      {p.kind === 'obra' ? (
        <Card className="p-4">
          <p className="text-[15px] text-text-2">
            Fotos del antes y del avance: se suben desde la ficha guardada en la próxima entrega. La fecha de la visita la ponen el jefe o el
            despacho.
          </p>
        </Card>
      ) : (
        <Card className="p-4">
          <label className="flex min-h-11 items-center gap-3 text-[15px] font-semibold">
            <input
              type="checkbox"
              role="switch"
              checked={wants}
              onChange={(e) => setDraft((d) => ({ ...d, wantsAgenda: e.target.checked }))}
              className="h-5 w-5 accent-accent"
            />
            ¿Va a la agenda del jefe?
          </label>
          <p className="mt-1 text-sm text-text-2">
            Si va, al jefe y al despacho les llega «Por ponerle fecha» y el jefe le pone fecha y hora. Si es un avance o una incidencia, queda en el registro sin ir a la agenda.
          </p>
        </Card>
      )}

      <Card className="flex flex-col gap-2 p-4">
        {p.kind === 'obra' && obraDraft ? (
          <p className="text-sm text-text-2" aria-live="polite">
            {missing.length ? missingMessage(missing) : 'Todo respondido: lista para avisar al jefe.'}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {p.kind === 'obra' && obraDraft ? (
            <>
              <Button type="button" disabled={pending} onClick={() => save(true)}>
                <Send className="h-4 w-4" aria-hidden /> Guardar y avisar al jefe
              </Button>
              <Button type="button" variant="secondary" disabled={pending} onClick={() => save(false)}>
                Guardar borrador
              </Button>
            </>
          ) : (
            <Button type="button" disabled={pending} onClick={() => save(false)}>
              {notifies ? (
                <>
                  <Send className="h-4 w-4" aria-hidden /> Guardar y avisar al jefe
                </>
              ) : (
                'Guardar'
              )}
            </Button>
          )}
          <LinkButton variant="ghost" href={p.cancelHref}>
            Cancelar
          </LinkButton>
        </div>
      </Card>
    </form>
  );
}
