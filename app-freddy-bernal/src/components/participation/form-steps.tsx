'use client';

import { PLACE_REQUIRED, REQUEST_TYPES, type RequestType } from '@/lib/participation/input';
import type { FieldErrors } from '@/lib/actions/participation-types';
import type { PublicCategory, Territory } from '@/lib/web/public';
import { cn } from '@/lib/cn';
import { DenunciaNote, FieldBox, FieldError, Notice, describedBy, inputStyle } from './kit';
import { LocationPicker } from './location-picker';
import { FilePicker, type PickedFile } from './file-picker';
import { DETAIL_COPY, TYPE_COPY } from './words';
import type { FormValues } from './form-core';

type StepProps = { v: FormValues; set: (p: Partial<FormValues>) => void; errors: FieldErrors };

const optionCard =
  'flex min-h-12 cursor-pointer items-start gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors motion-reduce:transition-none hover:border-accent has-[:checked]:border-accent has-[:checked]:bg-accent-soft';

/** Step 1, «Tipo»: the kind of request and its category. */
export function StepWhat({ v, set, errors, categories }: StepProps & { categories: PublicCategory[] }) {
  return (
    <div className="flex flex-col gap-8">
      <fieldset className="flex flex-col gap-3" aria-describedby={errors.type ? 'f-type-error' : undefined}>
        <legend className="mb-1 text-base font-semibold text-text">Seleccione una opción</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {REQUEST_TYPES.map((t, i) => (
            <label key={t} className={cn(optionCard, t === 'denuncia' && 'sm:col-span-2')}>
              <input
                id={i === 0 ? 'f-type' : undefined}
                type="radio"
                name="type"
                value={t}
                checked={v.type === t}
                onChange={() => set(t === 'denuncia' ? { type: t, point: null, locationConsent: false, locationReference: '' } : { type: t })}
                className="mt-1 size-5 shrink-0 accent-accent"
              />
              <span className="min-w-0">
                <span className="block text-lg font-semibold leading-snug text-text">{TYPE_COPY[t].label}</span>
                <span className="block text-[15px] leading-snug text-text-2">{TYPE_COPY[t].hint}</span>
              </span>
            </label>
          ))}
        </div>
        {errors.type ? <FieldError id="f-type-error">{errors.type}</FieldError> : null}
      </fieldset>

      {v.type === 'denuncia' ? <DenunciaNote /> : null}

      {v.type ? (
        <fieldset className="flex flex-col gap-3" aria-describedby={errors.categoryId ? 'f-categoryId-error' : undefined}>
          <legend className="mb-1 text-base font-semibold text-text">Categoría</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {categories.map((c, i) => (
              <label key={c.id} className={cn(optionCard, 'p-3.5')}>
                <input
                  id={i === 0 ? 'f-categoryId' : undefined}
                  type="radio"
                  name="categoryId"
                  value={c.id}
                  checked={v.categoryId === c.id}
                  onChange={() => set({ categoryId: c.id })}
                  className="mt-0.5 size-5 shrink-0 accent-accent"
                />
                <span className="min-w-0">
                  <span className="block font-semibold text-text">{c.name}</span>
                  {c.description ? <span className="block text-sm leading-snug text-text-2">{c.description}</span> : null}
                </span>
              </label>
            ))}
          </div>
          {errors.categoryId ? <FieldError id="f-categoryId-error">{errors.categoryId}</FieldError> : null}
        </fieldset>
      ) : null}
    </div>
  );
}

