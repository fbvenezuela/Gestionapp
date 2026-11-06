'use client';

import type { Ref } from 'react';
import { CONTACT_CHANNEL_LABEL, type ContactChannel } from '@/lib/participation/input';
import { HONEYPOT_FIELD, type FieldErrors } from '@/lib/actions/participation-types';
import { cn } from '@/lib/cn';
import { FieldBox, FieldError, describedBy, inputStyle } from './kit';
import type { FormValues } from './form-core';

const CHANNELS: ContactChannel[] = ['email', 'phone', 'whatsapp', 'none'];

/**
 * «¿Cómo te contactamos?» (design §4): optional. «Enviar como anónimo» clears and hides the fields and says what it
 * means (keep the receipt); with a name, the person may allow it in «Lo atendido» (otherwise only initials). The
 * contact travels encrypted and only the team that attends the request reads it.
 */
export function ContactFields({ v, set, errors }: { v: FormValues; set: (p: Partial<FormValues>) => void; errors: FieldErrors }) {
  const channelError = errors.contact ?? errors['contact.channel'];
  return (
    <fieldset className="flex flex-col gap-5">
      <legend className="text-xl font-bold text-text">
        ¿Cómo te contactamos? <span className="text-base font-normal text-text-2">(opcional)</span>
      </legend>
      <p className="-mt-2 text-[15px] leading-relaxed text-text-2">
        Con un contacto, el equipo puede pedirte un dato o contarte cómo va. Se guarda cifrado y solo lo ve quien atiende tu solicitud.
      </p>

      <div className="flex flex-col gap-1">
        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border border-border bg-surface p-4 has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
          <input
            id="f-anonymous"
            type="checkbox"
            checked={v.anonymous}
            onChange={(e) =>
              set(e.currentTarget.checked ? { anonymous: true, name: '', email: '', phone: '', channel: '', publishNameConsent: false } : { anonymous: false })
            }
            aria-describedby={describedBy('f-anonymous', { hint: true, error: errors.anonymous })}
            className="mt-0.5 size-5 shrink-0 accent-accent"
          />
          <span>
            <span className="block text-base font-semibold text-text">Enviar como anónimo</span>
            <span id="f-anonymous-hint" className="block text-[15px] leading-snug text-text-2">
              Sin contacto, el equipo no puede escribirte. Guarda bien tu código y tu clave: son la única forma de seguir tu solicitud.
            </span>
          </span>
        </label>
        {errors.anonymous ? <FieldError id="f-anonymous-error">{errors.anonymous}</FieldError> : null}
      </div>

      {!v.anonymous ? (
        <>
          <FieldBox id="f-contact-name" label="Nombre" optional error={errors['contact.name']}>
            <input
              id="f-contact-name"
              className={inputStyle}
              value={v.name}
              maxLength={120}
              autoComplete="name"
              onChange={(e) => set({ name: e.currentTarget.value, ...(e.currentTarget.value.trim() ? {} : { publishNameConsent: false }) })}
              aria-invalid={errors['contact.name'] ? true : undefined}
              aria-describedby={describedBy('f-contact-name', { error: errors['contact.name'] })}
            />
          </FieldBox>
          <div className="grid gap-5 sm:grid-cols-2">
            <FieldBox id="f-contact-email" label="Correo" optional error={errors['contact.email']}>
              <input
                id="f-contact-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                className={inputStyle}
                value={v.email}
                maxLength={254}
                onChange={(e) => set({ email: e.currentTarget.value })}
                aria-invalid={errors['contact.email'] ? true : undefined}
                aria-describedby={describedBy('f-contact-email', { error: errors['contact.email'] })}
              />
            </FieldBox>
            <FieldBox id="f-contact-phone" label="Teléfono" optional hint="Con el código de área." error={errors['contact.phone']}>
              <input
                id="f-contact-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                className={inputStyle}
                value={v.phone}
                maxLength={40}
                onChange={(e) => set({ phone: e.currentTarget.value })}
                aria-invalid={errors['contact.phone'] ? true : undefined}
                aria-describedby={describedBy('f-contact-phone', { hint: true, error: errors['contact.phone'] })}
              />
            </FieldBox>
          </div>
          <fieldset className="flex flex-col gap-2" aria-describedby={describedBy('f-contact', { hint: true, error: channelError })}>
            <legend className="text-base font-semibold text-text">¿Por dónde prefieres que te contacten?</legend>
            <p id="f-contact-hint" className="text-[15px] text-text-2">
              Si no eliges, usamos el correo o el teléfono que dejes.
            </p>
            <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
              {CHANNELS.map((c, i) => (
                <label
                  key={c}
                  className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface px-4 has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
                >
                  <input
                    id={i === 0 ? 'f-contact' : undefined}
                    type="radio"
                    name="contact-channel"
                    value={c}
                    checked={v.channel === c}
                    onChange={() => set({ channel: c })}
                    className="size-5 shrink-0 accent-accent"
                  />
                  <span className="text-[15px] font-medium text-text">{CONTACT_CHANNEL_LABEL[c]}</span>
                </label>
              ))}
            </div>
            {channelError ? <FieldError id="f-contact-error">{channelError}</FieldError> : null}
          </fieldset>
          {v.name.trim() ? (
            <label className="flex cursor-pointer items-start gap-3 text-[15px] leading-snug text-text">
              <input
                id="f-publishNameConsent"
                type="checkbox"
                checked={v.publishNameConsent}
                onChange={(e) => set({ publishNameConsent: e.currentTarget.checked })}
                className="mt-0.5 size-5 shrink-0 accent-accent"
              />
              <span>
                Si se resuelve y el equipo lo publica en «Lo atendido», pueden poner mi nombre.{' '}
                <span className="text-text-2">Si no lo marcas, solo van tus iniciales.</span>
              </span>
            </label>
          ) : null}
        </>
      ) : null}
    </fieldset>
  );
}

/** The privacy notice, required to send (it opens in another tab, the form stays as it is). */
export function PrivacyCheck({ checked, onChange, error }: { checked: boolean; onChange: (v: boolean) => void; error?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className={cn('flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-[15px] leading-snug text-text', error ? 'border-danger bg-danger-soft' : 'border-border bg-surface')}>
        <input
          id="f-privacyAccepted"
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.currentTarget.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'f-privacyAccepted-error' : undefined}
          className="mt-0.5 size-5 shrink-0 accent-accent"
        />
        <span>
          Leí el{' '}
          <a href="/aviso-de-privacidad" target="_blank" rel="noopener" className="font-semibold text-accent-ink underline underline-offset-2">
            aviso de privacidad
          </a>{' '}
          <span className="text-text-2">(se abre en otra pestaña)</span> y acepto que usen lo que envío solo para atender mi solicitud.
        </span>
      </label>
      {error ? <FieldError id="f-privacyAccepted-error">{error}</FieldError> : null}
    </div>
  );
}

/** The honeypot: people never see it or reach it with the keyboard; a robot that fills it sends nothing. */
export function Honeypot({ inputRef, defaultValue }: { inputRef?: Ref<HTMLInputElement>; defaultValue?: string }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
      <label htmlFor="f-sitio-web">No llenes este campo</label>
      <input ref={inputRef} id="f-sitio-web" name={HONEYPOT_FIELD} type="text" tabIndex={-1} autoComplete="off" defaultValue={defaultValue} />
    </div>
  );
}
