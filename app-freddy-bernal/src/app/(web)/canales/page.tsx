import type { Metadata } from 'next';
import { ShieldCheckIcon, TriangleAlertIcon } from '@/components/web/icons';
import { ChannelCards, orderedChannels } from '@/components/web/channels';
import { DemoNote } from '@/components/web/blocks/views';
import { EmptyState } from '@/components/web/states';
import { cardClass, Container, ExternalText, PageIntro, SafeLink, SectionHeading, textLinkClass, WebLink } from '@/components/web/ui';
import { ATTENTION, newRequestHref } from '@/lib/web/links';
import { pageMetadata } from '@/lib/web/seo';
import { getSite } from '@/lib/web/site';
import { cn } from '@/lib/cn';

// The directory of official channels (design §2, docs/diagnostico.md problem 3): ONE list, the same as the footer's and
// the structured data's. In production only verified accounts; the test version also shows the unverified ones,
// marked. The institutional portal appears only when verified. And how to identify the official accounts (the
// diagnosis found an account impersonating the governor: never linked here).
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite();
  return pageMetadata(
    {
      title: 'Canales oficiales',
      description: `Cuentas oficiales de ${site.name} en redes sociales y cómo identificar las cuentas falsas.`,
      path: '/canales',
    },
    site,
  );
}

const TIPS = [
  'Las cuentas oficiales son solo las de esta página. Si una cuenta no está aquí, no es oficial.',
  'Verifique el nombre de usuario completo. Las cuentas falsas suelen cambiar una letra o agregar un punto o un guion.',
  'Ni el gobernador ni el personal de la Gobernación piden dinero, claves, códigos de verificación ni datos bancarios por mensaje.',
  'Las solicitudes y los reportes se reciben solo por Atención ciudadana, en este sitio.',
] as const;

export default async function ChannelsPage() {
  const site = await getSite();
  const channels = orderedChannels(site);
  return (
    <>
      <PageIntro title="Canales oficiales" intro="Cuentas oficiales del gobernador en redes sociales." />
      <Container className="pb-20">
        {channels.length ? (
          <ChannelCards channels={channels} />
        ) : (
          <EmptyState title="Las cuentas oficiales se publicarán próximamente." />
        )}
        <DemoNote show={site.demo && channels.some((c) => !c.verified)}>En la versión de prueba también se muestran cuentas sin verificar.</DemoNote>

        {site.portal ? (
          <div className={cn(cardClass, 'mt-10 flex flex-col gap-2 p-6')}>
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-accent-ink">Portal institucional</p>
            <a href={site.portal.url} rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-lg font-semibold text-text underline underline-offset-4">
              <ExternalText text={site.portal.label} />
            </a>
          </div>
        ) : null}

        {site.contacts.length ? (
          <section aria-labelledby="contactos" className="mt-12">
            <SectionHeading id="contactos" title="Contactos institucionales" />
            <ul className="grid gap-4 sm:grid-cols-2">
              {site.contacts.map((c) => (
                <li key={`${c.label}-${c.value}`} className={cn(cardClass, 'p-5')}>
                  <p className="text-sm font-semibold text-accent-ink">{c.label}</p>
                  <p className="mt-1 text-lg font-semibold text-text">{c.href ? <SafeLink href={c.href} className="underline underline-offset-4">{c.value}</SafeLink> : c.value}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby="autenticos" className="mt-14 grid gap-8 rounded-[var(--radius-card)] bg-accent-soft p-6 sm:p-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <ShieldCheckIcon className="h-9 w-9 text-accent-ink" />
            <h2 id="autenticos" className="mt-3 text-[1.75rem] font-bold leading-tight tracking-tight text-text sm:text-4xl">
              Cómo identificar las cuentas oficiales
            </h2>
          </div>
          <div className="lg:col-span-7">
            <ol className="list-decimal space-y-3 pl-6 text-lg leading-relaxed text-text">
              {TIPS.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ol>
            <p className="mt-6 text-lg leading-relaxed text-text">
              Si encuentra una cuenta que se hace pasar por el gobernador,{' '}
              <WebLink href={newRequestHref('acotacion')} className={textLinkClass}>
                repórtela con una acotación
              </WebLink>
              .
            </p>
          </div>
        </section>

        <p className="mt-10 flex items-start gap-2 rounded-2xl bg-warn-soft px-4 py-3 text-base font-medium leading-relaxed text-warn">
          <TriangleAlertIcon className="mt-0.5 h-5 w-5 shrink-0" />
          {site.emergencyNotice}
        </p>
        <p className="mt-6 text-base text-text-2">
          Para comunicarse con el despacho, use{' '}
          <WebLink href={ATTENTION.home} className={textLinkClass}>
            Atención ciudadana
          </WebLink>
          .
        </p>
      </Container>
    </>
  );
}
