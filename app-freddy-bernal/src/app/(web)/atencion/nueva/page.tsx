import type { Metadata } from 'next';
import { connection } from 'next/server';
import { env } from '@/lib/env';
import { SITE_NAME, maxAttachmentBytes, todayIso } from '@/lib/actions/participation-core';
import { turnstileEnabled } from '@/lib/participation/turnstile';
import { Band, PageIntro } from '@/components/participation/kit';
import { ParticipationNav } from '@/components/participation/participation-nav';
import { RequestForm } from '@/components/participation/request-form';
import { NoJsForm } from '@/components/participation/no-js-form';
import { isRequestType } from '@/components/participation/form-core';
import { TYPE_COPY } from '@/components/participation/words';
import { loadFormCatalog, loadLinkedItem } from '../_lib/data';

export const metadata: Metadata = {
  title: 'Hacer una solicitud',
  description: 'Reporta un problema de tu comunidad, haz una petición, deja una acotación o una denuncia. Sin cuenta, desde el teléfono, con un código para seguirla.',
  alternates: { canonical: '/atencion/nueva' },
};

// The form (design §4). Dynamic on purpose: the form without JavaScript carries a key made for this visit, and the page
// must never be cached for two people. Everything read here is public (catalogues, the published item it is about).
export default async function NewRequestPage({ searchParams }: { searchParams: Promise<{ tipo?: string | string[]; sobre?: string | string[] }> }) {
  await connection();
  const sp = await searchParams;
  const presetType = isRequestType(sp.tipo) ? sp.tipo : null;
  const [catalog, linked] = await Promise.all([loadFormCatalog(), loadLinkedItem(typeof sp.sobre === 'string' ? sp.sobre : null)]);
  const today = todayIso();
  const title = presetType ? TYPE_COPY[presetType].action : 'Hacer una solicitud';

  return (
    <div className="w-full bg-ivory text-text">
      <Band className="pb-4 sm:pb-6">
        <ParticipationNav current="nueva" />
        <PageIntro
          eyebrow="Atención ciudadana"
          title={title}
          lead="Son cuatro pasos cortos y no hace falta cuenta. Lo que escribes se guarda en este teléfono mientras llenas el formulario, aunque se vaya la señal."
        />
      </Band>
      <Band className="pt-4 sm:pt-6" inner="max-w-3xl">
        <div className="js-only">
          <RequestForm
            municipalities={catalog.municipalities}
            categories={catalog.categories}
            linked={linked ? { id: linked.id, kindLabel: linked.kindLabel, title: linked.title, href: linked.href } : null}
            presetType={presetType}
            today={today}
            siteName={SITE_NAME}
            maxFileBytes={maxAttachmentBytes()}
            turnstileSiteKey={turnstileEnabled() ? env.turnstile.siteKey : null}
            emailConfirmations={env.email.mode === 'send' && !!env.email.resendKey && env.dataMode !== 'demo'}
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
          />
        </noscript>
      </Band>
    </div>
  );
}
