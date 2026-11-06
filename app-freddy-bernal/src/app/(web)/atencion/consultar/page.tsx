import type { Metadata } from 'next';
import { EXPIRED_TEXT, maxAttachmentBytes } from '@/lib/actions/participation-core';
import { Band, Notice, PageIntro, Panel } from '@/components/participation/kit';
import { ParticipationNav } from '@/components/participation/participation-nav';
import { LookupForm } from '@/components/participation/lookup-form';
import { CaseView } from '@/components/participation/case-view';
import { FocusOnMount } from '@/components/participation/focus-on-mount';
import { loadConsultation } from '../_lib/data';
import { DemoDataWarning } from '@/components/participation/demo-warning';
import { isDemo } from '@/lib/env';

export const metadata: Metadata = {
  title: 'Consultar mi solicitud',
  description: 'Mira cómo va tu solicitud con tu código y tu clave.',
  // Never indexed, never cached: it shows a person's own request (design §2, §4).
  robots: { index: false, follow: false, nocache: true },
};

// «Consultar mi solicitud» (design §4). Without a consultation: the form (POST of the code and the secret). With the
// short sealed cookie this browser got from a lookup that found the request: only what the database gives back to the
// receipt. Dynamic (it reads the cookie); nothing of it goes into a shared cache.
export default async function ConsultPage() {
  const c = await loadConsultation();

  if (c.status === 'ok') {
    return (
      <div className="w-full bg-ivory text-text">
        <Band inner="max-w-3xl">
          <ParticipationNav current="consultar" />
          <FocusOnMount targetId="caso-titulo" />
          <DemoDataWarning demo={isDemo()} className="mb-6" />
          <CaseView view={c.view} maxFileBytes={maxAttachmentBytes()} />
        </Band>
      </div>
    );
  }

  const notice = c.status === 'gone' ? EXPIRED_TEXT : c.status === 'error' ? c.error : null;
  return (
    <div className="w-full bg-ivory text-text">
      <Band className="pb-4 sm:pb-6">
        <ParticipationNav current="consultar" />
        <PageIntro
          eyebrow="Atención ciudadana"
          title="Consultar mi solicitud"
          lead="Escribe el código y la clave de tu comprobante para ver cómo va, lo que te respondieron y para agregar información."
        />
      </Band>
      <Band className="pt-4 sm:pt-6" inner="grid max-w-5xl gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Panel className="lg:self-start">
          <LookupForm notice={notice} />
        </Panel>
        <aside className="flex flex-col gap-4 text-[15px] leading-relaxed text-text">
          <h2 className="text-lg font-bold">¿Perdiste la clave?</h2>
          <p>
            Nadie del equipo la tiene: solo se guarda una huella que no se puede revertir. Si dejaste un contacto, el equipo puede escribirte. Si no, puedes
            enviar una solicitud nueva.
          </p>
          <h2 className="text-lg font-bold">Tu consulta es privada</h2>
          <p>El código y la clave no viajan en la dirección de la página. Al terminar, toca «Salir»; si no, la consulta se cierra sola en 30 minutos.</p>
          <Notice tone="emergency">Esto no es un servicio de emergencias. En una emergencia, llama a los servicios de emergencia locales.</Notice>
        </aside>
      </Band>
    </div>
  );
}
