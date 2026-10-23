'use client';

import { markAllRead } from '@/lib/actions/profile';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';

export function MarkAllRead() {
  const { run, pending } = useAction();
  return <Button variant="secondary" disabled={pending} onClick={() => run(() => markAllRead())}>Marcar todo como leído</Button>;
}
