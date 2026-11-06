'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Search, Upload } from 'lucide-react';
import { useAction } from '@/lib/hooks/use-action';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import {
  findDuplicates,
  markRequestSpam,
  mergeRequest,
  publishAttended,
  redactRequestField,
  redactRequestMessage,
  shareEvidence,
  withdrawAttended,
  withholdAttachment,
} from '@/lib/actions/attention';
import { REDACT_FIELDS, REDACT_FIELD_LABEL, REQUEST_STATE_LABEL, initialsOf, type RedactField, type RequestState, type RequestType } from '@/lib/domain/attention';

const hint = 'text-sm text-text-2';

// --- Files --------------------------------------------------------------------------------------------------------------------

/** Share (or stop sharing) a piece of the team's evidence with the person; withhold a file (moderation). */
export function FileActions({ fileId, kind, shared, canWork, canSteer }: { fileId: string; kind: 'citizen' | 'evidence'; shared: boolean; canWork: boolean; canSteer: boolean }) {
  const { run, pending } = useAction();
  const [why, setWhy] = useState('');
  const whyId = useId();
  return (
    <div className="flex flex-wrap items-start gap-2">
      {kind === 'evidence' && canWork ? (
        <Button type="button" variant="secondary" size="sm" className="min-h-11" disabled={pending} onClick={() => run(() => shareEvidence({ attachmentId: fileId, shared: !shared }), { success: shared ? 'La persona ya no la ve.' : 'Ahora la ve la persona en su consulta.' })}>
          {shared ? 'Dejar de compartir' : 'Compartir con la persona'}
        </Button>
      ) : null}
      {canSteer ? (
        <details className="w-full">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-accent-ink">Retirar este archivo</summary>
          <form
            className="mt-1 flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => withholdAttachment({ attachmentId: fileId, reason: why }), { success: 'Archivo retirado: queda guardado y no se sirve más.' });
            }}
          >
            <Field label="Por qué se retira" htmlFor={whyId} hint="Por ejemplo, expone a alguien. Queda en el historial.">
              <Input id={whyId} value={why} onChange={(e) => setWhy(e.target.value)} required maxLength={1000} />
            </Field>
            <Button type="submit" variant="danger" size="sm" className="min-h-11 w-fit" disabled={pending}>Retirar</Button>
          </form>
        </details>
      ) : null}
    </div>
  );
}

