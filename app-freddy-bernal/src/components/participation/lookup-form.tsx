'use client';

import { useActionState, useEffect, useRef } from 'react';
import { KeyRound } from 'lucide-react';
import { openCase } from '@/lib/actions/participation';
import { Btn, FieldBox, describedBy, inputStyle } from './kit';

/**
 * «Consultar mi solicitud» (design §4): the code and the secret go by POST (a server action; never in the address, no
 * GET parameters), and a wrong one in any part gets the one answer «No hay ninguna solicitud con esos datos». Works
 * without JavaScript too.
 */
export function LookupForm({ notice }: { notice?: string | null }) {
  const [state, action, pending] = useActionState(openCase, null);
  const alertRef = useRef<HTMLDivElement>(null);
  const error = state?.status === 'error' ? state.error : null;
  const fe = state?.status === 'error' ? (state.fieldErrors ?? {}) : {};

  useEffect(() => {
    if (state) alertRef.current?.focus();
  }, [state]);

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      {error || notice ? (
        <div ref={alertRef} tabIndex={-1} role="alert" className="rounded-2xl border-2 border-danger bg-danger-soft p-4 text-text outline-none">
          <p className="text-lg font-bold text-danger">{error ?? notice}</p>
          {error && !Object.keys(fe).length ? (
            <p className="mt-1 text-[15px]">Verifique que el código y la clave estén completos, tal como aparecen en su comprobante.</p>
          ) : null}
        </div>
      ) : null}
      <FieldBox id="f-reference" label="Código" hint="Comienza con AC-. Ejemplo: AC-2026-K7QM2H." error={fe.reference}>
        <input
          id="f-reference"
          name="reference"
          className={`${inputStyle} font-mono text-lg uppercase tracking-wider`}
          defaultValue={state?.status === 'error' ? state.reference : ''}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={40}
          required
          aria-invalid={fe.reference ? true : undefined}
          aria-describedby={describedBy('f-reference', { hint: true, error: fe.reference })}
        />
      </FieldBox>
      <FieldBox id="f-secret" label="Clave" hint="Cuatro grupos de cuatro letras y números, tal como aparece en su comprobante." error={fe.secret}>
        <input
          id="f-secret"
          name="secret"
          className={`${inputStyle} font-mono text-lg uppercase tracking-wider`}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={40}
          required
          aria-invalid={fe.secret ? true : undefined}
          aria-describedby={describedBy('f-secret', { hint: true, error: fe.secret })}
        />
      </FieldBox>
      <Btn type="submit" tone="action" size="lg" disabled={pending}>
        <KeyRound className="h-5 w-5" aria-hidden />
        {pending ? 'Buscando…' : 'Consultar'}
      </Btn>
    </form>
  );
}
