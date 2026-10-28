'use client';

import { useMemo, useState, type ReactNode } from 'react';
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
import { FIELDS, GROUPS, fieldLabel, groupProgress, missingFields, missingMessage, type FichaKind, type FormValues, type Marks } from '@/lib/domain/ficha-fields';
import { EMPTY_DRAFT, draftConflicts, draftValues, editMark, editValue, editWantsAgenda, restoreDraft, revToSend, type DraftBase, type FichaDraft } from '@/lib/domain/ficha-draft';
import { parishOptions, type ParishMap } from '@/lib/domain/territory';

// The form of a ficha (obra or community report), group by group. What is typed is kept in the phone (useDraft)
// until it is saved, so a cut of signal loses nothing: only the fields this person changed, compared with the
// server's values when the form opens again (src/lib/domain/ficha-draft.ts). The contacts (third-party names and
// phones) are NOT kept there; only which of them this person changed is sent, so a contact someone else saved in
// the meantime is not wiped. Obra: «Guardar y avisar al jefe» (every field answered; the boss and despacho get «Por
// ponerle fecha») or «Guardar borrador» (no notice). Report: «¿Va a la agenda del jefe?» decides whether that
// notice goes.
type Props = {
  kind: FichaKind;
  id?: string;
  rev?: number;
  privRev?: number | null; // the contacts' version (null: none saved yet)
  stage?: string; // obra
  wantsAgenda?: boolean | null; // report: null = new (on by default for type «Evento»)
  initial: FormValues;
  initialMarks: Marks;
  municipalities: string[];
  parishMap: ParishMap;
  parishesUsed: Record<string, string[]>;
  canPrivate: boolean;
  cancelHref: string;
  // The saved ficha's photos and papers (photo-gallery.tsx), shown while editing it; a new ficha has none yet.
  photos?: ReactNode;
};

export function FichaForm(p: Props) {
  const router = useRouter();
  const { run, pending } = useAction();
  const defs = useMemo(() => FIELDS[p.kind].filter((d) => p.canPrivate || !d.private), [p.kind, p.canPrivate]);
  const pick = (v: FormValues, priv: boolean) => Object.fromEntries(defs.filter((d) => !!d.private === priv).map((d) => [d.key, v[d.key] ?? '']));
  const isNew = !p.id;
  const privateKeys = new Set(defs.filter((d) => d.private).map((d) => d.key));
  const pickMarks = (m: Marks, priv: boolean) => Object.fromEntries(Object.entries(m).filter(([k]) => privateKeys.has(k) === priv)) as Marks;
  // What the server says now (the main part only: the contacts never go to the phone).
  const base: DraftBase = { values: pick(p.initial, false), marks: pickMarks(p.initialMarks, false), wantsAgenda: p.wantsAgenda ?? null, rev: p.rev ?? null };
  const draftKey = `ficha:${p.kind}:${p.id ?? 'nueva'}`;
  const { value: draft, setValue: setDraft, restored, clear } = useDraft<FichaDraft>(draftKey, EMPTY_DRAFT, {
    restore: (saved) => restoreDraft(saved, base, isNew),
  });
  const shown = draftValues(draft, base);
  const [priv, setPriv] = useState<FormValues>(() => pick(p.initial, true));
  const [privMarks, setPrivMarks] = useState<Marks>(() => pickMarks(p.initialMarks, true));
  const values: FormValues = { ...shown.values, ...priv };
  const marks: Marks = { ...shown.marks, ...privMarks };
  const conflicts = isNew ? [] : draftConflicts(draft, base);

  const setValue = (key: string, v: string, isPrivate: boolean) => {
    if (isPrivate) setPriv((x) => ({ ...x, [key]: v }));
    else setDraft((d) => editValue(d, base, key, v));
  };
  const setMark = (key: string, m: Mark | undefined, isPrivate: boolean) => {
    if (isPrivate) {
      setPrivMarks((x) => {
        const next = { ...x };
        if (m) next[key] = m;
        else delete next[key];
        return next;
      });
    } else setDraft((d) => editMark(d, base, key, m));
  };

  const missing = missingFields(defs, values, marks);
  const obraDraft = p.kind === 'obra' && (isNew || p.stage === 'draft');
  // Report: «¿Va a la agenda?» on by default for a new «Evento», until someone touches it.
  const wants = p.kind === 'report' ? (shown.wantsAgenda ?? (isNew ? values.type === 'event' : false)) : false;
  const notifies = p.kind === 'report' ? wants && (isNew || !p.wantsAgenda) : obraDraft;

  // The contacts this person changed (only those are written when someone else saved contacts in the meantime).
  const initialPriv = pick(p.initial, true);
  const initialPrivMarks = pickMarks(p.initialMarks, true);
  const privChanged = [...privateKeys].filter((k) => (priv[k] ?? '') !== (initialPriv[k] ?? '') || privMarks[k] !== initialPrivMarks[k]);

  const save = (submit: boolean) => {
    const payload = {
      id: p.id,
      rev: revToSend(draft, base),
      ...(p.canPrivate && p.id ? { privRev: p.privRev ?? 0, privChanged } : {}),
      values,
      marks,
    };
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
      {conflicts.length ? (
        <p className="rounded-[var(--radius-control)] bg-warn-soft px-3 py-2 text-sm text-warn" role="status">
          Ojo: alguien cambió {conflicts.map((k) => `«${fieldLabel(p.kind, k)}»`).join(', ')} después de que empezaste. Si guardas, queda lo tuyo y lo
          anterior queda en la historia.
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
                    onMark={(m) => setMark(d.key, m, !!d.private)}
                    municipalities={p.municipalities}
                    parishes={d.type === 'parish' ? parishesFor(values.municipality ?? '') : undefined}
                  />
                </div>
              ))}
            </div>
          </FichaGroup>
        );
      })}

      {p.photos ?? (
        <Card className="p-4">
          <p className="text-[15px] text-text-2">
            {p.kind === 'obra'
              ? 'Fotos del antes y del avance: al guardar, se suben en la ficha (varias a la vez, y la subida aguanta mala señal).'
              : 'Fotos, videos o documentos (antes y después): al guardar, se suben en la ficha (la subida aguanta mala señal).'}
          </p>
        </Card>
      )}

      {p.kind === 'obra' ? null : (
        <Card className="p-4">
          <label className="flex min-h-11 items-center gap-3 text-[15px] font-semibold">
            <input
              type="checkbox"
              role="switch"
              checked={wants}
              onChange={(e) => setDraft((d) => editWantsAgenda(d, base, e.target.checked))}
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
        {p.kind === 'obra' ? <p className="text-sm text-text-2">La fecha de la visita la ponen el jefe o el despacho.</p> : null}
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
          <LinkButton variant="ghost" href={p.cancelHref} onClick={clear}>
            Cancelar
          </LinkButton>
        </div>
      </Card>
    </form>
  );
}
