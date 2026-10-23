'use client';

import { useState } from 'react';
import { Copy, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { generateCopies, saveCopy } from '@/lib/actions/pieces';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Select, Textarea } from '@/components/ui/field';
import { LENGTH_GROUP } from '@/lib/data/labels';
import { LIMITS, copyLength } from '@/lib/domain/copies';
import { cn } from '@/lib/cn';

type Group = 'long' | 'medium' | 'short';
type CopyRow = { length_group: Group; body: string; generated_by: string; formula_id: string | null };

export function CopiesEditor({ pieceId, copies, formulas }: { pieceId: string; copies: CopyRow[]; formulas: { id: string; code: string; name: string; description: string }[] }) {
  const { run, pending } = useAction();
  const byGroup = Object.fromEntries(copies.map((c) => [c.length_group, c.body])) as Partial<Record<Group, string>>;
  const [texts, setTexts] = useState<Record<Group, string>>({ long: byGroup.long ?? '', medium: byGroup.medium ?? '', short: byGroup.short ?? '' });
  const [formulaId, setFormulaId] = useState(copies[0]?.formula_id ?? formulas[0]?.id ?? '');
  const [missing, setMissing] = useState<string[]>([]);
  const [dirty, setDirty] = useState<Record<Group, boolean>>({ long: false, medium: false, short: false });
  const formula = formulas.find((f) => f.id === formulaId);

  return (
    <Card>
      <CardHeader title="Copies" subtitle="La misma fórmula en tres largos. Solo usan cifras de la ficha." />
      <CardBody className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-sm font-semibold">Fórmula</span>
            <Select value={formulaId} onChange={(e) => setFormulaId(e.target.value)}>
              {formulas.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
          </label>
          <Button
            type="button"
            disabled={pending || !formulaId}
            onClick={() => {
              if (Object.values(texts).some(Boolean) && !confirm('Esto reemplaza los copies actuales. ¿Seguir?')) return;
              run(() => generateCopies({ pieceId, formulaId }), {
                onOk: (r) => {
                  if (!r.ok) return;
                  setMissing(r.data!.missing);
                  if (r.data!.note) toast.info(r.data!.note);
                  else toast.success(r.data!.by === 'ai' ? 'Copies escritos con IA. Revísalos.' : 'Copies listos desde la ficha. Revísalos.');
                  setDirty({ long: false, medium: false, short: false });
                  setTimeout(() => location.reload(), 300);
                },
              });
            }}
          >
            <Sparkles className="h-4 w-4" aria-hidden /> Escribir desde la ficha
          </Button>
        </div>
        {formula?.description ? <p className="text-sm text-text-2">{formula.description}</p> : null}
        {missing.length ? (
          <p className="rounded-[var(--radius-control)] bg-warn-soft px-3 py-2 text-sm text-warn" role="status">
            Falta en la ficha: {missing.join(', ')}. Complétalo para que el copy quede mejor.
          </p>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-3">
          {(['long', 'medium', 'short'] as const).map((g) => {
            const len = copyLength(g, texts[g]);
            const over = len > LIMITS[g];
            return (
              <div key={g} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <label htmlFor={`copy-${g}`} className="font-semibold">{LENGTH_GROUP[g].label}</label>
                  <span className={cn('font-mono text-sm tabular', over ? 'font-bold text-danger' : 'text-text-2')} aria-live="polite">
                    {len}/{LIMITS[g]}
                  </span>
                </div>
                <p className="text-xs text-text-2">{LENGTH_GROUP[g].networks}</p>
                <Textarea
                  id={`copy-${g}`}
                  rows={g === 'long' ? 12 : g === 'medium' ? 8 : 5}
                  value={texts[g]}
                  aria-invalid={over}
                  className={over ? 'border-danger' : undefined}
                  onChange={(e) => {
                    setTexts({ ...texts, [g]: e.target.value });
                    setDirty({ ...dirty, [g]: true });
                  }}
                />
                {over ? <p className="text-sm text-danger">Se pasa por {len - LIMITS[g]} caracteres.</p> : null}
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant={dirty[g] ? 'primary' : 'secondary'} disabled={pending || !dirty[g]} onClick={() => run(() => saveCopy({ pieceId, group: g, body: texts[g] }), { success: 'Copy guardado.', onOk: () => setDirty({ ...dirty, [g]: false }) })}>
                    Guardar
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(texts[g]).then(() => toast.success('Copiado.'))}>
                    <Copy className="h-4 w-4" aria-hidden /> Copiar
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}
