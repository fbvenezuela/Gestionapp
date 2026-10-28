import { LinkButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

// «Ir al inicio» goes to "/", which sends each person to their own home (homeFor(): the boss's Inicio, política's
// Municipios, the IVT's Obras, Hoy for the rest), not to Hoy for everyone.
export default function PanelNotFound() {
  return (
    <Card className="mx-auto max-w-md p-6 text-center">
      <h1 className="text-lg font-bold">No encontramos esto</h1>
      <p className="mt-1 text-[15px] text-text-2">Puede que lo hayan quitado, que tu rol no lo vea o que el enlace esté incompleto.</p>
      <LinkButton href="/" className="mt-4">
        Ir al inicio
      </LinkButton>
    </Card>
  );
}
