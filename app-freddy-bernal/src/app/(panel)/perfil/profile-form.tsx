'use client';

import { useState } from 'react';
import { Moon, ShieldCheck } from 'lucide-react';
import { updateProfile } from '@/lib/actions/profile';
import { useAction } from '@/lib/hooks/use-action';
import { OPT_IN_KINDS, QUIET_DEFAULT } from '@/lib/push/quiet';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';

// Critical notices (assigned event, changes requested, failed publication, tweets
// running out) cannot be turned off. These switches apply to email and phone alike.
const OPTIONAL = [
  { key: 'material_ready', label: 'Llegó material nuevo' },
  { key: 'recording_note', label: 'Grabación dejó su nota o su storyboard' },
  { key: 'review_pending', label: 'Hay algo por aprobar' },
  { key: 'piece_approved', label: 'Aprobaron una pieza' },
  { key: 'voice_line', label: 'Hay que pedir una frase al jefe' },
  { key: 'event_new', label: 'Hay un evento nuevo por decidir' },
  { key: 'event_decided', label: 'El jefe decidió un evento' },
  { key: 'to_schedule', label: 'Hay una ficha por ponerle fecha' },
  { key: 'agenda_scheduled', label: 'Una ficha ya tiene fecha' },
  { key: 'agenda_overwritten', label: 'Alguien cambió lo mismo que yo en la agenda' },
  { key: 'agenda_changed', label: 'Cada cambio del otro en la agenda (apagado si no lo prendes)' },
  { key: 'assistant_notice', label: 'Avisos del equipo preparados con 360' },
  { key: 'daily_digest', label: 'Resumen diario por correo' },
];

type Prefs = Record<string, boolean | string>;

export function ProfileForm({ fullName, phone, prefs, mfa }: { fullName: string; phone: string; prefs: Prefs; mfa: boolean }) {
  const { run, pending } = useAction();
  const [f, setF] = useState({ fullName, phone, prefs });
  const set = (k: string, v: boolean | string) => setF({ ...f, prefs: { ...f.prefs, [k]: v } });
  const quietOn = f.prefs.quiet !== false;
  const quietFrom = typeof f.prefs.quiet_from === 'string' ? f.prefs.quiet_from : QUIET_DEFAULT.from;
  const quietTo = typeof f.prefs.quiet_to === 'string' ? f.prefs.quiet_to : QUIET_DEFAULT.to;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Mis datos" />
        <CardBody className="flex flex-col gap-3">
          <Field label="Nombre" htmlFor="pn"><Input id="pn" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></Field>
          <Field label="Teléfono (opcional)" htmlFor="pp"><Input id="pp" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <p className="flex items-center gap-2 text-sm text-text-2"><ShieldCheck className="h-4 w-4" aria-hidden /> Doble factor: {mfa ? 'activo en esta sesión' : 'no usado en esta sesión'}</p>
        </CardBody>
      </Card>
      <Card data-tour="notify-prefs">
        <CardHeader title="Qué avisos quiero" subtitle="Por correo y en el teléfono. Los importantes siempre llegan." />
        <CardBody className="flex flex-col gap-1">
          {OPTIONAL.map((o) => (
            <label key={o.key} className="flex min-h-11 items-center gap-3 text-[15px]">
              <input type="checkbox" className="h-5 w-5 accent-accent" checked={OPT_IN_KINDS.has(o.key) ? f.prefs[o.key] === true : f.prefs[o.key] !== false} onChange={(e) => set(o.key, e.target.checked)} />
              {o.label}
            </label>
          ))}
        </CardBody>
      </Card>
      <Card data-tour="quiet-hours">
        <CardHeader title="Horas de silencio" subtitle="De noche el teléfono no suena. Los avisos importantes sí llegan y todo queda en «Avisos»." />
        <CardBody className="flex flex-col gap-3">
          <label className="flex min-h-11 items-center gap-3 text-[15px]">
            <input type="checkbox" className="h-5 w-5 accent-accent" checked={quietOn} onChange={(e) => set('quiet', e.target.checked)} />
            <Moon className="h-4 w-4" aria-hidden /> No mandar avisos al teléfono de noche
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Desde" htmlFor="qf"><Input id="qf" type="time" step={900} required value={quietFrom} disabled={!quietOn} onChange={(e) => e.target.value && set('quiet_from', e.target.value.slice(0, 5))} /></Field>
            <Field label="Hasta" htmlFor="qt"><Input id="qt" type="time" step={900} required value={quietTo} disabled={!quietOn} onChange={(e) => e.target.value && set('quiet_to', e.target.value.slice(0, 5))} /></Field>
          </div>
        </CardBody>
      </Card>
      <div className="lg:col-span-2"><Button size="lg" disabled={pending} onClick={() => run(() => updateProfile(f), { success: 'Guardado.' })}>Guardar</Button></div>
    </div>
  );
}