/** «Subir evidencia»: a photo after the work, or a paper; into the private bucket, through the authorized route. */
export function EvidenceUpload({ id, maxBytes }: { id: string; maxBytes: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [shared, setShared] = useState(true);
  const input = useRef<HTMLInputElement>(null);
  const ids = { file: useId(), shared: useId() };
  const mb = Math.round(maxBytes / (1024 * 1024));
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const file = input.current?.files?.[0];
        if (!file) return toast.error('Elige una foto o un PDF.');
        if (file.size > maxBytes) return toast.error(`El archivo pasa de ${mb} MB: sube uno más liviano.`);
        setBusy(true);
        try {
          const body = new FormData();
          body.set('file', file);
          body.set('shared', shared ? '1' : '0');
          const res = await fetch(`/admin/atencion/${id}/evidencias`, { method: 'POST', body });
          const out = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
          if (!res.ok || !out.ok) toast.error(out.error ?? 'No se pudo subir. Vuelve a intentarlo.');
          else {
            toast.success(shared ? 'Evidencia subida: la ve la persona.' : 'Evidencia subida: solo el equipo.');
            if (input.current) input.current.value = '';
            router.refresh();
          }
        } catch {
          toast.error('No se pudo subir. Revisa la señal y vuelve a intentarlo.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Foto o documento de la atención" htmlFor={ids.file} hint={`JPG, PNG o PDF, hasta ${mb} MB. A las fotos se les quitan los datos de ubicación.`}>
        <Input id={ids.file} ref={input} type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf" required />
      </Field>
      <label htmlFor={ids.shared} className="flex min-h-11 items-center gap-2 text-[15px]">
        <input id={ids.shared} type="checkbox" className="h-5 w-5 accent-accent" checked={shared} onChange={(e) => setShared(e.target.checked)} />
        Que la vea la persona en su consulta
      </label>
      <Button type="submit" variant="secondary" className="w-fit" disabled={busy}>
        <Upload className="h-4 w-4" aria-hidden /> {busy ? 'Subiendo…' : 'Subir evidencia'}
      </Button>
    </form>
  );
}

// --- Duplicates ------------------------------------------------------------------------------------------------------------

type Candidate = { id: string; reference: string; title: string; state: RequestState; municipality: string | null };

export function MergePanel({ id, reference }: { id: string; reference: string }) {
  const { run, pending } = useAction();
  const { confirm, dialog } = useConfirm();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Candidate[] | null>(null);
  const [other, setOther] = useState('');
  const [direction, setDirection] = useState<'into-other' | 'into-this'>('into-other');
  const [reason, setReason] = useState('');
  const ids = { q: useId(), reason: useId() };
  const chosen = found?.find((c) => c.id === other);
  return (
    <div className="flex flex-col gap-3">
      {dialog}
      <p className={hint}>Si es el mismo problema que otro caso abierto del mismo tipo: se unen y los dos guardan su historia. El repetido se cierra y apunta al que se queda; sus apoyos pasan y cuentan allí.</p>
      {/* Side by side from the tablet up; stacked again in the case page's narrow column on a computer. */}
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end lg:flex-col lg:items-stretch"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => findDuplicates({ id, q }), { refresh: false, onOk: (r) => setFound(((r as { data?: Candidate[] }).data ?? []) as Candidate[]) });
        }}
      >
        <Field label="Buscar el otro caso" htmlFor={ids.q} className="flex-1" hint="Por código o por palabras del título. Vacío: los de la misma categoría y municipio.">
          <Input id={ids.q} value={q} onChange={(e) => setQ(e.target.value)} type="search" autoComplete="off" />
        </Field>
        <Button type="submit" variant="secondary" className="lg:self-start" disabled={pending}>
          <Search className="h-4 w-4" aria-hidden /> Buscar
        </Button>
      </form>
      {found ? (
        found.length ? (
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm font-semibold">Elige el caso</legend>
            {found.map((c) => (
              <label key={c.id} className="flex min-h-11 items-start gap-2 py-1 text-[15px]">
                <input type="radio" name={`merge-${id}`} className="mt-1 h-5 w-5 accent-accent" checked={other === c.id} onChange={() => setOther(c.id)} />
                <span className="min-w-0">
                  <span className="font-mono font-semibold">{c.reference}</span> · {REQUEST_STATE_LABEL[c.state]}
                  <span className="block text-text-2 [overflow-wrap:anywhere]">{c.title}{c.municipality ? ` · ${c.municipality}` : ''}</span>
                </span>
              </label>
            ))}
          </fieldset>
        ) : (
          <p className={hint} role="status">No hay otro caso abierto del mismo tipo con esa búsqueda.</p>
        )
      ) : null}
      {chosen ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const [dup, main] = direction === 'into-other' ? [id, chosen.id] : [chosen.id, id];
            const [dupRef, mainRef] = direction === 'into-other' ? [reference, chosen.reference] : [chosen.reference, reference];
            const ok = await confirm({ title: `¿Unir ${dupRef} a ${mainRef}?`, body: `${dupRef} se cierra y queda unida a ${mainRef}. Las dos historias se guardan.`, confirmLabel: 'Unir' });
            if (ok) run(() => mergeRequest({ id: dup, into: main, reason }), { onOk: () => setFound(null) });
          }}
        >
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm font-semibold">¿Cuál se queda?</legend>
            <label className="flex min-h-11 items-center gap-2 text-[15px]">
              <input type="radio" name={`dir-${id}`} className="h-5 w-5 accent-accent" checked={direction === 'into-other'} onChange={() => setDirection('into-other')} />
              Se queda {chosen.reference}; esta ({reference}) se une a ella
            </label>
            <label className="flex min-h-11 items-center gap-2 text-[15px]">
              <input type="radio" name={`dir-${id}`} className="h-5 w-5 accent-accent" checked={direction === 'into-this'} onChange={() => setDirection('into-this')} />
              Se queda esta ({reference}); {chosen.reference} se une a ella
            </label>
          </fieldset>
          <Field label="Motivo" htmlFor={ids.reason}>
            <Input id={ids.reason} value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={2000} />
          </Field>
          <Button type="submit" className="w-fit" disabled={pending}>Unir los casos</Button>
        </form>
      ) : null}
    </div>
  );
}

