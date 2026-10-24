'use client';

import { useState } from 'react';
import { Copy, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { generateCopies, saveCopy } from '@/lib/actions/pieces';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { LENGTH_GROUP } from '@/lib/data/labels';
import { LIMITS, VOICES, copyLength, type Closing, type Voice } from '@/lib/domain/copies';
import { cn } from '@/lib/cn';

type Group = 'long' | 'medium' | 'short';
type CopyRow = { length_group: Group; body: string; generated_by: string; formula_id: string | null };

// "brand:<n>" = one of the brand's closings; the rest are the closing kinds.
function closingValue(c: Closing | null, closings: string[]) {
  if (!c || c.kind === 'brand') return `brand:${Math.max(0, closings.indexOf(c?.text ?? closings[0]))}`;
  return c.kind;
}

export function CopiesEditor({
  pieceId, copies, formulas, closings, voice: savedVoice, closing: savedClosing, approved,
}: {
  pieceId: string; copies: CopyRow[]; formulas: { id: string; code: string; name: string; description: string }[];
  closings: string[]; voice: Voice; closing: Closing | null; approved: boolean;
}) {
  const { run, pending } = useAction();
  const { confirm, dialog } = useConfirm();
  const [voice, setVoice] = useState<Voice>(savedVoice);
  const [closingSel, setClosingSel] = useState(closingValue(savedClosing, closings));
  const [destination, setDestination] = useState(savedClosing?.kind === 'destination' ? savedClosing.text ?? '' : '');
  const closing: Closing = closingSel.startsWith('brand:')
    ? { kind: 'brand', text: closings[Number(closingSel.slice(6))] ?? closings[0] ?? '' }
    : closingSel === 'destination' ? { kind: 'destination', text: destination } : { kind: closingSel as Closing['kind'] };
  const byGroup = Object.fromEntries(copies.map((c) => [c.length_group, c.body])) as Partial<Record<Group, string>>;
  const [texts, setTexts] = useState<Record<Group, string>>({ long: byGroup.long ?? '', medium: byGroup.medium ?? '', short: byGroup.short ?? '' });
  const [formulaId, setFormulaId] = useState(copies[0]?.formula_id ?? formulas[0]?.id ?? '');
  const [missing, setMissing] = useState<string[]>([]);
  const [dirty, setDirty] = useState<Record<Group, boolean>>({ long: false, medium: false, short: false });
  const formula = formulas.find((f) => f.id === formulaId);

  return (
    <Card>
      <CardHeader title="Copies" subtitle="La misma fórmula en tres largos. Solo usan cifras de la ficha." />
      {dialog}
      <CardBody className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Fórmula" htmlFor="copy-formula">
            <Select id="copy-formula" value={formulaId} onChange={(e) => setFormulaId(e.target.value)}>
              {formulas.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
          </Field>
          <Field label="Voz" htmlFor="copy-voice" hint={VOICES[voice].hint}>
            <Select id="copy-voice" value={voice} onChange={(e) => setVoice(e.target.value as Voice)}>
              {(Object.keys(VOICES) as Voice[]).map((v) => <option key={v} value={v}>{VOICES[v].label}</option>)}
            </Select>
          </Field>
          <Field label="Cierre" htmlFor="copy-closing">
            <Select id="copy-closing" value={closingSel} onChange={(e) => setClosingSel(e.target.value)}>
              {closings.map((c, n) => <option key={c} value={`brand:${n}`}>«{c}»</option>)}
              <option value="question">Pregunta a la comunidad</option>
              <option value="destination">Acción con destino (enlace, teléfono o dirección)</option>
              <option value="none">Sin cierre</option>
            </Select>
          </Field>
          {closingSel === 'destination' ? (
            <Field label="Destino" htmlFor="copy-dest" hint="Tal cual va a salir. Ej.: Inscripciones en example.com/cancha" className="sm:col-span-3">
              <Input id="copy-dest" value={destination} maxLength={200} onChange={(e) => setDestination(e.target.value)} />
            </Field>
          ) : null}
        </div>
        <div>
          <Button
            type="button"
            disabled={pending || !formulaId}
            onClick={async () => {
              if (
                Object.values(texts).some(Boolean) &&
                !(await confirm({
                  title: '¿Reemplazar los copies?',
                  body: approved ? 'Se borran los tres copies actuales y la pieza vuelve a revisión.' : 'Se borran los tres copies actuales y se escriben de nuevo desde la ficha.',
                  confirmLabel: 'Reemplazar',
                }))
              )
                return;
              run(() => generateCopies({ pieceId, formulaId, voice, closing }), {
                onOk: (r) => {
                  if (!r.ok) return;
                  setMissing(r.data!.missing);
                  setTexts(r.data!.copies);
                  setDirty({ long: false, medium: false, short: false });
                  if (r.data!.note) toast.info(r.data!.note);
                  else toast.success(r.data!.by === 'ai' ? 'Copies escritos con IA. Revísalos.' : 'Copies listos desde la ficha. Revísalos.');
                  if (r.data!.reopened) toast.info('La pieza volvió a revisión.');
                },
              });
            }}
          >
            <Sparkles className="h-4 w-4" aria-hidden /> Escribir desde la ficha
          </Button>
        </div>
        {formula?.description ? <p className="text-sm text-text-2">{formula.description}</p> : null}
        {approved ? <p className="text-sm text-text-2">Ya está aprobada: si cambias un copy, vuelve a revisión.</p> : null}
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
                  <Button type="button" size="sm" variant={dirty[g] ? 'primary' : 'secondary'} disabled={pending || !dirty[g]} onClick={() => run(() => saveCopy({ pieceId, group: g, body: texts[g] }), { success: 'Copy guardado.', onOk: (r) => { setDirty({ ...dirty, [g]: false }); if (r.ok && r.data?.reopened) toast.info('La pieza volvió a revisión.'); } })}>
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
