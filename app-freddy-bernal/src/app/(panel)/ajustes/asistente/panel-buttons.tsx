'use client';

import { useId, useState } from 'react';
import { PlugZap, Undo2 } from 'lucide-react';
import { confirmAssistantDraft, discardAssistantDraft, probeAssistantChain, saveAssistantProfile, undoAssistantAction } from '@/lib/actions/assistant';
import { useAction } from '@/lib/hooks/use-action';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Field, Input, Textarea } from '@/components/ui/field';
import { faceOf } from '@/components/assistant/core';
import { fmtMs } from '@/components/assistant/panel-core';
import { neutralIntro } from '@/lib/assistant/text';

// Small client pieces of the panel: confirm or discard a prepared notice, undo what the
// assistant did, test the model chain and the assistant's name, face and intro.

export function DraftActions({ id, to }: { id: string; to: string }) {
  const { run, pending } = useAction();
  const { confirm, dialog } = useConfirm();
  return (
    <div className="flex flex-wrap gap-2">
      {dialog}
      <Button
        disabled={pending}
        onClick={async () => {
          if (!(await confirm({ title: `¿Mandar este aviso a ${to}?`, body: 'Les llega en los avisos de la plataforma. No se puede retirar.', confirmLabel: 'Mandar' }))) return;
          await run(() => confirmAssistantDraft({ id }), { success: 'Aviso enviado.' });
        }}
      >
        Confirmar y mandar
      </Button>
      <Button variant="ghost" disabled={pending} onClick={() => run(() => discardAssistantDraft({ id }), { success: 'Borrador descartado.' })}>
        Descartar
      </Button>
    </div>
  );
}

export function UndoButton({ id, what }: { id: string; what: string }) {
  const { run, pending } = useAction();
  const { confirm, dialog } = useConfirm();
  return (
    <>
      {dialog}
      <Button
        variant="secondary"
        disabled={pending}
        onClick={async () => {
          if (!(await confirm({ title: '¿Deshacer esto?', body: what, confirmLabel: 'Deshacer' }))) return;
          await run(() => undoAssistantAction({ id }), { success: 'Deshecho.' });
        }}
      >
        <Undo2 className="h-4 w-4" aria-hidden /> Deshacer
      </Button>
    </>
  );
}

type Probe = { link: string; ok: boolean; text?: string; error?: string; ms: number };

export function ProbeChain() {
  const { run, pending } = useAction();
  const [rows, setRows] = useState<Probe[] | null>(null);
  return (
    <Card>
      <CardHeader title="Probar la cadena" subtitle="Le pide «di hola» a cada modelo y dice cuál contesta y el error exacto de los demás." />
      <CardBody className="flex flex-col gap-3">
        <Button variant="secondary" className="sm:w-fit" disabled={pending} onClick={() => run(() => probeAssistantChain(), { refresh: false, onOk: (r) => r.ok && setRows((r.data as Probe[]) ?? []) })}>
          <PlugZap className="h-4 w-4" aria-hidden /> {pending ? 'Probando…' : 'Probar la cadena'}
        </Button>
        {rows ? (
          <ul className="flex flex-col gap-2" role="status">
            {rows.map((r) => (
              <li key={r.link} className="rounded-[var(--radius-control)] border border-border p-3 text-[15px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 font-semibold [overflow-wrap:anywhere]">{r.link === 'local' ? 'Cerebro de demostración' : r.link}</span>
                  <Chip tone={r.ok ? 'ok' : 'danger'}>{r.ok ? 'Contesta' : 'Falla'}</Chip>
                </div>
                <p className="mt-1 text-sm text-text-2 [overflow-wrap:anywhere]">
                  {r.ok ? r.text : r.error} {r.ms ? `· ${fmtMs(r.ms)}` : ''}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </CardBody>
    </Card>
  );
}

export function ProfileForm({ value }: { value: { name: string; emoji: string; intro: string } }) {
  const { run, pending } = useAction();
  const [f, setF] = useState(value);
  const id = useId();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Cómo se presenta" />
        <CardBody>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => saveAssistantProfile(f), { success: 'Guardado. Ya se ve en la ventana de todos.' });
            }}
          >
            <Field label="Nombre" htmlFor={`${id}-n`}>
              <Input id={`${id}-n`} value={f.name} maxLength={40} required onChange={(e) => setF({ ...f, name: e.target.value })} />
            </Field>
            <Field label="Cara" htmlFor={`${id}-e`} hint="Un emoji. Si lo dejas vacío, sale la inicial del nombre.">
              <Input id={`${id}-e`} value={f.emoji} maxLength={16} onChange={(e) => setF({ ...f, emoji: e.target.value })} />
            </Field>
            <Field label="Cómo se presenta" htmlFor={`${id}-i`} hint="Es lo primero que se lee al abrir la ventana. Sin fechas. Si lo dejas vacío, se presenta con su nombre.">
              <Textarea id={`${id}-i`} value={f.intro} rows={3} maxLength={300} onChange={(e) => setF({ ...f, intro: e.target.value })} />
            </Field>
            <Button type="submit" disabled={pending || !f.name.trim()} className="sm:w-fit">{pending ? 'Guardando…' : 'Guardar'}</Button>
          </form>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Así se ve" />
        <CardBody className="flex flex-col gap-4">
          <span className="inline-flex h-12 w-fit max-w-full items-center gap-2 rounded-full border border-border bg-surface py-1 pl-1 pr-3 shadow-lg" aria-hidden>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-lg font-bold leading-none text-on-accent">{faceOf({ name: f.name || '?', emoji: f.emoji })}</span>
            <span className="max-w-[7rem] truncate text-sm font-semibold">{f.name || 'Sin nombre'}</span>
          </span>
          <p className="max-w-[85%] whitespace-pre-wrap rounded-[var(--radius-card)] rounded-bl-sm bg-surface-2 px-3 py-2 text-[15px] [overflow-wrap:anywhere]">{f.intro.trim() || neutralIntro(f.name)}</p>
          <p className="text-sm text-text-2">El nombre y la cara salen de aquí, no del código: se cambian sin desplegar.</p>
        </CardBody>
      </Card>
    </div>
  );
}
