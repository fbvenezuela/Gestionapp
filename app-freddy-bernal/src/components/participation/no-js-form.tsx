'use client';

import { useActionState } from 'react';
import { sendRequestWithoutJs } from '@/lib/actions/participation';
import { REQUEST_TYPES, CONTACT_CHANNEL_LABEL, type RequestType } from '@/lib/participation/input';
import type { PublicCategory, Territory } from '@/lib/web/public';
import { cn } from '@/lib/cn';
import { FieldBox, FieldError, Notice, buttonStyle, describedBy, inputStyle, webCard } from './kit';
import { Honeypot } from './contact-fields';
import { DENUNCIA_TEXT, EMERGENCY_TEXT, TYPE_COPY } from './words';

/**
 * The same request without JavaScript (design §4: a no-JS fallback). It lives inside <noscript>, so only a browser
 * without JavaScript shows it, and it posts as a plain form to the server action: the server makes the secret from the
 * form's key (written into this page when it was rendered) and this browser's device id, so the same form sent twice
 * gets the same receipt. One page, no files and no map (they need JavaScript); the receipt is shown right here.
 */
export function NoJsForm({
  municipalities, categories, formKey, linkedItemId, presetType, today, turnstileOn = false,
}: {
  municipalities: Territory[];
  categories: PublicCategory[];
  formKey: string;
  linkedItemId: string | null;
  presetType: RequestType | null;
  today: string;
  /** Turnstile is configured: its check needs JavaScript, so a form without it could never be sent. */
  turnstileOn?: boolean;
}) {
  const [state, action] = useActionState(sendRequestWithoutJs, null);

  if (turnstileOn) {
    return (
      <section aria-labelledby="sinjs-apagado" className={cn(webCard, 'flex flex-col gap-4 p-6')}>
        <h2 id="sinjs-apagado" className="text-2xl font-bold text-text">
          Para enviar, activa JavaScript
        </h2>
        <p className="text-[15px] leading-relaxed text-text">
          Tu navegador no tiene JavaScript activo, y la comprobación de que no eres un robot lo necesita. Actívalo en los ajustes del navegador, o abre esta
          página en otro navegador.
        </p>
        <p className="text-[15px] text-text-2">{EMERGENCY_TEXT}</p>
      </section>
    );
  }

  if (state?.status === 'sent') {
    return (
      <section aria-labelledby="sinjs-recibo" className="flex flex-col gap-5 rounded-[var(--radius-card)] border-2 border-text bg-surface p-6">
        <h2 id="sinjs-recibo" className="text-2xl font-bold text-text">
          {state.kind === 'support' ? 'Te sumaste a un reporte que ya estaba abierto' : 'Recibimos tu solicitud'}
        </h2>
        <dl className="grid gap-4">
          <div>
            <dt className="text-[15px] font-semibold text-text-2">Tu código</dt>
            <dd className="font-mono text-2xl font-bold tracking-wider text-text">{state.reference}</dd>
          </div>
          <div>
            <dt className="text-[15px] font-semibold text-text-2">Tu clave</dt>
            <dd className="font-mono text-2xl font-bold tracking-wider text-text">{state.secret}</dd>
          </div>
        </dl>
        <p className="rounded-xl bg-warn-soft p-3 text-[15px] text-text">
          <strong>Anótalos o imprime esta página ahora.</strong> La clave se muestra solo esta vez y nadie del equipo la tiene. Con los dos consultas tu
          solicitud en «Consultar mi solicitud».
        </p>
        <a href="/atencion/consultar" className={buttonStyle({ tone: 'outline', size: 'md' })}>
          Consultar mi solicitud
        </a>
        <p className="text-[15px] text-text-2">{EMERGENCY_TEXT}</p>
      </section>
    );
  }

  const v = state?.status === 'error' ? state.values : {};
  const e = state?.status === 'error' ? (state.fieldErrors ?? {}) : {};
  const err = (k: string) => e[k];
  const type = (v.type as RequestType) || presetType || '';

  return (
    <form action={action} className={cn(webCard, 'relative flex flex-col gap-6 p-5 sm:p-8')}>
      <input type="hidden" name="submissionKey" value={v.submissionKey || formKey} />
      <input type="hidden" name="linkedItemId" value={v.linkedItemId || linkedItemId || ''} />
      <p className="text-[15px] text-text-2">Tu navegador no tiene JavaScript activo: aquí va el formulario completo en una sola página, sin archivos ni mapa.</p>
      {state?.status === 'error' ? (
        <div role="alert" className="rounded-2xl border-2 border-danger bg-danger-soft p-4 text-text">
          <p className="font-bold text-danger">{state.error}</p>
          {Object.keys(e).length ? (
            <ul className="mt-2 list-disc pl-5 text-[15px]">
              {Object.entries(e).map(([k, m]) => (
                <li key={k}>{m}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-base font-semibold text-text">¿Qué quieres enviar?</legend>
        {REQUEST_TYPES.map((t) => (
          <label key={t} className="flex min-h-11 items-start gap-3 text-[15px] text-text">
            <input type="radio" name="type" value={t} defaultChecked={type === t} required className="mt-0.5 size-5 accent-accent" />
            <span>
              <strong>{TYPE_COPY[t].label}</strong>: {TYPE_COPY[t].hint}
            </span>
          </label>
        ))}
        {err('type') ? <FieldError id="sinjs-type-error">{err('type')}</FieldError> : null}
      </fieldset>
      <Notice tone="private">Si es una denuncia: {DENUNCIA_TEXT} En una denuncia va solo el lugar aproximado; deja vacío el punto de referencia.</Notice>

      <FieldBox id="sinjs-categoryId" label="Categoría" error={err('categoryId')}>
        <select id="sinjs-categoryId" name="categoryId" defaultValue={v.categoryId ?? ''} className={inputStyle} required aria-describedby={describedBy('sinjs-categoryId', { error: err('categoryId') })}>
          <option value="">Elige una categoría</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </FieldBox>
      <FieldBox id="sinjs-municipalityId" label="Municipio" hint="Hace falta en un reporte, una petición o una denuncia." error={err('municipalityId')}>
        <select id="sinjs-municipalityId" name="municipalityId" defaultValue={v.municipalityId ?? ''} className={inputStyle} aria-describedby={describedBy('sinjs-municipalityId', { hint: true, error: err('municipalityId') })}>
          <option value="">Elige el municipio</option>
          {municipalities.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </FieldBox>
      <FieldBox id="sinjs-sector" label="Parroquia, localidad o sector" optional error={err('sector')}>
        <input id="sinjs-sector" name="sector" defaultValue={v.sector ?? ''} maxLength={200} className={inputStyle} />
      </FieldBox>
      <FieldBox id="sinjs-locationReference" label="Punto de referencia" optional hint="No en una denuncia." error={err('locationReference')}>
        <input id="sinjs-locationReference" name="locationReference" defaultValue={v.locationReference ?? ''} maxLength={300} className={inputStyle} />
      </FieldBox>
      <FieldBox id="sinjs-title" label="Título" error={err('title')}>
        <input id="sinjs-title" name="title" defaultValue={v.title ?? ''} maxLength={140} required className={inputStyle} />
      </FieldBox>
      <FieldBox id="sinjs-description" label="Cuéntanos" hint="Qué pasa, desde cuándo y a quién afecta." error={err('description')}>
        <textarea id="sinjs-description" name="description" defaultValue={v.description ?? ''} maxLength={4000} rows={6} required className={cn(inputStyle, 'min-h-40')} />
      </FieldBox>
      <FieldBox id="sinjs-eventDate" label="¿Cuándo pasó?" optional error={err('eventDate')} className="max-w-xs">
        <input id="sinjs-eventDate" name="eventDate" type="date" max={today} defaultValue={v.eventDate ?? ''} className={inputStyle} />
      </FieldBox>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-base font-semibold text-text">¿Cómo te contactamos? (opcional)</legend>
        <label className="flex min-h-11 items-start gap-3 text-[15px] text-text">
          <input type="checkbox" name="anonymous" defaultChecked={v.anonymous === 'on'} className="mt-0.5 size-5 accent-accent" />
          <span>
            <strong>Enviar como anónimo.</strong> Deja vacíos los datos de abajo y guarda bien tu código y tu clave.
          </span>
        </label>
        {err('anonymous') ? <FieldError id="sinjs-anonymous-error">{err('anonymous')}</FieldError> : null}
        <FieldBox id="sinjs-name" label="Nombre" optional error={err('contact.name')}>
          <input id="sinjs-name" name="name" defaultValue={v.name ?? ''} maxLength={120} autoComplete="name" className={inputStyle} />
        </FieldBox>
        <FieldBox id="sinjs-email" label="Correo" optional error={err('contact.email')}>
          <input id="sinjs-email" name="email" type="email" defaultValue={v.email ?? ''} maxLength={254} autoComplete="email" className={inputStyle} />
        </FieldBox>
        <FieldBox id="sinjs-phone" label="Teléfono" optional error={err('contact.phone')}>
          <input id="sinjs-phone" name="phone" type="tel" defaultValue={v.phone ?? ''} maxLength={40} autoComplete="tel" className={inputStyle} />
        </FieldBox>
        <FieldBox id="sinjs-channel" label="¿Por dónde prefieres que te contacten?" optional error={err('contact')}>
          <select id="sinjs-channel" name="channel" defaultValue={v.channel ?? ''} className={inputStyle}>
            <option value="">Por el correo o el teléfono que deje</option>
            {(['email', 'phone', 'whatsapp', 'none'] as const).map((c) => (
              <option key={c} value={c}>
                {CONTACT_CHANNEL_LABEL[c]}
              </option>
            ))}
          </select>
        </FieldBox>
        <label className="flex min-h-11 items-start gap-3 text-[15px] text-text">
          <input type="checkbox" name="publishNameConsent" defaultChecked={v.publishNameConsent === 'on'} className="mt-0.5 size-5 accent-accent" />
          <span>Si se resuelve y el equipo lo publica en «Lo atendido», pueden poner mi nombre (si no, solo mis iniciales).</span>
        </label>
      </fieldset>

      <label className="flex min-h-11 items-start gap-3 rounded-2xl border border-border p-4 text-[15px] text-text">
        <input type="checkbox" name="privacyAccepted" defaultChecked={v.privacyAccepted === 'on'} required className="mt-0.5 size-5 accent-accent" />
        <span>
          Leí el{' '}
          <a href="/aviso-de-privacidad" className="font-semibold text-accent-ink underline">
            aviso de privacidad
          </a>{' '}
          y acepto que usen lo que envío solo para atender mi solicitud.
        </span>
      </label>
      {err('privacyAccepted') ? <FieldError id="sinjs-privacy-error">{err('privacyAccepted')}</FieldError> : null}
      <Honeypot />
      <button type="submit" className={buttonStyle({ tone: 'action', size: 'lg' })}>
        Enviar
      </button>
      <p className="text-[15px] text-text-2">{EMERGENCY_TEXT}</p>
    </form>
  );
}