/** Step 2, «Lugar»: municipality, parish or the place as people say it, a reference and, if wanted, the exact point. */
export function StepWhere({ v, set, errors, municipalities }: StepProps & { municipalities: Territory[] }) {
  const type = v.type || 'reporte';
  const required = PLACE_REQUIRED.includes(type as RequestType);
  const parishes = municipalities.find((m) => m.id === v.municipalityId)?.parishes ?? [];
  const denuncia = type === 'denuncia';
  return (
    <div className="flex flex-col gap-6">
      {!required ? <p className="text-[15px] text-text-2">Si su {TYPE_COPY[type].label.toLowerCase()} se refiere a un lugar, indíquelo. Si no, continúe.</p> : null}
      <FieldBox id="f-municipalityId" label="Municipio" optional={!required} error={errors.municipalityId}>
        <select
          id="f-municipalityId"
          className={inputStyle}
          value={v.municipalityId}
          onChange={(e) => set({ municipalityId: e.currentTarget.value, parishId: '' })}
          aria-invalid={errors.municipalityId ? true : undefined}
          aria-describedby={describedBy('f-municipalityId', { error: errors.municipalityId })}
          required={required}
        >
          <option value="">Seleccione el municipio</option>
          {municipalities.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </FieldBox>
      {parishes.length ? (
        <FieldBox id="f-parishId" label="Parroquia" optional error={errors.parishId}>
          <select
            id="f-parishId"
            className={inputStyle}
            value={v.parishId}
            onChange={(e) => set({ parishId: e.currentTarget.value })}
            aria-invalid={errors.parishId ? true : undefined}
            aria-describedby={describedBy('f-parishId', { error: errors.parishId })}
          >
            <option value="">No sé o no aparece</option>
            {parishes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </FieldBox>
      ) : null}
      <FieldBox
        id="f-sector"
        label={parishes.length ? 'Localidad o sector' : 'Parroquia, localidad o sector'}
        optional
        hint="Barrio, urbanización, caserío o sector, como se conoce en la zona."
        error={errors.sector}
      >
        <input
          id="f-sector"
          className={inputStyle}
          value={v.sector}
          maxLength={200}
          onChange={(e) => set({ sector: e.currentTarget.value })}
          aria-invalid={errors.sector ? true : undefined}
          aria-describedby={describedBy('f-sector', { hint: true, error: errors.sector })}
        />
      </FieldBox>
      {denuncia ? (
        <Notice tone="private">En una denuncia se pide solo el lugar aproximado, es decir, el municipio y el sector. No se pide la dirección exacta ni su ubicación.</Notice>
      ) : (
        <>
          <FieldBox id="f-locationReference" label="Punto de referencia" optional hint="Por ejemplo: «frente a la bodega» o «al lado de la escuela»." error={errors.locationReference}>
            <input
              id="f-locationReference"
              className={inputStyle}
              value={v.locationReference}
              maxLength={300}
              onChange={(e) => set({ locationReference: e.currentTarget.value })}
              aria-invalid={errors.locationReference ? true : undefined}
              aria-describedby={describedBy('f-locationReference', { hint: true, error: errors.locationReference })}
            />
          </FieldBox>
          <LocationPicker point={v.point} onChange={(p) => set({ point: p, locationConsent: !!p })} error={errors.locationConsent ?? errors.point} />
        </>
      )}
    </div>
  );
}

/** Step 3, «Detalle»: title, description, date and files. */
export function StepDetail({
  v, set, errors, today, files, onFiles, maxFileBytes, remembered,
}: StepProps & { today: string; files: PickedFile[]; onFiles: (f: PickedFile[]) => void; maxFileBytes: number; remembered: string[] }) {
  const type = v.type || 'reporte';
  const copy = DETAIL_COPY[type];
  const left = 4000 - v.description.length;
  return (
    <div className="flex flex-col gap-6">
      <FieldBox id="f-title" label="Título" hint={copy.title} error={errors.title}>
        <input
          id="f-title"
          className={inputStyle}
          value={v.title}
          maxLength={140}
          onChange={(e) => set({ title: e.currentTarget.value })}
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={describedBy('f-title', { hint: true, error: errors.title })}
          required
        />
      </FieldBox>
      <FieldBox
        id="f-description"
        label="Descripción"
        hint={`${copy.description} No incluya datos personales de otras personas.`}
        error={errors.description}
      >
        <textarea
          id="f-description"
          className={cn(inputStyle, 'min-h-40 leading-relaxed')}
          value={v.description}
          maxLength={4000}
          rows={6}
          onChange={(e) => set({ description: e.currentTarget.value })}
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={describedBy('f-description', { hint: true, error: errors.description, extra: 'f-description-count' })}
          required
        />
        <p id="f-description-count" className="text-right text-sm text-text-2">
          {left < 400 ? `Quedan ${left} caracteres` : `${v.description.length} de 4000 caracteres`}
        </p>
      </FieldBox>
      <FieldBox id="f-eventDate" label="Fecha del hecho" optional hint="Si la conoce." error={errors.eventDate} className="max-w-xs">
        <input
          id="f-eventDate"
          type="date"
          className={inputStyle}
          value={v.eventDate}
          max={today}
          onChange={(e) => set({ eventDate: e.currentTarget.value })}
          aria-invalid={errors.eventDate ? true : undefined}
          aria-describedby={describedBy('f-eventDate', { hint: true, error: errors.eventDate })}
        />
      </FieldBox>
      <FilePicker id="f-attachments" files={files} onChange={onFiles} maxBytes={maxFileBytes} error={errors.attachments} remembered={remembered} />
    </div>
  );
}
