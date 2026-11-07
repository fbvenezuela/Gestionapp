import { SearchXIcon } from './icons';
import { ATTENTION } from '@/lib/web/links';
import { ButtonLink, Container, textLinkClass, WebLink } from './ui';

// The public «no existe» (the (web) group's not-found and the app's global one, src/app/not-found.tsx): what happened and
// where to go, in plain words. The card keeps the app's glass card (the same 404 card the panel's tests know); the title
// says what happened, never an error code.
export function NotFoundMessage() {
  return (
    <Container className="py-16 sm:py-24">
      <div className="glass-card rounded-[var(--radius-card)] mx-auto max-w-2xl p-8 sm:p-12">
        <SearchXIcon className="h-10 w-10 text-accent-ink" />
        <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Esta página no existe</h1>
        <p className="mt-3 text-lg leading-relaxed text-text-2">La dirección puede estar incompleta o la página ya no está disponible.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href="/">Ir al inicio</ButtonLink>
          <ButtonLink href="/actualidad" variant="outline">
            Ver noticias
          </ButtonLink>
        </div>
        <p className="mt-6 text-base leading-relaxed text-text-2">
          Para conocer el estado de una solicitud, ingrese a{' '}
          <WebLink href={ATTENTION.lookup} className={textLinkClass}>
            Consultar mi solicitud
          </WebLink>
          .
        </p>
      </div>
    </Container>
  );
}
