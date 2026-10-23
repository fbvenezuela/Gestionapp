import { redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { getSession } from '@/lib/auth/session';
import { mfaStart } from '@/lib/auth/actions';
import { Card, CardBody } from '@/components/ui/card';
import { MfaForm } from './mfa-form';

export const metadata = { title: 'Doble factor' };

export default async function MfaPage() {
  const s = await getSession();
  if (!s) redirect('/entrar');
  if (s.mfaOk) redirect('/');
  const st = await mfaStart();
  const qr = st.qr ?? (st.uri ? await QRCode.toDataURL(st.uri, { margin: 1, width: 220 }) : null);

  if (st.enrolled) {
    return (
      <Card>
        <CardBody className="flex flex-col gap-4">
          <h1 className="text-xl font-bold">Código de tu aplicación</h1>
          <p className="text-[15px] text-text-2">Abre la aplicación de códigos de tu teléfono y escribe el código de 6 números que se ve ahora.</p>
          <MfaForm factorId={st.factorId} />
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody className="flex flex-col gap-5">
        <div>
          <h1 className="text-xl font-bold">Protege tu cuenta (una sola vez)</h1>
          <p className="mt-1 text-[15px] text-text-2">Tu rol ve información delicada. Además del código del correo, vas a usar un código de tu teléfono.</p>
        </div>
        <ol className="flex flex-col gap-4">
          <li>
            <p className="font-semibold">1. Instala una aplicación de códigos</p>
            <p className="text-[15px] text-text-2">Google Authenticator o Microsoft Authenticator (gratis, en Play Store o App Store).</p>
          </li>
          <li>
            <p className="font-semibold">2. Escanea este código</p>
            <p className="text-[15px] text-text-2">En la aplicación toca «+» y luego «Escanear código QR».</p>
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="Código QR para la aplicación de códigos" width={220} height={220} className="mt-3 rounded-[var(--radius-control)] border border-border bg-surface p-2" />
            ) : null}
            {st.secret ? (
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer font-medium text-text-2">¿No puedes escanear? Escribe esta clave</summary>
                <code className="mt-1 block break-all rounded bg-surface-2 p-2 font-mono">{st.secret}</code>
              </details>
            ) : null}
          </li>
          <li>
            <p className="font-semibold">3. Escribe el código que aparece</p>
            <MfaForm factorId={st.factorId} />
          </li>
        </ol>
      </CardBody>
    </Card>
  );
}
