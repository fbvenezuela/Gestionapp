import { LinkButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function PanelNotFound() {
  return (
    <Card className="mx-auto max-w-md p-6 text-center">
      <h1 className="text-lg font-bold">No encontramos esto</h1>
      <p className="mt-1 text-[15px] text-text-2">Puede que lo hayan quitado, que tu rol no lo vea o que el enlace esté incompleto.</p>
      <LinkButton href="/hoy" className="mt-4">
        Ir a Hoy
      </LinkButton>
    </Card>
  );
}
