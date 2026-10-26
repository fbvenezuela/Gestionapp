'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { QrCode } from 'lucide-react';
import { mfaEnroll, type MfaSetup as SetupState } from '@/lib/auth/actions';
import { Button } from '@/components/ui/button';
import { MfaForm } from './mfa-form';

// First-time 2FA. The QR is made only when the person taps the button, so a reload never
// replaces the factor they already scanned. After a reload they tap again and scan the new QR.
export function MfaSetup() {
  const [st, action, pending] = useActionState<SetupState, FormData>(mfaEnroll, {});
  const router = useRouter();
  const shown = useRef<HTMLDivElement>(null);

  // The button goes away when the QR appears: move focus to the QR, not to the code box (the
  // phone keyboard would cover the QR).
  useEffect(() => {
    if (st.qr) shown.current?.focus();
  }, [st.qr]);
  // Verified meanwhile (another tab): the page now only asks for the code.
  useEffect(() => {
    if (st.enrolled) router.refresh();
  }, [st.enrolled, router]);

  return (
    <ol className="flex flex-col gap-4">
      <li>
        <p className="font-semibold">1. Instala una aplicación de códigos</p>
        <p className="text-[15px] text-text-2">Google Authenticator o Microsoft Authenticator (gratis, en Play Store o App Store).</p>
      </li>
      <li>
        <p id="mfa-scan" className="font-semibold">2. Escanea el código QR</p>
        {st.qr ? (
          <div ref={shown} tabIndex={-1} role="group" aria-labelledby="mfa-scan" className="outline-none">
            <p className="text-[15px] text-text-2">En la aplicación toca «+» y luego «Escanear código QR».</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={st.qr} alt="Código QR para la aplicación de códigos" width={220} height={220} className="mt-3 rounded-[var(--radius-control)] border border-border bg-surface p-2" />
            {st.secret ? (
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer font-medium text-text-2">¿No puedes escanear? Escribe esta clave</summary>
                <code className="mt-1 block break-all rounded bg-surface-2 p-2 font-mono">{st.secret}</code>
              </details>
            ) : null}
            <p className="mt-3 text-sm text-text-2">
              Escribe el código antes de salir de esta página. Si la recargas, toca otra vez «Mostrar el código QR» y escanea el nuevo: el de
              ahora deja de servir.
            </p>
          </div>
        ) : (
          <form action={action} className="mt-2 flex flex-col gap-3">
            <p className="text-[15px] text-text-2">Con la aplicación abierta, toca el botón y aparece el código.</p>
            <Button type="submit" size="lg" disabled={pending}>
              <QrCode className="h-5 w-5" aria-hidden /> {pending ? 'Preparando…' : 'Mostrar el código QR'}
            </Button>
            {st.error ? (
              <p className="text-sm font-medium text-danger" role="alert">
                {st.error}
              </p>
            ) : null}
          </form>
        )}
      </li>
      <li>
        <p className="font-semibold">3. Escribe el código que aparece</p>
        {st.qr ? <MfaForm factorId={st.factorId} /> : <p className="text-[15px] text-text-2">Aparece en la aplicación después de escanear.</p>}
      </li>
    </ol>
  );
}
