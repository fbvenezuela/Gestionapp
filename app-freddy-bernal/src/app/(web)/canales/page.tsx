import type { Metadata } from 'next';
import { ExternalLinkIcon, ShieldCheckIcon, TriangleAlertIcon } from '@/components/web/icons';
import { ChannelCards, orderedChannels } from '@/components/web/channels';
import { DemoNote } from '@/components/web/blocks/views';
import { EmptyState } from '@/components/web/states';
import { cardClass, Container, PageIntro, SafeLink, SectionHeading, textLinkClass, WebLink } from '@/components/web/ui';
import { ATTENTION, newRequestHref } from '@/lib/web/links';
import { pageMetadata } from '@/lib/web/seo';
import { getSite } from '@/lib/web/site';
import { cn } from '@/lib/cn';

// The directory of official channels (design §2, docs/diagnostico.md problem 3): ONE list, the same as the footer's and
// the structured data's. In production only verified accounts; the test version also shows the «por confirmar» ones,
// marked. The institutional portal appears only when verified. And how to recognize the authentic channels (the
// diagnosis found an account impersonating the governor: never linked here).
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite();
  return pageMetadata(
    {
      title: 'Canales oficiales',
      description: `Las cuentas oficiales de ${site.name} en las redes y cómo reconocer los canales auténticos.`,
      path: '/canales',
    },
    site,
  );
}

const TIPS = [
  'Las cuentas oficiales son solo las de esta página. Si una cuenta no está aquí, no es oficial.',
  'Revisa el nombre de usuario letra por letra: las cuentas falsas cambian una letra, agregan un punto o un guion.',
  'Nadie del equipo te va a pedir dinero, claves, códigos de verificación ni datos bancarios por mensaje.',
  'Para pedir algo o reportar un problema, usa la atención ciudadana de esta web: recibes un código para seguir tu caso.',
] as const;

export default async function ChannelsPage() {
  const site = await getSite();
  const channels = orderedChannels(site);
  return (
    <>
      <PageIntro
        eyebrow="Canales"
        title="Canales oficiales"
        intro="Dónde seguir la gestión y el programa, en una sola lista: la misma de toda la web."
      />
      <Container className="pb-20">
        {channels.length ? (
          <ChannelCards channels={channels} />
        ) : (
          <EmptyState title="Las cuentas oficiales se publican aquí cuando el equipo las verifica." />
        )}
        <DemoNote show={site.demo && channels.some((c) => !c.verified)}>
          En la versión de prueba se ven también las cuentas «por confirmar»: el equipo las está verificando. En la web publicada solo salen las
          verificadas.
        </DemoNote>

        {site.portal ? (
          <div className={cn(cardClass, 'mt-10 flex flex-col gap-2 p-6')}>
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-accent-ink">Portal institucional</p>
            <a href={site.portal.url} rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-lg font-semibold text-text underline underline-offset-4">
              {site.portal.label} <ExternalLinkIcon className="h-4 w-4" />
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
              Cómo reconocer los canales auténticos
            </h2>
          </div>
          <div className="lg:col-span-7">
            <ol className="list-decimal space-y-3 pl-6 text-lg leading-relaxed text-text">
              {TIPS.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ol>
            <p className="mt-6 text-lg leading-relaxed text-text">
              ¿Viste una cuenta que se hace pasar por el gobernador?{' '}
              <WebLink href={newRequestHref('acotacion')} className={textLinkClass}>
                Avísanos con una acotación
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
          Para escribirle al equipo, usa la{' '}
          <WebLink href={ATTENTION.home} className={textLinkClass}>
            atención ciudadana
          </WebLink>
          : cada mensaje queda registrado y asignado.
        </p>
      </Container>
    </>
  );
}
