import { boxClass } from '@/components/web/surfaces';
import { Container } from '@/components/web/ui';

// While a page of the website loads (a filtered list, a search): calm placeholders in the page's shape, no spinner.
export default function Loading() {
  return (
    <Container className="py-12 sm:py-16">
      <div aria-busy="true">
        <p className="sr-only" role="status">
          Cargando…
        </p>
        <div className="h-4 w-32 rounded-full bg-accent-soft" />
        <div className="mt-5 h-12 w-full max-w-2xl rounded-2xl bg-surface-2" />
        <div className="mt-4 h-6 w-full max-w-xl rounded-full bg-surface-2" />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className={`${boxClass} h-48`} />
          ))}
        </div>
      </div>
    </Container>
  );
}
