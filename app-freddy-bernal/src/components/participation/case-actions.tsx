'use client';

import { useActionState, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { addCaseInfo, confirmCase } from '@/lib/actions/participation';
import type { CaseActionState } from '@/lib/actions/participation-types';
import { cn } from '@/lib/cn';
import { Btn, FieldBox, FieldError, Notice, describedBy, inputStyle } from './kit';
import { FilePicker, type PickedFile } from './file-picker';
import { uploadFile } from './files-client';

const noSubscribe = () => () => {};
/** True once the page runs in the browser (files need JavaScript; the server's render leaves the picker out). */
const useInBrowser = () => useSyncExternalStore(noSubscribe, () => true, () => false);

type Upload = { busy: boolean; failed: { file: PickedFile; error: string }[]; messageId: string | null };

/**
 * «Agregar información» (design §4): a message to the staff and up to 3 files that go up right after it, tied to that
 * message, while the consultation lasts. A case that was waiting for information goes back to review. Then the page
 * reads the request again (the timeline with the new message).
 */
export function AddInfoForm({ maxFileBytes, asked }: { maxFileBytes: number; asked: boolean }) {
  const router = useRouter();
  const inBrowser = useInBrowser();
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [upload, setUpload] = useState<Upload>({ busy: false, failed: [], messageId: null });
  const filesRef = useRef<PickedFile[]>([]);
  const statusRef = useRef<HTMLDivElement>(null);
  const pick = (list: PickedFile[]) => {
    filesRef.current = list;
    setFiles(list);
  };

  async function sendFiles(list: PickedFile[], messageId: string) {
    setUpload({ busy: true, failed: [], messageId });
    const failed: Upload['failed'] = [];
    for (const f of list) {
      const r = await uploadFile('/atencion/consultar/adjuntos', { messageId }, f.file);
      if (!r.ok) failed.push({ file: f, error: r.error });
    }
    setUpload({ busy: false, failed, messageId });
  }

  const [state, action, pending] = useActionState(async (prev: CaseActionState, fd: FormData): Promise<CaseActionState> => {
    const r = await addCaseInfo(prev, fd);
    if (r?.status === 'ok') {
      const picked = filesRef.current;
      pick([]);
      if (picked.length && r.messageId) await sendFiles(picked, r.messageId);
      router.refresh();
    } else if (r?.status === 'error' && r.expired) router.refresh();
    statusRef.current?.focus();
    return r;
  }, null);

  const error = state?.status === 'error' ? state : null;
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FieldBox
        id="f-body"
        label={asked ? 'Su respuesta' : 'Información adicional'}
        hint="Datos nuevos o aclaraciones sobre el problema. Lo lee el personal que atiende su solicitud."
        error={error?.fieldErrors?.body}
      >
        <textarea
          id="f-body"
          name="body"
          rows={5}
          maxLength={4000}
          required
          className={cn(inputStyle, 'min-h-32 leading-relaxed')}
          aria-invalid={error?.fieldErrors?.body ? true : undefined}
          aria-describedby={describedBy('f-body', { hint: true, error: error?.fieldErrors?.body })}
        />
      </FieldBox>
      {inBrowser ? <FilePicker id="f-info-files" files={files} onChange={pick} maxBytes={maxFileBytes} /> : null}
      <div ref={statusRef} tabIndex={-1} aria-live="polite" className="outline-none">
        {error && !error.fieldErrors ? <FieldError id="f-body-status">{error.error}</FieldError> : null}
        {state?.status === 'ok' && !upload.busy && !upload.failed.length ? <p className="text-[15px] font-medium text-ok">Información enviada al personal de atención.</p> : null}
        {upload.busy ? <p className="text-[15px] text-text-2">Subiendo archivos…</p> : null}
        {upload.failed.length ? (
          <Notice tone="danger">
            <p>
              Su mensaje quedó guardado, pero no se pudo subir {upload.failed.length === 1 ? 'un archivo' : `${upload.failed.length} archivos`}:{' '}
              {upload.failed.map((f) => `${f.file.file.name} (${f.error})`).join('; ')}.
            </p>
            <Btn
              tone="soft"
              size="sm"
              className="mt-2"
              onClick={async () => {
                if (!upload.messageId) return;
                await sendFiles(upload.failed.map((f) => f.file), upload.messageId);
                router.refresh();
              }}
            >
              Reintentar
            </Btn>
          </Notice>
        ) : null}
      </div>
      <Btn type="submit" tone="olive" size="lg" disabled={pending || upload.busy}>
        {pending ? 'Enviando…' : 'Enviar información'}
      </Btn>
    </form>
  );
}

/** «¿Se resolvió?»: yes, or no with what is missing (the case reopens, with a record the team sees). Works without JS. */
export function ConfirmForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState(confirmCase, null);
  const [answer, setAnswer] = useState<'si' | 'no' | ''>('');
  const seen = useRef<CaseActionState>(null);
  const statusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state || seen.current === state) return;
    seen.current = state;
    if (state.status === 'ok' || (state.status === 'error' && state.expired)) router.refresh();
    else statusRef.current?.focus();
  }, [state, router]);

  const fe = state?.status === 'error' ? (state.fieldErrors ?? {}) : {};
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <fieldset className="flex flex-col gap-2" aria-describedby={fe.resolved ? 'f-resolved-error' : undefined}>
        <legend className="text-base font-semibold text-text">¿Se resolvió el problema?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ['si', 'Sí, se resolvió'],
              ['no', 'No, todavía no'],
            ] as const
          ).map(([value, label], i) => (
            <label key={value} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface px-4 has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
              <input id={i === 0 ? 'f-resolved' : undefined} type="radio" name="resolved" value={value} checked={answer === value} onChange={() => setAnswer(value)} required className="size-5 accent-accent" />
              <span className="text-[15px] font-medium text-text">{label}</span>
            </label>
          ))}
        </div>
        {fe.resolved ? <FieldError id="f-resolved-error">{fe.resolved}</FieldError> : null}
      </fieldset>
      <FieldBox
        id="f-comment"
        label={answer === 'no' ? '¿Qué falta por resolver?' : 'Comentario'}
        optional={answer !== 'no'}
        hint={answer === 'no' ? 'Su solicitud vuelve a atención y el personal leerá su comentario.' : undefined}
        error={fe.comment}
      >
        <textarea
          id="f-comment"
          name="comment"
          rows={3}
          maxLength={4000}
          className={cn(inputStyle, 'min-h-24')}
          aria-invalid={fe.comment ? true : undefined}
          aria-describedby={describedBy('f-comment', { hint: answer === 'no', error: fe.comment })}
        />
      </FieldBox>
      <div ref={statusRef} tabIndex={-1} aria-live="polite" className="outline-none">
        {state?.status === 'error' && !state.fieldErrors ? <FieldError id="f-confirm-status">{state.error}</FieldError> : null}
      </div>
      <Btn type="submit" tone="olive" size="lg" disabled={pending}>
        {pending ? 'Enviando…' : 'Responder'}
      </Btn>
    </form>
  );
}
