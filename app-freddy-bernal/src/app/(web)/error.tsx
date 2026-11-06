'use client';

import Link from 'next/link';
import { cardClass } from '@/components/web/surfaces';

// A page of the website that could not load (the database or the network failed): what happened in plain words and
// two ways out. No technical detail reaches the page.
export default function WebError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
      <div className={`${cardClass} mx-auto max-w-2xl p-8 sm:p-12`}>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Esta página no cargó</h1>
        <p className="mt-3 text-lg leading-relaxed text-text-2">Puede ser la conexión. Vuelve a intentarlo en un momento.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => retry()}
            className="inline-flex min-h-12 items-center rounded-full bg-accent px-5 font-semibold text-on-accent hover:bg-accent-hover"
          >
            Volver a intentar
          </button>
          <Link href="/" prefetch={false} className="inline-flex min-h-12 items-center rounded-full border-2 border-accent bg-surface px-5 font-semibold text-text hover:bg-accent-soft">
            Ir al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
