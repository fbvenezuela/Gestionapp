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
 * «¿Ya lo reportaron?» (design §4): only how many open reports of the same problem there are nearby, never their
 * texts, photos or names. «Sí, me sumo» adds the person's support to the oldest one and gives them their own receipt;
 * «No, es otro problema» goes on with their own report.
 */
export function SimilarOffer({ count, onJoin, onSkip }: { count: number; onJoin: () => void; onSkip: () => void }) {
  return (
    <div className="flex flex-col gap-5 rounded-[var(--radius-card)] border-2 border-accent bg-accent-soft p-5 sm:p-8">
      <Users className="h-9 w-9 text-accent-ink" aria-hidden />
      <h3 className="text-2xl font-bold leading-tight text-text sm:text-3xl">Ya hay {reportsCount(count)} de esto cerca. ¿Te sumas?</h3>
      <p className="text-[17px] leading-relaxed text-text">
        Si es el mismo problema, súmate: el caso suma tu apoyo y recibes tu propio código para seguirlo. No verás lo que escribieron otras personas.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Btn tone="action" size="lg" onClick={onJoin}>
          Sí, me sumo
        </Btn>
        <Btn tone="soft" size="lg" onClick={onSkip}>
          No, es otro problema: sigo con el mío
        </Btn>
      </div>
    </div>
  );
}

/** «Sumarme»: an optional note, the optional contact (or anonymous), the privacy notice. */
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
      <FieldBox id="f-note" label="¿Algo que quieras agregar?" optional hint="Por ejemplo, desde cuándo lo ves o cómo te afecta. Lo lee solo el equipo." error={errors.note}>
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
          {sending ? 'Enviando…' : 'Sumarme'}
        </Btn>
      </div>
    </form>
  );
}
