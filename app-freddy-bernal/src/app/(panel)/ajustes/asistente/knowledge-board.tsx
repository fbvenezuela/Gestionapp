'use client';

import { useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { refreshAssistantKnowledge, toggleAssistantKnowledge } from '@/lib/actions/assistant';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/page';
import { ORIGIN_LABEL, rolesText } from '@/components/assistant/panel-core';
import { KnowledgeEditor, type KnowledgeValue } from './editors';

export type KnowledgeItem = KnowledgeValue & { id: string; origin: string; updated: string };

const EMPTY: KnowledgeValue = { title: '', body: '', roles: [], tags: [], active: true };

export function RefreshKnowledgeButton() {
  const { run, pending } = useAction();
  return (
    <Button
      variant="secondary"
      disabled={pending}
      onClick={() => run(() => refreshAssistantKnowledge(), { success: 'Listo: lo que sabe está al día con los ajustes.' })}
    >
      <RefreshCw className="h-4 w-4" aria-hidden /> {pending ? 'Actualizando…' : 'Actualizar lo que sabe'}
    </Button>
  );
}

export function KnowledgeBoard({ rows }: { rows: KnowledgeItem[] }) {
  const { run, pending } = useAction();
  // key changes every time the editor opens, so it starts from the row it was opened with
  const [editing, setEditing] = useState<{ value: KnowledgeValue; n: number } | null>(null);
  const open = (value: KnowledgeValue) => setEditing({ value, n: (editing?.n ?? 0) + 1 });
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        <Button onClick={() => open(EMPTY)}>
          <Plus className="h-4 w-4" aria-hidden /> Nueva ficha
        </Button>
        <RefreshKnowledgeButton />
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No hay fichas con ese filtro." />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {rows.map((k) => (
              <li key={k.id} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className={`min-w-0 flex-1 font-semibold [overflow-wrap:anywhere] ${k.active ? '' : 'text-text-2 line-through'}`}>{k.title}</h3>
                  <Chip tone={k.automatic ? 'info' : 'accent'}>{ORIGIN_LABEL[k.origin] ?? k.origin}</Chip>
                  {!k.active ? <Chip tone="neutral">Apagada</Chip> : null}
                </div>
                <p className="line-clamp-3 whitespace-pre-line text-sm text-text-2 [overflow-wrap:anywhere]">{k.body}</p>
                <p className="text-xs text-text-2">
                  {rolesText(k.roles)}
                  {k.tags.length ? ` · ${k.tags.join(', ')}` : ''} · {k.updated}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => open(k)}>
                    Editar<span className="sr-only"> «{k.title}»</span>
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={pending}
                    onClick={() => run(() => toggleAssistantKnowledge({ id: k.id, active: !k.active }), { success: k.active ? 'Ficha apagada: ya no la usa.' : 'Ficha encendida.' })}
                  >
                    {k.active ? 'Apagar' : 'Encender'}
                    <span className="sr-only"> «{k.title}»</span>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {editing ? <KnowledgeEditor key={editing.n} open onOpenChange={(o) => !o && setEditing(null)} initial={editing.value} /> : null}
    </>
  );
}
