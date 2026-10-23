'use client';

import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { updateProfile } from '@/lib/actions/profile';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';

// Critical notices (assigned event, changes requested, failed publication, tweets
// running out) cannot be turned off.
const OPTIONAL = [
  { key: 'material_ready', label: 'Llegó material nuevo' },
  { key: 'review_pending', label: 'Hay algo por aprobar' },
  { key: 'piece_approved', label: 'Aprobaron una pieza' },
  { key: 'voice_line', label: 'Hay que pedir una frase al jefe' },
  { key: 'daily_digest', label: 'Resumen diario por correo' },
];

export function ProfileForm({ fullName, phone, prefs, mfa }: { fullName: string; phone: string; prefs: Record<string, boolean>; mfa: boolean }) {
  const { run, pending } = useAction();
  const [f, setF] = useState({ fullName, phone, prefs });
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
      <Card>
        <CardHeader title="Avisos por correo" subtitle="Los importantes no se pueden apagar." />
        <CardBody className="flex flex-col gap-1">
          {OPTIONAL.map((o) => (
            <label key={o.key} className="flex min-h-11 items-center gap-3 text-[15px]">
              <input type="checkbox" className="h-5 w-5 accent-accent" checked={o.key === 'daily_digest' ? f.prefs[o.key] === true : f.prefs[o.key] !== false} onChange={(e) => setF({ ...f, prefs: { ...f.prefs, [o.key]: e.target.checked } })} />
              {o.label}
            </label>
          ))}
        </CardBody>
      </Card>
      <div><Button size="lg" disabled={pending} onClick={() => run(() => updateProfile(f), { success: 'Guardado.' })}>Guardar</Button></div>
    </div>
  );
}
