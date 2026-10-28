'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function PanelError({ reset }: { error: Error; reset: () => void }) {
  return (
    <Card className="mx-auto max-w-md p-6 text-center">
      <h1 className="text-lg font-bold">Algo no cargó</h1>
      <p className="mt-1 text-[15px] text-text-2">Puede ser la señal. Lo que escribiste sigue guardado en el teléfono.</p>
      <Button className="mt-4" onClick={reset}>Volver a intentar</Button>
    </Card>
  );
}
