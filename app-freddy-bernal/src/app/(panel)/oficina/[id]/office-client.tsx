'use client';

import { useId } from 'react';
import { approveReception, approveScript, draftScript, markEdit, saveReception, saveScript } from '@/lib/actions/office';
import { useAction } from '@/lib/hooks/use-action';
import { useDraft } from '@/lib/hooks/use-draft';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/field';
import { Chip } from '@/components/ui/chip';
import { DICTATE_HINT } from '@/lib/data/labels';
import { RX_MAX, RX_MIN, RX_QUESTIONS, RX_RESEARCH_MAX, SCRIPT_MAX, type Reception, type ScriptStatus } from '@/lib/domain/office';

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

// The reception (Juan, 06/11/2026): the ficha as it came; with no ficha, the three open questions; then what was found
// outside, with its source and only in the Táchira. «Guardar y mandar al jefe», and for the boss «Aprobar la lectura».
export function ReceptionPanel({
  eventId, initial, status, needsAnswers, canApprove,
}: { eventId: string; initial: Reception; status: ScriptStatus; needsAnswers: boolean; canApprove: boolean }) {
  const ids = { what: useId(), beneficiaries: useId(), responsible: useId(), research: useId() };
  const { run, pending } = useAction();
  const d = useDraft(`office-reception:${eventId}`, initial);
  const v = d.value;
  const changed = (Object.keys(initial) as (keyof Reception)[]).some((k) => v[k].trim() !== initial[k].trim());
  const missing = needsAnswers ? RX_QUESTIONS.filter((q) => v[q.key].trim().length < RX_MIN) : [];
  return (
    <div className="flex flex-col gap-3">
      <Chip tone={STATUS[status].tone} className="w-fit">{status === 'none' ? 'Sin lectura' : STATUS[status].label}</Chip>
      <p className="text-[15px]">
        {needsAnswers
          ? 'No hay ficha o viene casi vacía: contesta estas tres preguntas con quien delegó la actividad.'
          : 'La ficha trae los datos. Las preguntas son opcionales: úsalas si falta algo.'}
      </p>
      {RX_QUESTIONS.map((q) => (
        <Field key={q.key} label={needsAnswers ? `${q.label} (obligatoria)` : q.label} htmlFor={ids[q.key]} hint={q.hint}>
          <Textarea id={ids[q.key]} rows={2} maxLength={RX_MAX} value={v[q.key]} onChange={(e) => d.setValue({ ...v, [q.key]: e.target.value })} />
        </Field>
      ))}
      <Field
        label="Lo que se encontró afuera"
        htmlFor={ids.research}
        hint="Reseñas de Google de la zona, quejas de la gente y lo que dicen en TikTok. Solo en el Táchira (salvo una obra nacional). Pon de dónde salió cada cosa. Nada inventado."
      >
        <Textarea id={ids.research} rows={5} maxLength={RX_RESEARCH_MAX} value={v.research} onChange={(e) => d.setValue({ ...v, research: e.target.value })} />
      </Field>
      {d.restored ? <p className="text-sm text-text-2">Recuperamos lo que estabas escribiendo; todavía no está guardado.</p> : null}
      {missing.length ? <p className="text-sm text-warn">Falta: {missing.map((q) => `«${q.label}»`).join(', ')}.</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={pending || (!changed && status !== 'none') || missing.length > 0}
          onClick={() => {
            const next = { what: v.what.trim(), beneficiaries: v.beneficiaries.trim(), responsible: v.responsible.trim(), research: v.research.trim() };
            run(() => saveReception({ eventId, ...next }), { onOk: () => d.reset(next) });
          }}
        >
          {pending ? 'Guardando…' : status === 'approved' ? 'Guardar (vuelve al jefe)' : 'Guardar y mandar al jefe'}
        </Button>
        {canApprove && status === 'draft' && !changed ? (
          <Button type="button" variant="slate" disabled={pending} onClick={() => run(() => approveReception({ eventId }))}>
            Aprobar la lectura
          </Button>
        ) : null}
      </div>
    </div>
  );
}
