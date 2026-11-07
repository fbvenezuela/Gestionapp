import type { Metadata } from 'next';
import { EXPIRED_TEXT, maxAttachmentBytes } from '@/lib/actions/participation-core';
import { Band, EmergencyNote, PageIntro, Panel } from '@/components/participation/kit';
import { ParticipationNav } from '@/components/participation/participation-nav';
import { LookupForm } from '@/components/participation/lookup-form';
import { CaseView } from '@/components/participation/case-view';
import { FocusOnMount } from '@/components/participation/focus-on-mount';
import { loadConsultation } from '../_lib/data';
import { DemoDataWarning } from '@/components/participation/demo-warning';
import { isDemo } from '@/lib/env';

export const metadata: Metadata = {
  title: 'Consultar mi solicitud',
  description: 'Consulte el estado de su solicitud con su código y su clave.',
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
          lead="Escriba el código y la clave de su comprobante para ver el estado, leer las respuestas o agregar información."
        />
      </Band>
      <Band className="pt-4 sm:pt-6" inner="grid max-w-5xl gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Panel className="lg:self-start">
          <LookupForm notice={notice} />
        </Panel>
        <aside className="flex flex-col gap-4 text-[15px] leading-relaxed text-text">
          <h2 className="text-lg font-bold">Pérdida de la clave</h2>
          <p>
            La clave no se puede recuperar, porque el sistema no la guarda. Si dejó un contacto, el personal de atención puede escribirle. Si no, puede
            enviar una solicitud nueva.
          </p>
          <h2 className="text-lg font-bold">Privacidad de la consulta</h2>
          <p>Al terminar, toque «Salir». Por seguridad, la consulta se cierra a los 30 minutos.</p>
          <EmergencyNote />
        </aside>
      </Band>
    </div>
  );
}
