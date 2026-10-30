'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { saveSetting } from '@/lib/actions/settings';
import { restorePiece } from '@/lib/actions/redes';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { FORMAT, QUOTA_FORMATS, type QuotaFormat } from '@/lib/domain/redes';

type Tone = 'neutral' | 'info' | 'accent' | 'ok';
type Pillar = { key: string; name: string; tone: Tone };
type Row = { key: string | null; name: string; tone: Tone };

// The pillars' colours: the chips' tones of tokens.css (D-68), named as they look.
export const TONE_LABEL: Record<Tone, string> = { neutral: 'Gris', info: 'Azul', accent: 'Oliva', ok: 'Verde' };
export const MAX_PILLARS = 12;

/** A new pillar's key, from its name: lowercase letters, numbers and dashes, up to 40, never one already taken. It never
 * changes after (renaming a pillar keeps it on its pieces). */
export function pillarKey(name: string, taken: readonly string[]): string {
  const base =
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 34)
      .replace(/-+$/, '') || 'pilar';
  let key = base;
  for (let n = 2; taken.includes(key); n++) key = `${base}-${n}`;
  return key;
}

/** What is saved: the rows in order, each with its key (the new ones get one now). */
export function pillarsToSave(rows: readonly Row[]): Pillar[] {
  const taken = rows.flatMap((r) => (r.key ? [r.key] : []));
  return rows.map((r) => {
    if (r.key) return { key: r.key, name: r.name.trim(), tone: r.tone };
    const key = pillarKey(r.name, taken);
    taken.push(key);
    return { key, name: r.name.trim(), tone: r.tone };
  });
}

export function ContentSettings({ quotas, pillars }: { quotas: Record<QuotaFormat, number>; pillars: Pillar[] }) {
  const { run, pending } = useAction();
  const [q, setQ] = useState<Record<QuotaFormat, string>>(() => Object.fromEntries(QUOTA_FORMATS.map((f) => [f, String(quotas[f])])) as Record<QuotaFormat, string>);
  const [rows, setRows] = useState<Row[]>(pillars.map((p) => ({ key: p.key, name: p.name, tone: p.tone })));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
  };
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Cupo del mes" subtitle="Cuántas piezas de cada formato se planean por mes. Es informativo: pasarse no bloquea nada. Fin de mes no tiene cupo." />
        <CardBody className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 min-[480px]:grid-cols-3">
            {QUOTA_FORMATS.map((f) => (
              <Field key={f} label={FORMAT[f].plural} htmlFor={`cupo-${f}`} className="min-w-0">
                <Input id={`cupo-${f}`} type="number" inputMode="numeric" min={0} max={200} step={1} value={q[f]} className="w-full min-w-0" onChange={(e) => setQ({ ...q, [f]: e.target.value })} />
              </Field>
            ))}
          </div>
          <Button
            disabled={pending}
            className="self-start"
            onClick={() => run(() => saveSetting({ key: 'redes.quotas', value: Object.fromEntries(QUOTA_FORMATS.map((f) => [f, Number(q[f])])) }), { success: 'Cupo guardado.' })}
          >
            Guardar cupo
          </Button>
        </CardBody>
      </Card>

      <Card solid>
        <CardHeader title="Pilares" subtitle="Los temas del contenido; cada pieza lleva uno. Cambiarle el nombre no lo quita de sus piezas; si lo quitas, quedan «Sin pilar»." />
        <CardBody className="flex flex-col gap-3">
          {rows.length ? (
            <ol className="flex flex-col gap-3">
              {rows.map((r, i) => (
                <li key={r.key ?? `new-${i}`} className="grid min-w-0 grid-cols-1 gap-2 rounded-[var(--radius-control)] border border-border p-3 min-[480px]:grid-cols-[minmax(0,1fr)_9rem]">
                  <Field label={`Pilar ${i + 1}`} htmlFor={`pilar-${i}`} className="min-w-0">
                    <Input id={`pilar-${i}`} value={r.name} maxLength={40} className="w-full min-w-0" onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} />
                  </Field>
                  <Field label="Color" htmlFor={`pilar-${i}-tone`} className="min-w-0">
                    <Select id={`pilar-${i}-tone`} value={r.tone} className="w-full min-w-0" onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, tone: e.target.value as Tone } : x)))}>
                      {(Object.keys(TONE_LABEL) as Tone[]).map((t) => <option key={t} value={t}>{TONE_LABEL[t]}</option>)}
                    </Select>
                  </Field>
                  <div className="flex flex-wrap gap-1 min-[480px]:col-span-2">
                    <Button type="button" variant="ghost" size="icon" aria-label={`Subir el pilar ${i + 1}`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" aria-hidden /></Button>
                    <Button type="button" variant="ghost" size="icon" aria-label={`Bajar el pilar ${i + 1}`} disabled={i === rows.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" aria-hidden /></Button>
                    <Button type="button" variant="ghost" size="icon" aria-label={`Quitar el pilar ${i + 1}`} onClick={() => setRows(rows.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" aria-hidden /></Button>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-[15px] text-text-2">Todavía no hay pilares. Agrega los del equipo.</p>
          )}
          <Button type="button" variant="secondary" className="self-start" disabled={rows.length >= MAX_PILLARS} onClick={() => setRows([...rows, { key: null, name: '', tone: 'neutral' }])}>
            <Plus className="h-4 w-4" aria-hidden /> Agregar pilar
          </Button>
          {rows.length >= MAX_PILLARS ? <p className="text-sm text-text-2">Hasta {MAX_PILLARS} pilares.</p> : null}
          <Button
            className="self-start"
            disabled={pending || rows.some((r) => !r.name.trim())}
            onClick={() => run(() => saveSetting({ key: 'redes.pillars', value: pillarsToSave(rows) }), { success: 'Pilares guardados.' })}
          >
            Guardar pilares
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}

type Deleted = { id: string; title: string; format: string; month: string | null; ago: string };

// «Piezas eliminadas» (D-70, I4): only the boss deletes (with 2FA); administración brings a piece back with «Recuperar»:
// to its month (the first one if its month is gone), without a feed place.
export function DeletedPieces({ pieces }: { pieces: Deleted[] }) {
  const { run, pending } = useAction();
  return (
    <Card solid>
      <CardHeader title="Piezas eliminadas" subtitle="Las que eliminó el jefe. «Recuperar» la devuelve a su mes, sin espacio en el feed." />
      {pieces.length ? (
        <ul className="divide-y divide-border">
          {pieces.map((p) => (
            <li key={p.id} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <span className="min-w-0 flex-1 basis-48">
                <span className="block break-words font-semibold">{p.title}</span>
                <span className="block text-sm text-text-2">
                  {p.format} · {p.month ? p.month : 'su mes ya no está: va al primero'} · Eliminada {p.ago}
                </span>
              </span>
              <Button type="button" variant="secondary" disabled={pending} aria-label={`Recuperar «${p.title}»`} onClick={() => run(() => restorePiece({ pieceId: p.id }))}>
                <RotateCcw className="h-4 w-4" aria-hidden /> Recuperar
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="p-4 text-[15px] text-text-2">No hay piezas eliminadas.</p>
      )}
    </Card>
  );
}
