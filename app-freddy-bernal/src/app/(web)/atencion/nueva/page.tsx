import type { Metadata } from 'next';
import { connection } from 'next/server';
import { env, isDemo } from '@/lib/env';
import { SITE_NAME, maxAttachmentBytes, todayIso } from '@/lib/actions/participation-core';
import { turnstileEnabled } from '@/lib/participation/turnstile';
import { Band, PageIntro } from '@/components/participation/kit';
import { ParticipationNav } from '@/components/participation/participation-nav';
import { RequestForm } from '@/components/participation/request-form';
import { NoJsForm } from '@/components/participation/no-js-form';
import { DemoDataWarning } from '@/components/participation/demo-warning';
import { isRequestType } from '@/components/participation/form-core';
import { PHOTO_CLEANING, TYPE_COPY } from '@/components/participation/words';
import { getAttended } from '@/lib/web/cache';
import { loadFormCatalog, loadLinkedItem } from '../_lib/data';

export const metadata: Metadata = {
  title: 'Nueva solicitud',
  description: 'Formulario para enviar una solicitud al despacho del gobernador. No necesita registrarse.',
  alternates: { canonical: '/atencion/nueva' },
};

// The form (design §4). Dynamic on purpose: the form without JavaScript carries a key made for this visit, and the page
// must never be cached for two people. Everything read here is public (catalogues, the published item it is about).
export default async function NewRequestPage({ searchParams }: { searchParams: Promise<{ tipo?: string | string[]; sobre?: string | string[] }> }) {
  await connection();
  const sp = await searchParams;
  const presetType = isRequestType(sp.tipo) ? sp.tipo : null;
  const [catalog, linked, attended] = await Promise.all([loadFormCatalog(), loadLinkedItem(typeof sp.sobre === 'string' ? sp.sobre : null), getAttended(1)]);
  const today = todayIso();
  const title = presetType ? TYPE_COPY[presetType].action : 'Nueva solicitud';

  return (
    <div className="w-full bg-ivory text-text">
      <Band className="pb-4 sm:pb-6">
        <ParticipationNav current="nueva" attended={attended.length > 0} />
        <PageIntro eyebrow="Atención ciudadana" title={title} lead="El formulario tiene cuatro pasos. No necesita registrarse." />
        <DemoDataWarning demo={isDemo()} className="mt-6 max-w-3xl" />
      </Band>
      <Band className="pt-4 sm:pt-6" inner="grid gap-10 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
        <div className="js-only min-w-0 max-w-3xl">
          <RequestForm
            municipalities={catalog.municipalities}
            categories={catalog.categories}
            linked={linked ? { id: linked.id, kindLabel: linked.kindLabel, title: linked.title, href: linked.href } : null}
            presetType={presetType}
            today={today}
            siteName={SITE_NAME}
            maxFileBytes={maxAttachmentBytes()}
            turnstileSiteKey={turnstileEnabled() ? env.turnstile.siteKey : null}
          />
        </div>
        <noscript>
          <style>{'.js-only{display:none!important}'}</style>
          <NoJsForm
            municipalities={catalog.municipalities}
            categories={catalog.categories}
            formKey={crypto.randomUUID()}
            linkedItemId={linked?.id ?? null}
            presetType={presetType}
            today={today}
            turnstileOn={turnstileEnabled()}
          />
        </noscript>
        <aside className="flex flex-col gap-5 text-[15px] leading-relaxed text-text lg:sticky lg:top-24" aria-label="Información importante">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-bold">Comprobante</h2>
            <p className="text-text-2">Al enviar recibirá un código y una clave para consultar su solicitud. No necesita registrarse.</p>
          </div>
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-bold">Datos personales</h2>
            <p className="text-text-2">
              {isDemo()
                ? 'No se le pedirá cédula ni afiliación política. Los datos de contacto son opcionales. En la versión definitiva se guardan cifrados.'
                : 'No se le pedirá cédula ni afiliación política. Los datos de contacto son opcionales y se guardan cifrados.'}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-bold">Fotos</h2>
            <p className="text-text-2">{PHOTO_CLEANING}</p>
          </div>
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-bold">Seguimiento</h2>
            <p className="text-text-2">
              Si ya envió una solicitud, puede ver su estado en{' '}
              <a href="/atencion/consultar" className="font-semibold text-accent-ink underline underline-offset-2">
                Consultar mi solicitud
              </a>
              .
            </p>
          </div>
        </aside>
      </Band>
    </div>
  );
}
