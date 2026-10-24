'use client';

import { useId, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { saveAssistantKnowledge, saveAssistantScript } from '@/lib/actions/assistant';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { TEAM_ROLE_CHOICES, hasAssistantLine, splitList } from '@/components/assistant/panel-core';

// The two editors of the panel (a ficha and a script), in a sheet: it slides up on the phone
// and opens on the right on a computer. Used by «Lo que sabe», «Cómo contesta»,
// «Conversaciones» («Corregir») and «Lo que preguntan» («Enseñarle…»).

export type KnowledgeValue = { id?: string; title: string; body: string; roles: string[]; tags: string[]; active: boolean; automatic?: boolean };
export type ScriptValue = { id?: string; topic: string; triggers: string[]; script: string; notes: string; always: boolean; roles: string[]; active: boolean };

export function RolePicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const id = useId();
  return (
    <fieldset className="flex flex-col gap-1.5" aria-describedby={`${id}-hint`}>
      <legend className="text-sm font-semibold text-text">Para quién</legend>
      <div className="grid grid-cols-1 gap-x-3 min-[400px]:grid-cols-2">
        {TEAM_ROLE_CHOICES.map((r) => (
          <label key={r.value} className="flex min-h-11 items-center gap-2 text-[15px]">
            <input
              type="checkbox"
              className="h-5 w-5 shrink-0 accent-accent"
              checked={value.includes(r.value)}
              onChange={(e) => onChange(e.target.checked ? [...value, r.value] : value.filter((x) => x !== r.value))}
            />
            {r.label}
          </label>
        ))}
      </div>
      <p id={`${id}-hint`} className="text-sm text-text-2">Si no marcas ninguno, es para todo el equipo.</p>
    </fieldset>
  );
}

export function KnowledgeEditor({
  open,
  onOpenChange,
  initial,
  heardIds = [],
  heading,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: KnowledgeValue;
  heardIds?: string[];
  heading?: string;
}) {
  const { run, pending } = useAction();
  const [f, setF] = useState({ ...initial, tags: initial.tags.join(', ') });
  const id = useId();
  const save = () =>
    run(() => saveAssistantKnowledge({ id: f.id ?? null, title: f.title, body: f.body, roles: f.roles, tags: splitList(f.tags, 30), active: f.active, heardIds }), {
      success: heardIds.length ? 'Listo: ya sabe el dato y esas preguntas salen de la lista.' : 'Ficha guardada.',
      onOk: () => onOpenChange(false),
    });
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={heading ?? (f.id ? 'Editar ficha' : 'Nueva ficha')} description="Un dato que el asistente usa para contestar.">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {f.automatic ? (
          <p className="flex items-start gap-2 rounded-[var(--radius-control)] border border-warn/40 bg-warn-soft p-3 text-sm text-text" role="note">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
            Esta ficha es automática: sale de los ajustes de la plataforma. Si la editas, ya no se actualiza sola.
          </p>
        ) : null}
        <Field label="Título" htmlFor={`${id}-t`}>
          <Input id={`${id}-t`} value={f.title} maxLength={200} required onChange={(e) => setF({ ...f, title: e.target.value })} />
        </Field>
        <Field label="Lo que tiene que saber" htmlFor={`${id}-b`} hint="Corto y claro. Sin fechas, horas ni direcciones: esto va al proveedor de IA.">
          <Textarea id={`${id}-b`} value={f.body} rows={8} maxLength={6000} required onChange={(e) => setF({ ...f, body: e.target.value })} />
        </Field>
        <RolePicker value={f.roles} onChange={(roles) => setF({ ...f, roles })} />
        <Field label="Etiquetas" htmlFor={`${id}-g`} hint="Palabras con las que la buscan, separadas por coma.">
          <Input id={`${id}-g`} value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} />
        </Field>
        {f.id ? (
          <label className="flex min-h-11 items-center gap-2 text-[15px]">
            <input type="checkbox" className="h-5 w-5 accent-accent" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Encendida (la usa para contestar)
          </label>
        ) : null}
        <Button type="submit" disabled={pending || !f.title.trim() || !f.body.trim()}>{pending ? 'Guardando…' : f.automatic ? 'Guardar y hacerla del equipo' : 'Guardar'}</Button>
      </form>
    </Sheet>
  );
}

