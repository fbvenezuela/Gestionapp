import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { mfaStatus } from '@/lib/auth/mfa';
import { Card, CardBody } from '@/components/ui/card';
import { MfaForm } from './mfa-form';
import { MfaSetup } from './mfa-setup';

export const metadata = { title: 'Doble factor' };

export default async function MfaPage() {
  const s = await getSession();
  if (!s) redirect('/entrar');
  if (s.mfaOk) redirect('/');
  // Read only: drawing this page never enrolls. The QR is made when the person taps the button.
  const st = await mfaStatus(s.userId);

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
        <MfaSetup />
      </CardBody>
    </Card>
  );
}
