'use client';

import type { Ref } from 'react';
import { Users } from 'lucide-react';
import type { FieldErrors } from '@/lib/actions/participation-types';
import { cn } from '@/lib/cn';
import { Btn, FieldBox, inputStyle, describedBy } from './kit';
import { ContactFields, Honeypot, PrivacyCheck } from './contact-fields';
import { Turnstile } from './turnstile';
import { reportsCount } from './words';
import type { FormValues } from './form-core';

/**
 * «Reportes parecidos» (design §4): only how many open reports of the same problem there are nearby, never their
 * texts, photos or names. «Apoyar este reporte» adds the person's support to the oldest one and gives them their own
 * receipt; «No, es otro problema» goes on with their own report.
 */
export function SimilarOffer({ count, onJoin, onSkip }: { count: number; onJoin: () => void; onSkip: () => void }) {
  return (
    <div className="flex flex-col gap-5 rounded-[var(--radius-card)] border-2 border-accent bg-accent-soft p-5 sm:p-8">
      <Users className="h-9 w-9 text-accent-ink" aria-hidden />
      <h3 className="text-2xl font-bold leading-tight text-text sm:text-3xl">
        Hay {reportsCount(count)} {count === 1 ? 'abierto' : 'abiertos'} del mismo problema cerca de ese lugar.
      </h3>
      <p className="text-[17px] leading-relaxed text-text">
        Si se trata del mismo problema, puede apoyar el reporte existente. Recibirá un código propio para consultarlo. Los datos de las otras personas
        no se muestran.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Btn tone="action" size="lg" onClick={onJoin}>
          Apoyar este reporte
        </Btn>
        <Btn tone="soft" size="lg" onClick={onSkip}>
          No, es otro problema
        </Btn>
      </div>
    </div>
  );
}

/** «Enviar apoyo»: an optional comment, the optional contact (or anonymous), the privacy notice. */
export function JoinForm({
  v, set, errors, sending, onSubmit, onBack, hpRef, turnstileSiteKey, onToken, turnstileReset,
}: {
  v: FormValues;
  set: (p: Partial<FormValues>) => void;
  errors: FieldErrors;
  sending: boolean;
  onSubmit: () => void;
  onBack: () => void;
  hpRef: Ref<HTMLInputElement>;
  turnstileSiteKey: string | null;
  onToken: (t: string | null) => void;
  turnstileReset: number;
}) {
  return (
    <form
      noValidate
      className="relative flex flex-col gap-7"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <FieldBox id="f-note" label="Comentario" optional hint="Por ejemplo, desde cuándo ocurre o cómo le afecta. Solo lo lee el personal de atención." error={errors.note}>
        <textarea
          id="f-note"
          className={cn(inputStyle, 'min-h-28 leading-relaxed')}
          value={v.note}
          maxLength={2000}
          rows={4}
          onChange={(e) => set({ note: e.currentTarget.value })}
          aria-invalid={errors.note ? true : undefined}
          aria-describedby={describedBy('f-note', { hint: true, error: errors.note })}
        />
      </FieldBox>
      <ContactFields v={v} set={set} errors={errors} />
      <PrivacyCheck checked={v.privacyAccepted} onChange={(c) => set({ privacyAccepted: c })} error={errors.privacyAccepted} />
      <Honeypot inputRef={hpRef} />
      {turnstileSiteKey ? <Turnstile siteKey={turnstileSiteKey} onToken={onToken} resetKey={turnstileReset} /> : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Btn tone="soft" size="lg" onClick={onBack} disabled={sending}>
          Volver
        </Btn>
        <Btn type="submit" tone="action" size="lg" disabled={sending} aria-disabled={sending}>
          {sending ? 'Enviando…' : 'Enviar apoyo'}
        </Btn>
      </div>
    </form>
  );
}
