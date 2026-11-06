import { SearchXIcon } from './icons';
import { ATTENTION } from '@/lib/web/links';
import { ButtonLink, Container, textLinkClass, WebLink } from './ui';

// The public «no existe» (the (web) group's not-found and the app's global one, src/app/not-found.tsx): what to do next,
// in plain words. The card keeps the app's glass card (the same 404 card the panel's tests know); the title says what
// happened, never an error code.
export function NotFoundMessage() {
  return (
    <Container className="py-16 sm:py-24">
      <div className="glass-card rounded-[var(--radius-card)] mx-auto max-w-2xl p-8 sm:p-12">
        <SearchXIcon className="h-10 w-10 text-accent-ink" />
        <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Esta página no existe</h1>
        <p className="mt-3 text-lg leading-relaxed text-text-2">
          Puede que la dirección esté incompleta o que la página se haya movido. Desde aquí puedes seguir:
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href="/">Ir al inicio</ButtonLink>
          <ButtonLink href="/actualidad" variant="outline">
            Buscar en actualidad
          </ButtonLink>
        </div>
        <p className="mt-6 text-base leading-relaxed text-text-2">
          ¿Buscabas tu solicitud?{' '}
          <WebLink href={ATTENTION.lookup} className={textLinkClass}>
            Consúltala con tu código
          </WebLink>
          .
        </p>
      </div>
    </Container>
  );
}
