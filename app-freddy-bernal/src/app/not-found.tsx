import { LinkButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <Card className="p-6 text-center">
        <h1 className="text-lg font-bold">Esta página no existe</h1>
        <p className="mt-1 text-[15px] text-text-2">Revisa el enlace o vuelve al inicio.</p>
        <LinkButton href="/" className="mt-4">
          Ir al inicio
        </LinkButton>
      </Card>
    </main>
  );
}
