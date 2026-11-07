'use client';

import { useRef, useState } from 'react';
import { FileText, ImageIcon, Paperclip, X } from 'lucide-react';
import { ATTACHMENT_ACCEPT, FILES_PER_SEND } from '@/lib/actions/participation-types';
import { cn } from '@/lib/cn';
import { prepareFile } from './files-client';
import { uuidV4 } from './form-core';
import { FieldError, describedBy } from './kit';
import { fileSize } from './words';

export type PickedFile = { id: string; file: File };

/**
 * «Fotos o documentos» (design §4): up to 3 files, JPG, PNG or WebP photos (cleaned and, when big, re-encoded on the
 * phone before anything leaves it) and PDF documents. They go up right after the request is saved, one by one.
 */
export function FilePicker({
  id, files, onChange, maxBytes, error, remembered = [], label = 'Fotos o documentos', hint,
}: {
  id: string;
  files: PickedFile[];
  onChange: (files: PickedFile[]) => void;
  maxBytes: number;
  error?: string;
  remembered?: string[];
  label?: string;
  hint?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const [problems, setProblems] = useState<string[]>([]);
  const room = FILES_PER_SEND - files.length;
  const mb = Math.round(maxBytes / (1024 * 1024));
  const hintText =
    hint ??
    `Fotos JPG, PNG o WebP, o documentos PDF. Hasta ${FILES_PER_SEND} archivos, con un máximo de ${mb} MB cada uno. Antes de enviarlas, se eliminan de las fotos la ubicación y otros datos internos.`;

  async function pick(list: FileList | null) {
    if (!list?.length) return;
    const chosen = [...list].slice(0, Math.max(0, room));
    const issues: string[] = [];
    if (list.length > room) issues.push(`Se admiten hasta ${FILES_PER_SEND} archivos. Se tomaron los primeros.`);
    setBusy(chosen.length);
    const added: PickedFile[] = [];
    for (const f of chosen) {
      const r = await prepareFile(f, maxBytes);
      if (r.ok) added.push({ id: uuidV4(), file: r.file });
      else issues.push(`${f.name}: ${r.error}`);
      setBusy((b) => Math.max(0, b - 1));
    }
    setProblems(issues);
    if (added.length) onChange([...files, ...added]);
    if (input.current) input.current.value = '';
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-base font-semibold text-text">
        {label} <span className="font-normal text-text-2">(opcional)</span>
      </p>
      <p id={`${id}-hint`} className="-mt-1 text-[15px] leading-snug text-text-2">
        {hintText}
      </p>
      {remembered.length && !files.length ? (
        <p className="rounded-xl bg-surface-2 p-3 text-[15px] text-text">
          Antes había elegido {remembered.join(', ')}. Al recargar la página, el navegador no conserva los archivos. Elíjalos de nuevo si desea enviarlos.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={input}
          id={id}
          type="file"
          multiple
          accept={ATTACHMENT_ACCEPT}
          disabled={room <= 0 || busy > 0}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, { hint: true, error })}
          onChange={(e) => void pick(e.currentTarget.files)}
          className="peer sr-only"
        />
        <label
          htmlFor={id}
          className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border-2 border-dashed border-accent bg-surface px-4 py-2 text-[15px] font-semibold text-text hover:bg-accent-soft peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus peer-disabled:cursor-not-allowed peer-disabled:opacity-60"
        >
          <Paperclip className="h-5 w-5 text-accent-ink" aria-hidden />
          {files.length ? 'Agregar otro archivo' : 'Elegir fotos o documentos'}
        </label>
        <span className="text-sm text-text-2">
          {files.length ? `${files.length} de ${FILES_PER_SEND}` : 'Ningún archivo elegido'}
        </span>
      </div>
      <p role="status" aria-live="polite" className={cn('text-[15px] text-text-2', !busy && 'sr-only')}>
        {busy ? `Preparando ${busy === 1 ? 'un archivo' : `${busy} archivos`}…` : ''}
      </p>
      {problems.length ? (
        <ul className="flex flex-col gap-1" aria-live="polite">
          {problems.map((p, i) => (
            <li key={`${i}-${p}`}>
              <FieldError id={`${id}-problem-${i}`}>{p}</FieldError>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
      {files.length ? (
        <ul className="flex flex-col gap-2" aria-label="Archivos elegidos">
          {files.map((f) => {
            const pdf = f.file.type === 'application/pdf';
            const Icon = pdf ? FileText : ImageIcon;
            return (
              <li key={f.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2">
                <Icon className="h-5 w-5 shrink-0 text-accent-ink" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium text-text">{f.file.name}</span>
                  <span className="block text-sm text-text-2">{fileSize(f.file.size)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => onChange(files.filter((x) => x.id !== f.id))}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-control)] text-text hover:bg-surface-2"
                  aria-label={`Quitar ${f.file.name}`}
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
