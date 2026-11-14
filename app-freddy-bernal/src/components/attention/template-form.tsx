'use client';

import { useId, useState } from 'react';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { saveReplyTemplate } from '@/lib/actions/attention-admin';

type Template = { id: string; kind: 'public_reply' | 'info_request'; title: string; body: string; sort: number; active: boolean };

// A saved reply (the coordinator's): what the team writes to the person most often. Plain words, no data of anyone:
// the person reads it as it is, after the team adjusts it to the case.
export function TemplateForm({ template }: { template?: Template }) {
  const { run, pending } = useAction();
  const [kind, setKind] = useState<Template['kind']>(template?.kind ?? 'public_reply');
  const [title, setTitle] = useState(template?.title ?? '');
  const [body, setBody] = useState(template?.body ?? '');
  const [sort, setSort] = useState(String(template?.sort ?? 100));
  const [active, setActive] = useState(template?.active ?? true);
  const ids = { kind: useId(), title: useId(), body: useId(), sort: useId(), active: useId() };
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveReplyTemplate({ id: template?.id, kind, title, body, sort: Number(sort) || 0, active }), {
          success: template ? 'Respuesta guardada.' : 'Respuesta creada.',
          onOk: () => {
            if (!template) {
              setTitle('');
              setBody('');
            }
          },
        });
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_12rem_6rem]">
        <Field label="Nombre" htmlFor={ids.title}>
          <Input id={ids.title} value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} maxLength={80} />
        </Field>
        <Field label="Para" htmlFor={ids.kind}>
          <Select id={ids.kind} value={kind} onChange={(e) => setKind(e.target.value as Template['kind'])}>
            <option value="public_reply">Responder</option>
            <option value="info_request">Pedir información</option>
          </Select>
        </Field>
        <Field label="Orden" htmlFor={ids.sort}>
          <Input id={ids.sort} type="number" inputMode="numeric" min={0} max={1000} value={sort} onChange={(e) => setSort(e.target.value)} />
        </Field>
      </div>
      <Field label="Texto" htmlFor={ids.body} hint="Lo lee la persona: escríbelo de «usted», sin nombres, teléfonos ni direcciones de nadie.">
        <Textarea id={ids.body} value={body} onChange={(e) => setBody(e.target.value)} required minLength={10} maxLength={2000} rows={3} />
      </Field>
      {template ? (
        <label htmlFor={ids.active} className="flex min-h-11 items-center gap-2 text-[15px]">
          <input id={ids.active} type="checkbox" className="h-5 w-5 accent-accent" checked={active} onChange={(e) => setActive(e.target.checked)} />
          En uso (apagada, no se ofrece; nada se borra)
        </label>
      ) : null}
      <Button type="submit" variant={template ? 'secondary' : 'primary'} className="w-fit" disabled={pending}>{template ? 'Guardar' : 'Crear la respuesta'}</Button>
    </form>
  );
}
