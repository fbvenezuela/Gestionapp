'use client';

import { ArrowDown, ArrowUp, Clapperboard, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTransition } from 'react';
import { shotsFromStoryboard } from '@/lib/actions/redes';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/field';
import type { Shot } from '@/lib/data/redes';
import { useCard } from './card-context';
import { fieldId } from './card-fields';

// The shots of a reel or a YouTube video, one by one (§2.1 of the request): «Lo que dice», «La acción» and «Texto en
// pantalla». Script, not what goes out: free to change on an approved piece. «Traer del storyboard» copies the event's
// blocks after the ones here (a piece born from an event only). Saved on its own like the rest of the card.
const MAX = 60;
const blank: Shot = { says: '', action: '', on_screen: '' };

export function ShotsEditor({ title = 'Tomas' }: { title?: string }) {
  const { card, saver, confirm, announce } = useCard();
  const [pending, start] = useTransition();
  const shots = saver.details.shots;
  const set = (next: Shot[]) => saver.setShots(next);
  const edit = (i: number, k: keyof Shot, v: string) => set(shots.map((s, n) => (n === i ? { ...s, [k]: v } : s)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= shots.length) return;
    const next = [...shots];
    [next[i], next[j]] = [next[j], next[i]];
    set(next);
    announce(`La toma ${i + 1} pasó a ser la ${j + 1}.`);
  };
  const remove = async (i: number) => {
    const s = shots[i];
    if ((s.says || s.action || s.on_screen) && !(await confirm({ title: `¿Quitar la toma ${i + 1}?`, body: 'Se borra lo que tiene escrito.', confirmLabel: 'Quitar', tone: 'danger' }))) return;
    set(shots.filter((_, n) => n !== i));
    announce(`Toma ${i + 1} quitada.`);
  };
  const bring = () =>
    start(async () => {
      await saver.flush();
      const r = await shotsFromStoryboard({ pieceId: card.id });
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message ?? 'Tomas traídas del storyboard');
      // What the action wrote is the card's now (its rev too): the next save goes on from it.
      const d = r.data as { rev?: number } | undefined;
      if (typeof d?.rev === 'number') saver.applyServer(d.rev, {});
    });

  return (
    <section aria-labelledby={fieldId(card.id, 'shots')} className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 id={fieldId(card.id, 'shots')} className="label-caps">
          {title}
        </h4>
        {card.event ? (
          <Button type="button" variant="secondary" size="md" disabled={pending} onClick={bring}>
            <Clapperboard className="h-4 w-4" aria-hidden /> Traer del storyboard
          </Button>
        ) : null}
      </div>
      {shots.length ? (
        <ol className="flex flex-col gap-3">
          {shots.map((s, i) => (
            <li key={i} className="flex min-w-0 flex-col gap-2 rounded-[var(--radius-control)] border border-border p-3">
              <div className="flex flex-wrap items-center gap-1">
                <p className="mr-auto font-semibold">Toma {i + 1}</p>
                <Button type="button" variant="ghost" size="icon" aria-label={`Subir toma ${i + 1}`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="h-4 w-4" aria-hidden />
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label={`Bajar toma ${i + 1}`} disabled={i === shots.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown className="h-4 w-4" aria-hidden />
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label={`Quitar toma ${i + 1}`} onClick={() => void remove(i)}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </div>
              {(
                [
                  ['says', 'Lo que dice', 1000, 2],
                  ['action', 'La acción', 1000, 2],
                  ['on_screen', 'Texto en pantalla', 300, 1],
                ] as const
              ).map(([k, label, max, rows]) => {
                const id = fieldId(card.id, `shot-${i}-${k}`);
                return (
                  <div key={k} className="flex min-w-0 flex-col gap-1">
                    <label htmlFor={id} className="text-sm font-semibold">
                      {label}
                    </label>
                    <Textarea id={id} rows={rows} maxLength={max} value={s[k]} className="min-h-0" onChange={(e) => edit(i, k, e.target.value)} onBlur={() => void saver.flush()} />
                  </div>
                );
              })}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-text-2">Todavía no hay tomas.</p>
      )}
      <Button
        type="button"
        variant="secondary"
        size="md"
        className="self-start"
        disabled={shots.length >= MAX}
        onClick={() => {
          set([...shots, { ...blank }]);
          announce(`Toma ${shots.length + 1} agregada.`);
        }}
      >
        <Plus className="h-4 w-4" aria-hidden /> Agregar toma
      </Button>
    </section>
  );
}
