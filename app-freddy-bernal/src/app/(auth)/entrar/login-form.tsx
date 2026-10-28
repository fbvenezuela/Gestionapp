'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { Mail, KeyRound, Inbox } from 'lucide-react';
import { demoQuickLogin, requestCode, verifyCode, type ActionState } from '@/lib/auth/actions';
import { EMAIL_CODE } from '@/lib/auth/code-format';
import { demoInbox } from '@/lib/auth/demo-inbox';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';

type DemoUser = { email: string; label: string; name: string };

export function LoginForm({ demoUsers, quick }: { demoUsers: DemoUser[] | null; quick: boolean }) {
  const [reqState, reqAction, reqPending] = useActionState<ActionState, FormData>(requestCode, {});
  const [verState, verAction, verPending] = useActionState<ActionState, FormData>(verifyCode, {});
  const [email, setEmail] = useState('');
  const [inbox, setInbox] = useState<{ subject: string; text: string; at: string }[]>([]);
  const [quickPending, startQuick] = useTransition();
  const [quickError, setQuickError] = useState('');
  const step = reqState.ok ? 'code' : 'email';
  const sentTo = reqState.data?.email ?? email;

  useEffect(() => {
    if (demoUsers && reqState.ok && sentTo) demoInbox(sentTo).then(setInbox);
  }, [demoUsers, reqState, sentTo]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardBody className="flex flex-col gap-4">
          {step === 'email' ? (
            <form action={reqAction} className="flex flex-col gap-4">
              <h1 className="text-xl font-bold">Entrar</h1>
              <p className="text-[15px] text-text-2">Escribe tu correo y te mandamos un código. No hay contraseña.</p>
              <Field label="Correo" htmlFor="email" error={reqState.error}>
                <Input id="email" name="email" type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@correo.com" />
              </Field>
              <Button type="submit" size="lg" disabled={reqPending}>
                <Mail className="h-5 w-5" aria-hidden /> {reqPending ? 'Enviando…' : 'Mandarme el código'}
              </Button>
            </form>
          ) : (
            <form action={verAction} className="flex flex-col gap-4">
              <h1 className="text-xl font-bold">Escribe el código</h1>
              <p className="text-[15px] text-text-2" role="status">{reqState.info}</p>
              <input type="hidden" name="email" value={sentTo} />
              <Field label="Código del correo" htmlFor="code" error={verState.error}>
                <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern={EMAIL_CODE.pattern} maxLength={EMAIL_CODE.max} required autoFocus className="text-center font-mono text-2xl tracking-[0.25em]" />
              </Field>
              <Button type="submit" size="lg" disabled={verPending}>
                <KeyRound className="h-5 w-5" aria-hidden /> {verPending ? 'Entrando…' : 'Entrar'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => location.reload()}>
                Usar otro correo
              </Button>
            </form>
          )}
        </CardBody>
      </Card>

      {demoUsers && step === 'code' && inbox.length > 0 ? (
        <Card className="border-info/40 bg-info-soft">
          <CardBody>
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-info">
              <Inbox className="h-4 w-4" aria-hidden /> Buzón de prueba (solo en la demostración)
            </p>
            {inbox.map((m, i) => (
              <div key={i} className="text-sm">
                <p className="font-semibold">{m.subject}</p>
                <p className="text-text-2">Llegó a las {m.at}</p>
              </div>
            ))}
          </CardBody>
        </Card>
      ) : null}

      {demoUsers && step === 'email' ? (
        <Card>
          <CardBody>
            <p className="mb-1 text-sm font-semibold">Versión de demostración</p>
            <p className="mb-3 text-sm text-text-2">
              {quick
                ? 'Los datos son inventados. Toca un rol para entrar directo, sin código ni doble factor (solo mientras probamos).'
                : 'Los datos son inventados. Toca un usuario para probar cada rol; el código aparece aquí mismo.'}
            </p>
            {quickError ? <p className="mb-2 text-sm font-medium text-danger" role="alert">{quickError}</p> : null}
            {/* One column that can shrink (minmax(0, 1fr)): an auto column would take the width of the longest
                «name · email» line and push the rows past a 360 px phone. */}
            <ul className="grid grid-cols-1 gap-2">
              {demoUsers.map((u) => (
                <li key={u.email}>
                  <button
                    type="button"
                    disabled={quickPending}
                    aria-label={quick ? `Entrar como ${u.label} (${u.email})` : undefined}
                    onClick={() => {
                      if (!quick) return setEmail(u.email);
                      setQuickError('');
                      startQuick(async () => {
                        const r = await demoQuickLogin(u.email);
                        if (r?.error) setQuickError(r.error);
                      });
                    }}
                    className="flex min-h-11 w-full items-center justify-between gap-2 rounded-[var(--radius-control)] border border-border px-3 text-left text-sm hover:bg-surface-2 disabled:opacity-60"
                  >
                    <span className="min-w-0">
                      <span className="block font-semibold">{u.label}</span>
                      {quick ? <span className="block truncate text-text-2">{u.name} · {u.email}</span> : null}
                    </span>
                    <span className={quick ? 'shrink-0 text-text-2' : 'min-w-0 truncate text-text-2'}>{quick ? 'Entrar →' : u.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
