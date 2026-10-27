'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DateTime } from 'luxon';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { createPublications } from '@/lib/actions/publications';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import type { NetworkCheck } from '@/lib/data/publish';
import { NETWORK_LABEL } from '@/lib/data/labels';
import { windowHint, windowWarnings, type PublishingWindows } from '@/lib/domain/publishing-windows';
import { TZ, fmtDateTime } from '@/lib/time';
import { cn } from '@/lib/cn';

export function NewPublication({
  approved, pieceId, pieceTitle, pieceStatus, checks, collaborators, windows, republishOf, pastPubs,
}: { approved: { id: string; title: string }[]; pieceId: string; pieceTitle: string; pieceStatus: string; checks: NetworkCheck[]; collaborators: string[]; windows: PublishingWindows; republishOf: string | null; pastPubs: { id: string; network: string; published_at: string | null }[] }) {
  const router = useRouter();
  const { run, pending } = useAction();
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [date, setDate] = useState(DateTime.now().setZone(TZ).toISODate()!);
  const [time, setTime] = useState('');
  const [collabs, setCollabs] = useState(collaborators.join(', '));
  const [repub, setRepub] = useState(republishOf ?? '');

  if (!pieceId || pieceStatus !== 'approved') {
    return (
      <Card>
        <CardBody>
          {pieceId && pieceStatus !== 'approved' ? <p className="mb-3 text-danger">«{pieceTitle}» todavía no está aprobada por el jefe.</p> : null}
          <Field label="¿Qué pieza vas a publicar?" htmlFor="pp">
            <Select id="pp" defaultValue="" onChange={(e) => e.target.value && router.push(`/publicar/nueva?pieza=${e.target.value}`)}>
              <option value="">Elegir pieza aprobada…</option>
              {approved.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </Select>
          </Field>
        </CardBody>
      </Card>
    );
  }

  const chosen = checks.filter((c) => selected[c.network]);
  const blocking = chosen.some((c) => c.issues.some((i) => i.level === 'error'));
  const at = time ? DateTime.fromISO(`${date}T${time}`, { zone: TZ }) : null;
  const timing = at?.isValid ? chosen.flatMap((c) => windowWarnings(c.label, windows[c.network], at)) : [];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader title={pieceTitle} subtitle="Elige las redes. Las que tienen problemas dicen qué arreglar." />
        <ul className="divide-y divide-border">
          {checks.map((c) => {
            const errors = c.issues.filter((i) => i.level === 'error');
            const warns = c.issues.filter((i) => i.level === 'warn');
            const on = !!selected[c.network];
            return (
              <li key={c.network} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex min-h-11 flex-1 items-center gap-3">
                    <input type="checkbox" className="h-5 w-5 accent-accent" checked={on} onChange={(e) => setSelected((s) => { const n = { ...s }; if (e.target.checked) n[c.network] = c.format; else delete n[c.network]; return n; })} />
                    <span className="font-semibold">{c.label}</span>
                    {errors.length ? <XCircle className="h-5 w-5 text-danger" aria-label="No pasa" /> : warns.length ? <AlertTriangle className="h-5 w-5 text-warn" aria-label="Revisar" /> : <CheckCircle2 className="h-5 w-5 text-ok" aria-label="Todo bien" />}
                  </label>
                  {c.formats.length > 1 ? (
                    <Select aria-label={`Formato en ${c.label}`} value={selected[c.network] ?? c.format} disabled={!on} onChange={(e) => setSelected((s) => ({ ...s, [c.network]: e.target.value }))} className="w-auto">
                      {c.formats.map((f) => <option key={f}>{f}</option>)}
                    </Select>
                  ) : null}
                </div>
                {c.issues.length ? (
                  <ul className="mt-1 flex flex-col gap-1 pl-8">
                    {c.issues.map((i, k) => <li key={k} className={cn('text-sm', i.level === 'error' ? 'text-danger' : 'text-warn')}>{i.text}</li>)}
                  </ul>
                ) : <p className="pl-8 text-sm text-ok">Todo bien para {c.label}.</p>}
                {windowHint(windows[c.network]) ? <p className="pl-8 text-sm text-text-2">🕒 {windowHint(windows[c.network])}</p> : null}
                {on && c.copy ? <details className="mt-2 pl-8 text-sm"><summary className="cursor-pointer text-text-2">Ver el copy que va</summary><p className="mt-1 whitespace-pre-wrap">{c.copy}</p></details> : null}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Día" htmlFor="pd"><Input id="pd" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Hora (Táchira)" htmlFor="pt" hint="Déjala vacía para guardarla como borrador."><Input id="pt" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
          {timing.length ? (
            <ul className="flex flex-col gap-1 sm:col-span-2" aria-live="polite">
              {timing.map((t) => <li key={t} className="flex items-start gap-2 text-sm text-warn"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{t}</li>)}
            </ul>
          ) : null}
          <Field label="Colaboradores a invitar" htmlFor="pc" hint="Separados por coma. Ej.: @gobernacion, @otro_gobernador" className="sm:col-span-2">
            <Input id="pc" value={collabs} onChange={(e) => setCollabs(e.target.value)} />
          </Field>
          {pastPubs.length ? (
            <Field label="¿Es una republicación?" htmlFor="pr" hint="Para comparar la misma pieza a otra hora o con otra portada." className="sm:col-span-2">
              <Select id="pr" value={repub} onChange={(e) => setRepub(e.target.value)}>
                <option value="">No, es la primera vez</option>
                {pastPubs.map((p) => <option key={p.id} value={p.id}>Sí, de la de {NETWORK_LABEL[p.network]} del {fmtDateTime(p.published_at)}</option>)}
              </Select>
            </Field>
          ) : null}
        </CardBody>
      </Card>

      <div className="sticky bottom-20 z-10 lg:bottom-4">
        <Button
          size="lg"
          className="w-full sm:w-auto"
          disabled={pending || !chosen.length || blocking}
          onClick={() =>
            run(
              () =>
                createPublications({
                  pieceId,
                  items: Object.entries(selected).map(([network, format]) => ({ network, format })),
                  scheduledAt: time ? DateTime.fromISO(`${date}T${time}`, { zone: TZ }).toUTC().toISO() : null,
                  collaborators: collabs.split(',').map((x) => x.trim()).filter(Boolean),
                  republishOf: repub || null,
                }),
              { success: time ? 'Publicación programada.' : 'Guardada como borrador.', refresh: false, onOk: (r) => r.ok && router.push(r.data!.ids.length === 1 ? `/publicar/${r.data!.ids[0]}` : '/publicar') },
            )
          }
        >
          {blocking ? 'Arregla lo marcado en rojo' : time ? `Programar en ${chosen.length || ''} ${chosen.length === 1 ? 'red' : 'redes'}` : 'Guardar como borrador'}
        </Button>
      </div>
    </div>
  );
}
