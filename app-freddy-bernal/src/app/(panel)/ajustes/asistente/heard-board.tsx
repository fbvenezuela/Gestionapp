'use client';

import { useState } from 'react';
import { BookOpen, MessageSquareText } from 'lucide-react';
import { discardAssistantHeard } from '@/lib/actions/assistant';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/page';
import { correctionDraft, rolesText } from '@/components/assistant/panel-core';
import { KnowledgeEditor, ScriptEditor } from './editors';

export type HeardGroup = { plain: string; sample: string; times: number; roles: string[]; last: string; ids: string[] };

// «Lo que preguntan»: questions grouped by likeness, most frequent first. «Enseñarle el dato»
// creates a ficha; «Enseñarle cómo contestar» creates a script. Either way the group leaves.
export function HeardBoard({ groups }: { groups: HeardGroup[] }) {
  const { run, pending } = useAction();
  const [teach, setTeach] = useState<{ kind: 'dato' | 'guion'; g: HeardGroup; n: number } | null>(null);
  const open = (kind: 'dato' | 'guion', g: HeardGroup) => setTeach({ kind, g, n: (teach?.n ?? 0) + 1 });
  if (!groups.length) return <EmptyState title="Nadie ha preguntado nada nuevo en estos días. Cuando pregunten algo que no sabe, sale aquí." />;
  return (
    <>
      <Card solid>
        <ul className="divide-y divide-border">
          {groups.map((g) => (
            <li key={g.plain} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex flex-wrap items-start gap-2">
                <p className="min-w-0 flex-1 font-semibold [overflow-wrap:anywhere]">«{g.sample}»</p>
                <Chip tone={g.times > 2 ? 'warn' : 'neutral'}>{g.times} {g.times === 1 ? 'vez' : 'veces'}</Chip>
              </div>
              <p className="text-sm text-text-2">{g.roles.length ? rolesText(g.roles) : 'Sin rol'} · la última, {g.last}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => open('dato', g)}>
                  <BookOpen className="h-4 w-4" aria-hidden /> Enseñarle el dato
                </Button>
                <Button variant="secondary" onClick={() => open('guion', g)}>
                  <MessageSquareText className="h-4 w-4" aria-hidden /> Enseñarle cómo contestar
                </Button>
                <Button variant="ghost" disabled={pending} onClick={() => run(() => discardAssistantHeard({ ids: g.ids }), { success: 'Quitado de la lista.' })}>
                  Descartar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      {teach?.kind === 'dato' ? (
        <KnowledgeEditor
          key={teach.n}
          open
          onOpenChange={(o) => !o && setTeach(null)}
          heading="Enseñarle el dato"
          heardIds={teach.g.ids}
          initial={{ title: teach.g.sample.slice(0, 200), body: '', roles: teach.g.roles, tags: [], active: true }}
        />
      ) : null}
      {teach?.kind === 'guion' ? (
        <ScriptEditor
          key={teach.n}
          open
          onOpenChange={(o) => !o && setTeach(null)}
          heading="Enseñarle cómo contestar"
          heardIds={teach.g.ids}
          initial={{ ...correctionDraft(teach.g.sample), notes: 'De «Lo que preguntan».', always: false, roles: teach.g.roles, active: true }}
        />
      ) : null}
    </>
  );
}
