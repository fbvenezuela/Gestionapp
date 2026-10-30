import { ShieldCheck } from 'lucide-react';
import { CHAT_BOSS_ONLY } from '@/lib/db/core';
import { Card } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/button';

// The boss without the second factor on a screen that arms channels (R5, D-80): the database would say no
// (can_approve()), so the screen says why first and where to turn it on.
export function BossSecondFactor() {
  return (
    <Card className="mx-auto flex max-w-md flex-col items-center gap-3 p-6 text-center">
      <ShieldCheck className="h-8 w-8 text-text-2" aria-hidden />
      <p className="text-[15px]">{CHAT_BOSS_ONLY}</p>
      <LinkButton href="/doble-factor">Activar el doble factor</LinkButton>
    </Card>
  );
}
