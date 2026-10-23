import { signOut } from '@/lib/auth/actions';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';

export const metadata = { title: 'Sin acceso' };

export default function NoAccess() {
  return (
    <Card>
      <CardBody className="flex flex-col gap-3">
        <h1 className="text-xl font-bold">Todavía no tienes un rol</h1>
        <p className="text-[15px] text-text-2">Pídele a la persona que administra la plataforma que te asigne tu rol. Cuando lo haga, vuelve a entrar.</p>
        <form action={signOut}>
          <Button type="submit" variant="secondary">Salir</Button>
        </form>
      </CardBody>
    </Card>
  );
}
