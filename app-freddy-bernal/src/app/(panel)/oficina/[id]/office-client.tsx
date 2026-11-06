'use client';

import { useId } from 'react';
import { approveScript, draftScript, markEdit, saveScript } from '@/lib/actions/office';
import { useAction } from '@/lib/hooks/use-action';
import { useDraft } from '@/lib/hooks/use-draft';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/field';
import { Chip } from '@/components/ui/chip';
import { DICTATE_HINT } from '@/lib/data/labels';
import { SCRIPT_MAX, type ScriptStatus } from '@/lib/domain/office';

const STATUS: Record<ScriptStatus, { label: string; tone: 'neutral' | 'warn' | 'ok' }> = {
  none: { label: 'Sin guion', tone: 'neutral' },
  draft: { label: 'Espera al jefe', tone: 'warn' },
  approved: { label: 'Aprobado', tone: 'ok' },
};

// The script room: a first draft from the ficha (one tap), the text to fix by hand, «Guardar» (it goes to the boss) and,
// for the boss, «Aprobar guion». What is typed stays in the phone until it is saved.
export function ScriptPanel({ eventId, initial, status, canApprove }: { eventId: string; initial: string; status: ScriptStatus; canApprove: boolean }) {
  const id = useId();
  const { run, pending } = useAction();
  const d = useDraft(`office-script:${eventId}`, { body: initial });
  const body = d.value.body;
  const changed = body.trim() !== initial.trim();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={STATUS[status].tone}>{STATUS[status].label}</Chip>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() =>
            run(() => draftScript({ eventId }), {
              success: 'Borrador hecho con la ficha. Revísalo y guárdalo.',
              refresh: false,
              onOk: (r) => {
                if (r.ok && typeof r.data === 'string') d.setValue({ body: r.data });
              },
            })
          }
        >
          {body.trim() ? 'Rehacer borrador con la ficha' : 'Proponer borrador con la ficha'}
        </Button>
      </div>
      <Field label="Guion, una toma por línea" htmlFor={id} hint={`Solo las cifras de la ficha: si falta un dato, dilo. ${DICTATE_HINT}`}>
        <Textarea id={id} value={body} rows={9} maxLength={SCRIPT_MAX} onChange={(e) => d.setValue({ body: e.target.value })} />
      </Field>
      {d.restored ? <p className="text-sm text-text-2">Recuperamos lo que estabas escribiendo; todavía no está guardado.</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={pending || !changed || body.trim().length < 10}
          onClick={() => {
            const text = body.trim();
            run(() => saveScript({ eventId, script: text }), { onOk: () => d.reset({ body: text }) });
          }}
        >
          {pending ? 'Guardando…' : status === 'approved' ? 'Guardar (vuelve al jefe)' : 'Guardar guion'}
        </Button>
        {canApprove && status === 'draft' && !changed ? (
          <Button type="button" variant="slate" disabled={pending} onClick={() => run(() => approveScript({ eventId }))}>
            Aprobar guion
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// «Editor en línea» (the clean video) and «Editor brutal» (the final edit): one big button, and a way back.
export function EditStep({ eventId, step, done }: { eventId: string; step: 'clean' | 'brutal'; done: boolean }) {
  const { run, pending } = useAction();
  const label = step === 'clean' ? 'Ya está limpio' : 'Edición lista';
  return done ? (
    <div className="flex flex-wrap items-center gap-2">
      <Chip tone="ok">{step === 'clean' ? 'Video limpio' : 'Edición lista'}</Chip>
      <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run(() => markEdit({ eventId, step, done: false }))}>
        Deshacer
      </Button>
    </div>
  ) : (
    <Button type="button" size="lg" disabled={pending} onClick={() => run(() => markEdit({ eventId, step, done: true }))}>
      {pending ? 'Guardando…' : label}
    </Button>
  );
}