// --- «Lo atendido» -----------------------------------------------------------------------------------------------------------

export function AttendedForm({
  id, type, anonymous, nameConsent, municipality, published,
}: {
  id: string; type: RequestType; anonymous: boolean; nameConsent: boolean; municipality: string | null;
  published: { status: 'published' | 'withdrawn'; summary: string; displayName: string | null } | null;
}) {
  const { run, pending } = useAction();
  const denuncia = type === 'denuncia';
  const live = published?.status === 'published';
  const [summary, setSummary] = useState(live ? published!.summary : '');
  const [name, setName] = useState(live ? (published!.displayName ?? '') : '');
  const [why, setWhy] = useState('');
  const ids = { summary: useId(), name: useId(), why: useId() };
  return (
    <div className="flex flex-col gap-3">
      {live ? (
        <div className="rounded-[var(--radius-control)] border border-ok/30 bg-ok-soft p-3 text-[15px]" role="status">
          <p className="font-semibold">Publicada en «Lo atendido»</p>
          <p className="mt-1 [overflow-wrap:anywhere]">{published!.summary}</p>
          {published!.displayName ? <p className="mt-1 text-sm">— {published!.displayName}</p> : null}
        </div>
      ) : null}
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => publishAttended({ id, summary: denuncia ? '' : summary, displayName: denuncia || anonymous ? '' : name }), { success: 'Publicada en «Lo atendido».' });
        }}
      >
        {denuncia ? (
          <p className={hint}>Una denuncia sale solo como «Denuncia atendida en el municipio {municipality ?? '…'}»: sin nombre, sin categoría, sin texto.</p>
        ) : (
          <>
            <Field label="Resumen para la web" htmlFor={ids.summary} hint="Lo que se hizo, en pocas palabras. Sin datos de nadie: ni nombres, ni teléfonos, ni direcciones.">
              <Textarea id={ids.summary} value={summary} onChange={(e) => setSummary(e.target.value)} required minLength={10} maxLength={600} rows={3} />
            </Field>
            {anonymous ? (
              <p className={hint}>La envió como anónima: sale sin nombre ni iniciales.</p>
            ) : (
              <Field
                label={nameConsent ? 'Nombre que sale (dio permiso)' : 'Iniciales que salen (no dio permiso para su nombre)'}
                htmlFor={ids.name}
                hint={nameConsent ? 'Puedes dejarlo vacío. Míralo en «Ver contacto».' : 'Solo iniciales, por ejemplo «M. P.». Puedes dejarlo vacío.'}
              >
                <Input
                  id={ids.name}
                  value={name}
                  onChange={(e) => setName(nameConsent ? e.target.value : e.target.value.toUpperCase())}
                  onBlur={() => !nameConsent && name && !/^([A-ZÁÉÍÓÚÑÜ]\.\s?){1,4}$/.test(name.trim()) && setName(initialsOf(name))}
                  maxLength={80}
                  autoComplete="off"
                />
              </Field>
            )}
          </>
        )}
        <Button type="submit" className="w-fit" disabled={pending}>{live ? 'Actualizar la publicación' : 'Publicar en «Lo atendido»'}</Button>
      </form>
      {live ? (
        <details>
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-accent-ink">Retirar de «Lo atendido»</summary>
          <form
            className="mt-1 flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => withdrawAttended({ id, reason: why }), { success: 'Se retiró de «Lo atendido».' });
            }}
          >
            <Field label="Por qué se retira" htmlFor={ids.why}>
              <Input id={ids.why} value={why} onChange={(e) => setWhy(e.target.value)} required maxLength={1000} />
            </Field>
            <Button type="submit" variant="danger" size="sm" className="min-h-11 w-fit" disabled={pending}>Retirar</Button>
          </form>
        </details>
      ) : null}
    </div>
  );
}

