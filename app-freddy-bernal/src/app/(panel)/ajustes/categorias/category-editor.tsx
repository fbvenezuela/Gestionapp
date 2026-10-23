'use client';

import { useState } from 'react';
import { saveCategory } from '@/lib/actions/settings';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/field';

type Row = { id: string; parent_id: string | null; name: string; emoji: string | null; active: boolean };

export function CategoryEditor({ rows }: { rows: Row[] }) {
  const { run, pending } = useAction();
  const groups = rows.filter((r) => !r.parent_id);
  const [adding, setAdding] = useState<Record<string, string>>({});
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {groups.map((g) => (
        <Card key={g.id}>
          <CardHeader title={`${g.emoji ?? ''} ${g.name}`} />
          <ul className="divide-y divide-border">
            {rows.filter((r) => r.parent_id === g.id).map((c) => (
              <li key={c.id} className="flex items-center gap-2 px-4 py-2">
                <span className={`flex-1 ${c.active ? '' : 'text-muted line-through'}`}>{c.emoji} {c.name}</span>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => saveCategory({ id: c.id, parentId: g.id, name: c.name, emoji: c.emoji, active: !c.active }))}>
                  {c.active ? 'Desactivar' : 'Activar'}
                </Button>
              </li>
            ))}
          </ul>
          <form className="flex gap-2 border-t border-border p-3" onSubmit={(e) => {
            e.preventDefault();
            const name = adding[g.id]?.trim();
            if (name) run(() => saveCategory({ parentId: g.id, name, emoji: null }), { success: 'Categoría agregada.', onOk: () => setAdding({ ...adding, [g.id]: '' }) });
          }}>
            <Input aria-label={`Nueva categoría en ${g.name}`} placeholder="Nueva categoría" value={adding[g.id] ?? ''} onChange={(e) => setAdding({ ...adding, [g.id]: e.target.value })} />
            <Button type="submit" variant="secondary" disabled={pending}>Agregar</Button>
          </form>
        </Card>
      ))}
    </div>
  );
}
