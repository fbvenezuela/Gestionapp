'use client';

import { useActionState } from 'react';
import { mfaVerify, type ActionState } from '@/lib/auth/actions';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';

export function MfaForm({ factorId }: { factorId?: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(mfaVerify, {});
  return (
    <form action={action} className="mt-2 flex flex-col gap-3">
      <input type="hidden" name="factorId" value={factorId ?? ''} />
      <Field label="Código de 6 números" htmlFor="code" error={state.error}>
        <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required className="text-center font-mono text-2xl tracking-[0.4em]" />
      </Field>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? 'Comprobando…' : 'Confirmar'}
      </Button>
    </form>
  );
}
