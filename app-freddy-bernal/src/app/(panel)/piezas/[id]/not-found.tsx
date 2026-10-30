import { LinkButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { isDemo } from '@/lib/env';
import { DEMO_OTHER_SERVER_PIECE } from '@/lib/domain/redes';

// A piece that is not here (R4, D-76, F3). In the demo each server keeps its own database (D-39): a piece made on
// another one says so, instead of «not found» (as Mensajes, D-57). Deleted pieces only come back through
// administración («Piezas eliminadas»).
export default function PieceNotFound() {
  const demo = isDemo();
  return (
    <Card className="mx-auto max-w-md p-6 text-center">
      <h1 className="text-lg font-bold">{demo ? 'Esta pieza no está en este servidor' : 'No encontramos esta pieza'}</h1>
      <p className="mt-1 text-[15px] text-text-2">{demo ? DEMO_OTHER_SERVER_PIECE : 'Puede que el enlace esté incompleto o que tu rol no la vea.'}</p>
      <p className="mt-2 text-sm text-text-2">Si la eliminó el jefe, Administración puede recuperarla.</p>
      <LinkButton href="/redes" className="mt-4">
        Ir a Redes
      </LinkButton>
    </Card>
  );
}
