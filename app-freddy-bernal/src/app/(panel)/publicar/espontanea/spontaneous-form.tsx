'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DateTime } from 'luxon';
import { registerSpontaneous } from '@/lib/actions/publications';
import { useAction } from '@/lib/hooks/use-action';
import { useDraft } from '@/lib/hooks/use-draft';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { Uploader } from '@/components/media/uploader';
import { MediaThumb } from '@/components/media/media-thumb';
import { NETWORK_LABEL } from '@/lib/data/labels';
import { TZ } from '@/lib/time';

const NETWORKS = ['instagram', 'tiktok', 'facebook', 'x', 'threads', 'youtube'] as const;

// What the day and time fields say, checked. An empty day (cleared, or half typed like
// "23/10/aaaa": the browser reports '') is an error, never read as today: what is saved is what is seen.
export function checkWhen(date: string, time: string, now: DateTime = DateTime.now()) {
  const today = now.setZone(TZ).toISODate()!;
  // Without a time, "now" is only right if it went out today; another day needs its time.
  const needsTime = !!date && date !== today && !time;
  // A typo in the year ("0026", "20266") is caught here: only the last two years, never a future day.
  const minDate = now.setZone(TZ).minus({ years: 2 }).toISODate()!;
  const day = DateTime.fromISO(date, { zone: TZ });
  const dateError = !date
    ? 'Pon el día en que salió.'
    : !day.isValid
      ? 'Revisa el día: la fecha no es válida.'
      : date > today
        ? 'Ese día todavía no ha llegado.'
        : date < minDate
          ? 'Revisa el año: solo se registran publicaciones de los últimos dos años.'
          : undefined;
  const at = date && time ? DateTime.fromISO(`${date}T${time}`, { zone: TZ }) : null;
  const timeError = needsTime
    ? 'Pon la hora: no salió hoy.'
    : at && !at.isValid
      ? 'Revisa la hora.'
      : at && !dateError && at > now
        ? 'Esa hora todavía no ha llegado.'
        : undefined;
  return { today, minDate, dateError, timeError, at };
}

export function SpontaneousForm() {
  const router = useRouter();
  const { run, pending } = useAction();
  const today = DateTime.now().setZone(TZ).toISODate()!;
  const { value: f, setValue: setF, restored, clear } = useDraft('spontaneous', { network: 'instagram', title: '', url: '', date: today, time: '' });
  // The screenshot of the post (optional): uploaded now, saved with the post, and its picture in Resultados.
  // Kept out of the draft: a file id from another day is not worth restoring.
  const [evidence, setEvidence] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  // A draft from another day (or with the day left empty) and nothing else typed starts again on today.
  useEffect(() => {
    if (restored && (!f.date || f.date < today) && !f.title && !f.url && !f.time) setF({ ...f, date: today });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored]);
  const date = f.date;
  const { minDate, dateError, timeError, at } = checkWhen(date, f.time);

  return (
    <Card>
      <CardBody className="grid gap-4 sm:grid-cols-2">
        <Field label="Red" htmlFor="sp-net">
          <Select id="sp-net" value={f.network} onChange={set('network')}>
            {NETWORKS.map((n) => <option key={n} value={n}>{NETWORK_LABEL[n]}</option>)}
          </Select>
        </Field>
        <Field label="Link de la publicación" htmlFor="sp-url">
          <Input id="sp-url" type="url" inputMode="url" placeholder="https://" value={f.url} onChange={set('url')} />
        </Field>
        <Field label="¿De qué se trató?" htmlFor="sp-title" hint="Corto. Ej.: Video del jefe recorriendo la vía" className="sm:col-span-2">
          <Input id="sp-title" value={f.title} maxLength={140} onChange={set('title')} />
        </Field>
        <Field label="Día en que salió" htmlFor="sp-date" error={dateError}>
          <Input id="sp-date" type="date" value={f.date} min={minDate} max={today} onChange={set('date')} />
        </Field>
        <Field label="Hora en que salió (Táchira)" htmlFor="sp-time" hint={date === today ? 'Vacía = ahora.' : 'Obligatoria si no salió hoy.'} error={timeError}>
          <Input id="sp-time" type="time" value={f.time} required={date !== today} onChange={set('time')} />
        </Field>
        <div className="sm:col-span-2">
          {evidence ? (
            <div className="flex flex-wrap items-center gap-3">
              <MediaThumb ids={[evidence]} mime="image/jpeg" className="h-20 w-16" />
              <p className="text-sm text-ok">Captura lista: sale como miniatura en Resultados.</p>
              <Button variant="ghost" onClick={() => setEvidence(null)}>Cambiar la captura</Button>
            </div>
          ) : (
            <Uploader
              kind="evidence"
              accept="image/*"
              multiple={false}
              compact
              label="Subir una captura (opcional)"
              hint="Una foto de la pantalla con la publicación: sale como miniatura en Resultados."
              onUploaded={(a) => setEvidence(a.id)}
            />
          )}
        </div>
        <p className="text-sm text-text-2 sm:col-span-2">No pasa por aprobación porque ya salió. Desde aquí no se publica nada.</p>
        <div className="sm:col-span-2">
          <Button
            disabled={pending || !!dateError || !!timeError}
            onClick={() =>
              run(
                () => registerSpontaneous({
                  network: f.network,
                  title: f.title,
                  url: f.url,
                  publishedAt: at ? at.toUTC().toISO() : null,
                  evidenceId: evidence,
                }),
                { success: 'Registrada.', refresh: false, onOk: (r) => { if (r.ok) { clear(); router.push(`/publicar/${r.data!.id}`); } } },
              )
            }
          >
            Registrar
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