export function ScriptEditor({
  open,
  onOpenChange,
  initial,
  heardIds = [],
  fromConversation = false,
  heading,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: ScriptValue;
  heardIds?: string[];
  fromConversation?: boolean;
  heading?: string;
}) {
  const { run, pending } = useAction();
  const [f, setF] = useState({ ...initial, triggers: initial.triggers.join('\n') });
  const id = useId();
  const ok = hasAssistantLine(f.script);
  const save = () =>
    run(
      () =>
        saveAssistantScript({
          id: f.id ?? null,
          topic: f.topic,
          triggers: splitList(f.triggers, 40),
          script: f.script,
          notes: f.notes,
          always: f.always,
          roles: f.roles,
          active: f.active,
          fromConversation,
          heardIds,
        }),
      { success: heardIds.length ? 'Listo: ya sabe cómo contestar eso.' : 'Guion guardado.', onOk: () => onOpenChange(false) },
    );
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={heading ?? (f.id ? 'Editar guion' : 'Nuevo guion')} description="Enseña el tono y la forma de contestar, no los datos.">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="Tema" htmlFor={`${id}-t`}>
          <Input id={`${id}-t`} value={f.topic} maxLength={200} required onChange={(e) => setF({ ...f, topic: e.target.value })} />
        </Field>
        <Field label="Disparadores" htmlFor={`${id}-d`} hint="Como lo escribe la gente, con y sin tildes. Uno por línea.">
          <Textarea id={`${id}-d`} value={f.triggers} rows={4} onChange={(e) => setF({ ...f, triggers: e.target.value })} />
        </Field>
        <Field
          label="Guion"
          htmlFor={`${id}-s`}
          error={f.script.trim() && !ok ? 'Falta al menos una línea que empiece por «[ASISTENTE]:».' : undefined}
          hint="Sin fechas, horas ni cifras que cambian: van como [huecos]."
        >
          <Textarea id={`${id}-s`} value={f.script} rows={8} maxLength={6000} required onChange={(e) => setF({ ...f, script: e.target.value })} />
        </Field>
        <details className="rounded-[var(--radius-control)] border border-border bg-surface-2 p-3 text-sm">
          <summary className="min-h-11 cursor-pointer content-center font-semibold">Cómo se escribe un guion</summary>
          <div className="mt-2 flex flex-col gap-2 text-text-2">
            <p className="whitespace-pre-line rounded-[var(--radius-control)] bg-surface p-2 font-mono text-xs text-text">
              {'Persona: cómo lo pregunta alguien\n[ASISTENTE]: una forma de contestar\n[ASISTENTE]: otra forma, distinta de verdad\nSi dice «…» → [ASISTENTE]: …'}
            </p>
            <p>Dos o tres formas de contestar, cada una distinta. Huecos: [ASISTENTE] es su nombre, [APP] la plataforma, [JEFE] y [NOMBRE] de quien pregunta.</p>
            <p>[usa avisar_al_equipo] en una línea hace que llame a esa herramienta de verdad.</p>
          </div>
        </details>
        <Field label="Notas para el equipo" htmlFor={`${id}-n`} hint="No las ve el asistente.">
          <Textarea id={`${id}-n`} value={f.notes} rows={2} maxLength={1000} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
        <RolePicker value={f.roles} onChange={(roles) => setF({ ...f, roles })} />
        <label className="flex min-h-11 items-center gap-2 text-[15px]">
          <input type="checkbox" className="h-5 w-5 accent-accent" checked={f.always} onChange={(e) => setF({ ...f, always: e.target.checked })} /> Usarlo siempre (solo para cómo salir de lo que no toca)
        </label>
        {f.id ? (
          <label className="flex min-h-11 items-center gap-2 text-[15px]">
            <input type="checkbox" className="h-5 w-5 accent-accent" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Encendido
          </label>
        ) : null}
        <Button type="submit" disabled={pending || !f.topic.trim() || !ok}>{pending ? 'Guardando…' : 'Guardar'}</Button>
      </form>
    </Sheet>
  );
}
