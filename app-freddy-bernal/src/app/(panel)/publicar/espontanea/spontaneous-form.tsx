'use client';

import { useRouter } from 'next/navigation';
import { DateTime } from 'luxon';
import { registerSpontaneous } from '@/lib/actions/publications';
import { useAction } from '@/lib/hooks/use-action';
import { useDraft } from '@/lib/hooks/use-draft';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { NETWORK_LABEL } from '@/lib/data/labels';
import { TZ } from '@/lib/time';

const NETWORKS = ['instagram', 'tiktok', 'facebook', 'x', 'threads', 'youtube'] as const;

export function SpontaneousForm() {
  const router = useRouter();
  const { run, pending } = useAction();
  const { value: f, setValue: setF, clear } = useDraft('spontaneous', { network: 'instagram', title: '', url: '', date: DateTime.now().setZone(TZ).toISODate()!, time: '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

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
        <Field label="Día en que salió" htmlFor="sp-date"><Input id="sp-date" type="date" value={f.date} onChange={set('date')} /></Field>
        <Field label="Hora en que salió (Táchira)" htmlFor="sp-time" hint="Vacía = ahora."><Input id="sp-time" type="time" value={f.time} onChange={set('time')} /></Field>
        <p className="text-sm text-text-2 sm:col-span-2">No pasa por aprobación porque ya salió. Desde aquí no se publica nada.</p>
        <div className="sm:col-span-2">
          <Button
            disabled={pending}
            onClick={() =>
              run(
                () => registerSpontaneous({
                  network: f.network,
                  title: f.title,
                  url: f.url,
                  publishedAt: f.date && f.time ? DateTime.fromISO(`${f.date}T${f.time}`, { zone: TZ }).toUTC().toISO() : null,
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