// --- Moderation (never to discard criticism) -----------------------------------------------------------------------------------

export function ModerationPanel({ id, isSpam, messages }: { id: string; isSpam: boolean; messages: { id: string; label: string }[] }) {
  const { run, pending } = useAction();
  const { confirm, dialog } = useConfirm();
  const [spamWhy, setSpamWhy] = useState('');
  const [field, setField] = useState<RedactField>('description');
  const [fieldWhy, setFieldWhy] = useState('');
  const [message, setMessage] = useState(messages[0]?.id ?? '');
  const [messageWhy, setMessageWhy] = useState('');
  const ids = { spam: useId(), field: useId(), fieldWhy: useId(), message: useId(), messageWhy: useId() };
  return (
    <div className="flex flex-col gap-4">
      {dialog}
      <p className={hint}>
        Una crítica o una queja nunca es spam: se atiende o se cierra con su motivo. Esto es para publicidad, amenazas o datos de alguien expuestos.
        «No procede» con su motivo se pone desde el estado.
      </p>
      {!isSpam ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await confirm({ title: '¿Marcar como spam?', body: 'Queda en «No procede», guardada, y no se le escribe a quien la envió.', confirmLabel: 'Marcar spam', tone: 'danger' })) {
              run(() => markRequestSpam({ id, reason: spamWhy }), { success: 'Marcada como spam.' });
            }
          }}
        >
          <Field label="Marcar como spam: por qué" htmlFor={ids.spam}>
            <Input id={ids.spam} value={spamWhy} onChange={(e) => setSpamWhy(e.target.value)} required maxLength={2000} />
          </Field>
          <Button type="submit" variant="danger" size="sm" className="min-h-11 w-fit" disabled={pending}>Marcar como spam</Button>
        </form>
      ) : null}
      <form
        className="flex flex-col gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await confirm({ title: `¿Retirar ${REDACT_FIELD_LABEL[field].toLowerCase()}?`, body: 'Se reemplaza para siempre; el historial guarda qué dato y por qué, nunca lo que decía.', confirmLabel: 'Retirar', tone: 'danger' })) {
            run(() => redactRequestField({ id, field, reason: fieldWhy }), { success: 'Dato retirado.', onOk: () => setFieldWhy('') });
          }
        }}
      >
        <Field label="Retirar un dato que expone a alguien" htmlFor={ids.field}>
          <Select id={ids.field} value={field} onChange={(e) => setField(e.target.value as RedactField)}>
            {REDACT_FIELDS.map((f) => (
              <option key={f} value={f}>{REDACT_FIELD_LABEL[f]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Por qué" htmlFor={ids.fieldWhy}>
          <Input id={ids.fieldWhy} value={fieldWhy} onChange={(e) => setFieldWhy(e.target.value)} required maxLength={2000} />
        </Field>
        <Button type="submit" variant="danger" size="sm" className="min-h-11 w-fit" disabled={pending}>Retirar el dato</Button>
      </form>
      {messages.length ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await confirm({ title: '¿Retirar el texto de ese mensaje?', body: 'Queda «[Texto retirado por el equipo]» en su lugar.', confirmLabel: 'Retirar', tone: 'danger' })) {
              run(() => redactRequestMessage({ messageId: message, reason: messageWhy }), { success: 'Texto retirado.', onOk: () => setMessageWhy('') });
            }
          }}
        >
          <Field label="Retirar el texto de un mensaje" htmlFor={ids.message}>
            <Select id={ids.message} value={message} onChange={(e) => setMessage(e.target.value)}>
              {messages.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Por qué" htmlFor={ids.messageWhy}>
            <Input id={ids.messageWhy} value={messageWhy} onChange={(e) => setMessageWhy(e.target.value)} required maxLength={2000} />
          </Field>
          <Button type="submit" variant="danger" size="sm" className="min-h-11 w-fit" disabled={pending}>Retirar el texto</Button>
        </form>
      ) : null}
    </div>
  );
}
