'use client';

import Link from 'next/link';
import { Btn, buttonStyle } from '@/components/participation/kit';

// Something failed while loading an attention page (the database did not answer, the signal dropped). A draft of the
// form stays in the tab (sessionStorage), so trying again loses nothing.
export default function AttentionError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="w-full bg-ivory px-4 py-16 text-text sm:px-6">
      <div className="mx-auto flex max-w-2xl flex-col items-start gap-4">
        <p className="text-sm font-semibold uppercase tracking-[0.08em] text-accent-ink">Atención ciudadana</p>
        <h1 className="text-3xl font-bold leading-tight">Algo no cargó</h1>
        <p className="text-lg leading-relaxed text-text-2">
          Puede ser la señal. Vuelve a intentarlo: si estabas llenando el formulario, lo que escribiste sigue guardado en este teléfono.
        </p>
        <div className="flex flex-wrap gap-3">
          <Btn tone="olive" size="lg" onClick={() => reset()}>
            Intentar de nuevo
          </Btn>
          <Link href="/atencion" className={buttonStyle({ tone: 'soft', size: 'lg' })}>
            Ir a Atención ciudadana
          </Link>
        </div>
        <p className="text-[15px] text-text-2">Esto no es un servicio de emergencias. En una emergencia, llama a los servicios de emergencia locales.</p>
      </div>
    </div>
  );
}
