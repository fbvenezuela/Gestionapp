'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { saveStoryboard } from '@/lib/actions/events';
import { useAction } from '@/lib/hooks/use-action';
import { sameJson, useDraft } from '@/lib/hooks/use-draft';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/page';
import { DICTATE_HINT } from '@/lib/data/labels';

type Block = { id?: string; shot: string; angle: string; bossLine: string; broll: string; fact: string; factSource: string };
type DbBlock = { id: string; shot: string; angle: string; boss_line: string; broll: string; fact: string; fact_source: string };

const emptyBlock = (): Block => ({ shot: '', angle: '', bossLine: '', broll: '', fact: '', factSource: '' });

type Board = { speech: string; blocks: Block[] };
// What the phone keeps: the storyboard as typed, plus what it was when this person started (base) and its version.
// base null = nothing of this person's is pending: the editor shows the server's storyboard as it is now (after a
// save, the refreshed one), and the next change starts from it.
type BoardDraft = Board & { base: Board | null; baseRev: number | null };

export function StoryboardEditor({ eventId, canEdit, speech, blocks, facts, rev }: { eventId: string; canEdit: boolean; speech: string; blocks: DbBlock[]; facts: string; rev: number | null }) {
  const server: Board = {
    speech,
    blocks: blocks.map((b) => ({ id: b.id, shot: b.shot, angle: b.angle, bossLine: b.boss_line, broll: b.broll, fact: b.fact, factSource: b.fact_source })),
  };
  const clean = (): BoardDraft => ({ ...server, base: null, baseRev: null });
  const { value: draft, setValue: setDraft, restored, reset } = useDraft<BoardDraft>(`storyboard:${eventId}`, clean(), {
    restore: (saved) => {
      const d = saved as Partial<BoardDraft> | null;
      if (!d || typeof d.speech !== 'string' || !Array.isArray(d.blocks)) return null;
      if (sameJson({ speech: d.speech, blocks: d.blocks }, server)) return null;
      return { speech: d.speech, blocks: d.blocks as Block[], base: d.base ?? server, baseRev: typeof d.baseRev === 'number' ? d.baseRev : null };
    },
  });
  const [kept, setKept] = useState(false);
  const value: Board = draft.base ? { speech: draft.speech, blocks: draft.blocks } : server;
  // Every change remembers where this person started (the server's storyboard when the first change was made).
  const setValue = (next: Board) => setDraft((d) => ({ ...next, base: d.base ?? server, baseRev: d.baseRev ?? rev }));
  // Someone else saved the storyboard since this person started typing.
  const changedMeanwhile = restored && !kept && !!draft.base && !sameJson(draft.base, server);
  const { run, pending } = useAction();

  if (!canEdit) {
    if (!blocks.length && !speech) return <EmptyState title="Todavía no hay storyboard para este evento." />;
    return <ReadOnly speech={speech} blocks={server.blocks} />;
  }

  const update = (i: number, patch: Partial<Block>) => setValue({ ...value, blocks: value.blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const move = (i: number, d: -1 | 1) => {
    const arr = [...value.blocks];
    const j = i + d;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setValue({ ...value, blocks: arr });
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveStoryboard({ eventId, ...value, rev: draft.baseRev ?? rev ?? undefined, base: draft.base ?? server }), {
          onOk: () => {
            setKept(false);
            reset(clean());
          },
        });
      }}
    >
      {changedMeanwhile ? (
        <div className="rounded-[var(--radius-control)] bg-warn-soft px-3 py-3 text-sm text-warn" role="status">
          <p className="font-semibold">Mientras escribías, otra persona guardó el storyboard. Si guardas, queda lo tuyo y lo de antes queda en el historial.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => reset(clean())}
            >
              Usar lo de él
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setKept(true)}>Dejar lo mío</Button>
          </div>
        </div>
      ) : restored ? (
        <p className="rounded-[var(--radius-control)] bg-info-soft px-3 py-2 text-sm text-info" role="status">Tienes cambios sin guardar de antes. Revisa y toca «Guardar».</p>
      ) : null}
      {facts ? (
        <Card className="bg-surface-2">
          <CardBody>
            <p className="label-caps mb-1">Datos de la ficha (úsalos tal cual)</p>
            <p className="whitespace-pre-wrap text-[15px]">{facts}</p>
          </CardBody>
        </Card>
      ) : null}
      <Card>
        <CardHeader title="Lo que va a decir" subtitle="El texto que el jefe lee en su iPad (modo lectura)." />
        <CardBody>
          <Textarea aria-label="Lo que va a decir" rows={6} value={value.speech} onChange={(e) => setValue({ ...value, speech: e.target.value })} placeholder="¡Saludos, Táchira! Hoy estamos en…" />
          <p className="mt-1.5 text-sm text-text-2">{DICTATE_HINT}</p>
        </CardBody>
      </Card>

      {value.blocks.map((b, i) => (
        <Card key={b.id ?? `new-${i}`}>
          <CardHeader
            title={`Bloque ${i + 1}`}
            action={
              <div className="flex gap-1">
                <Button type="button" variant="ghost" size="icon" aria-label="Subir bloque" onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
                <Button type="button" variant="ghost" size="icon" aria-label="Bajar bloque" onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
                <Button type="button" variant="ghost" size="icon" aria-label="Quitar bloque" onClick={() => setValue({ ...value, blocks: value.blocks.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>
              </div>
            }
          />
          <CardBody className="grid gap-3 sm:grid-cols-2">
            <Field label="Plano" htmlFor={`shot-${i}`}><Input id={`shot-${i}`} value={b.shot} onChange={(e) => update(i, { shot: e.target.value })} placeholder="General, medio, primer plano…" /></Field>
            <Field label="Ángulo" htmlFor={`angle-${i}`}><Input id={`angle-${i}`} value={b.angle} onChange={(e) => update(i, { angle: e.target.value })} placeholder="Frontal, lateral, dron…" /></Field>
            <Field label="Lo que dice el jefe" htmlFor={`line-${i}`} className="sm:col-span-2"><Textarea id={`line-${i}`} rows={2} value={b.bossLine} onChange={(e) => update(i, { bossLine: e.target.value })} /></Field>
            <Field label="Tomas de apoyo" htmlFor={`broll-${i}`} className="sm:col-span-2"><Input id={`broll-${i}`} value={b.broll} onChange={(e) => update(i, { broll: e.target.value })} /></Field>
            <Field label="Dato que menciona" htmlFor={`fact-${i}`}><Input id={`fact-${i}`} value={b.fact} onChange={(e) => update(i, { fact: e.target.value })} /></Field>
            <Field label="Fuente del dato" htmlFor={`src-${i}`} error={b.fact && !b.factSource ? 'Falta la fuente' : undefined}><Input id={`src-${i}`} value={b.factSource} onChange={(e) => update(i, { factSource: e.target.value })} /></Field>
          </CardBody>
        </Card>
      ))}

      <Button type="button" variant="secondary" onClick={() => setValue({ ...value, blocks: [...value.blocks, emptyBlock()] })}>
        <Plus className="h-4 w-4" aria-hidden /> Agregar bloque
      </Button>
      <div className="sticky bottom-20 z-10 lg:bottom-4">
        <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={pending}>{pending ? 'Guardando…' : 'Guardar storyboard'}</Button>
      </div>
    </form>
  );
}

function ReadOnly({ speech, blocks }: { speech: string; blocks: Block[] }) {
  return (
    <div className="flex flex-col gap-4">
      {speech ? (
        <Card><CardHeader title="Lo que va a decir" /><CardBody><p className="whitespace-pre-wrap text-[15px]">{speech}</p></CardBody></Card>
      ) : null}
      {blocks.map((b, i) => (
        <Card key={i}>
          <CardHeader title={`Bloque ${i + 1}`} subtitle={[b.shot, b.angle].filter(Boolean).join(' · ')} />
          <CardBody className="flex flex-col gap-2 text-[15px]">
            {b.bossLine ? <p><b>Dice:</b> {b.bossLine}</p> : null}
            {b.broll ? <p><b>Apoyo:</b> {b.broll}</p> : null}
            {b.fact ? <p><b>Dato:</b> {b.fact} <span className="text-text-2">({b.factSource})</span></p> : null}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
