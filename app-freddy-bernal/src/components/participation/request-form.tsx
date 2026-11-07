'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useOffline } from 'next/offline';
import { ArrowLeft, ArrowRight, Check, Link2, WifiOff } from 'lucide-react';
import { checkSimilar, joinReport, sendRequest } from '@/lib/actions/participation';
import type { FieldErrors, SendResult, SimilarResult } from '@/lib/actions/participation-types';
import { PLACE_REQUIRED, type RequestType } from '@/lib/participation/input';
import { generateSecret } from '@/lib/participation/receipt-code';
import type { PublicCategory, Territory } from '@/lib/web/public';
import { cn } from '@/lib/cn';
import { Btn, EmergencyNote, Notice, Panel } from './kit';
import { ErrorSummary } from './error-summary';
import { StepDetail, StepWhat, StepWhere } from './form-steps';
import { ContactFields, Honeypot, PrivacyCheck } from './contact-fields';
import { JoinForm, SimilarOffer } from './similar-offer';
import { ReceiptView } from './receipt-view';
import { Turnstile } from './turnstile';
import type { PickedFile } from './file-picker';
import { uploadFile } from './files-client';
import { readDraft, removeDraft, writeDraft } from './draft-storage';
import {
  DRAFT_KEY, STEPS, canAskSimilar, emptyValues, errorsOfStep, filesAfterReload, firstErrorStep, hasContent, parseDraft, similarKey, toInput, uuidV4,
  validate, validateJoin, type Draft, type FormValues, type ReceiptFile, type Step,
} from './form-core';
import { TYPE_COPY } from './words';

export type LinkedInfo = { id: string; kindLabel: string; title: string; href: string };

type Props = {
  municipalities: Territory[];
  categories: PublicCategory[];
  linked: LinkedInfo | null;
  presetType: RequestType | null;
  today: string;
  siteName: string;
  maxFileBytes: number;
  turnstileSiteKey: string | null;
};

const NETWORK_TEXT = 'No se pudo enviar. Revise la señal e intente de nuevo. Lo escrito sigue guardado y no se enviará dos veces.';
// The order of the fields on screen (the summary lists them in it).
const ORDER = [
  'type', 'categoryId', 'municipalityId', 'parishId', 'sector', 'locationReference', 'point', 'locationConsent', 'title', 'description', 'eventDate',
  'attachments', 'note', 'anonymous', 'contact.name', 'contact.email', 'contact.phone', 'contact', 'publishNameConsent', 'privacyAccepted', 'linkedItemId', 'form',
];

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function stepTitle(step: Step, type: FormValues['type']): string {
  if (step === 1) return 'Tipo de solicitud';
  if (step === 2) return type === 'denuncia' ? 'Lugar aproximado' : PLACE_REQUIRED.includes((type || 'reporte') as RequestType) ? 'Lugar' : 'Lugar (si aplica)';
  if (step === 3) return 'Detalle de la solicitud';
  return 'Contacto y envío';
}

/** A form before this browser made its key and secret (the server's render): the same screen, not yet sendable. */
function blankDraft(type: RequestType | null, linkedItemId: string | null): Draft {
  return { v: 1, submissionKey: '', secret: '', step: 1, values: emptyValues({ type, linkedItemId }), fileNames: [], receipt: null, similarAnswered: null, savedAt: new Date(0).toISOString() };
}

/**
 * «Nueva solicitud» (design §4): four short steps, phone first. What is written stays in this tab (sessionStorage)
 * with the form's key and the receipt's secret, made here when the form starts: an error, a reload or a dropped
 * connection never loses it, and a retry gets the same receipt (the server is idempotent by the key; Next retries the
 * send itself when the signal comes back). The browser checks with the same schema as the server; the receipt shows
 * only once the database committed. Files go up right after, one by one, each with its own «Reintentar».
 */
export function RequestForm({ municipalities, categories, linked, presetType, today, siteName, maxFileBytes, turnstileSiteKey }: Props) {
  const [draft, setDraft] = useState<Draft>(() => blankDraft(presetType, linked?.id ?? null));
  const [ready, setReady] = useState(false);
  const [restored, setRestored] = useState(false);
  // The errors revealed by «Siguiente», «Enviar» or the server; what shows is derived from them (below).
  const [revealed, setShown] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [similar, setSimilar] = useState<{ phase: 'idle' | 'checking' | 'offer' | 'join'; count: number }>({ phase: 'idle', count: 0 });
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [uploadTick, setUploadTick] = useState(0);
  const offline = useOffline();
  const hpRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const fileStore = useRef(new Map<string, File>());
  const uploading = useRef(false);
  const focusNext = useRef<'heading' | 'summary' | null>(null);

  // The draft of this tab, or a new form with its key and secret (made here, in the browser, once). sessionStorage is an
  // external store the server cannot read: its draft comes in once, right after hydration.
  useEffect(() => {
    const preset = { type: presetType, linkedItemId: linked?.id ?? null };
    const saved = parseDraft(readDraft(DRAFT_KEY));
    let next: Draft;
    if (saved && (saved.receipt || hasContent(saved.values, preset))) {
      next = saved.receipt ? { ...saved, receipt: { ...saved.receipt, files: filesAfterReload(saved.receipt.files) } } : saved;
    } else if (saved) {
      next = { ...saved, step: 1, values: { ...saved.values, type: presetType ?? saved.values.type, linkedItemId: preset.linkedItemId ?? saved.values.linkedItemId } };
    } else {
      next = { ...blankDraft(presetType, preset.linkedItemId), submissionKey: uuidV4(), secret: generateSecret(), savedAt: new Date().toISOString() };
    }
    /* eslint-disable react-hooks/set-state-in-effect -- the one-time read of the tab's own storage after hydration */
    setDraft(next);
    setRestored(!!saved && !saved.receipt && next === saved);
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Everything written is kept in the tab as it is written.
  useEffect(() => {
    if (!ready || !draft.submissionKey) return;
    const t = setTimeout(() => writeDraft(DRAFT_KEY, JSON.stringify({ ...draft, savedAt: new Date().toISOString() })), 150);
    return () => clearTimeout(t);
  }, [draft, ready]);

  // The focus goes where the change happened: the step's title, or the summary of what to check.
  useEffect(() => {
    const f = focusNext.current;
    if (!f) return;
    focusNext.current = null;
    (f === 'summary' ? summaryRef.current : headingRef.current)?.focus();
  });

  // An error already shown goes away as soon as the field is right, and its words follow the field (new ones wait for
  // «Siguiente» or «Enviar»). The files' errors are the picker's own.
  const values = draft.values;
  const joining = similar.phase === 'join';
  const shown = useMemo(() => {
    const keys = Object.keys(revealed);
    if (!keys.length) return revealed;
    const all = joining ? validateJoin(values) : validate(values, today);
    const out: FieldErrors = {};
    for (const k of keys) if (k === 'attachments') out[k] = revealed[k];
    else if (all[k]) out[k] = all[k];
    return out;
  }, [revealed, values, joining, today]);

  const set = useCallback((p: Partial<FormValues>) => setDraft((d) => ({ ...d, values: { ...d.values, ...p } })), []);

  const updateFile = useCallback(
    (id: string, patch: Partial<ReceiptFile>) =>
      setDraft((d) => (d.receipt ? { ...d, receipt: { ...d.receipt, files: d.receipt.files.map((f) => (f.id === id ? { ...f, ...patch } : f)) } } : d)),
    [],
  );

  // The files of a saved request, one at a time (a bad connection does one thing at a time better).
  const receipt = draft.receipt;
  useEffect(() => {
    if (!receipt || uploading.current) return;
    const next = receipt.files.find((f) => f.status === 'pending');
    if (!next) return;
    const file = fileStore.current.get(next.id);
    if (!file) {
      updateFile(next.id, { status: 'lost' });
      return;
    }
    uploading.current = true;
    updateFile(next.id, { status: 'uploading', error: undefined });
    void uploadFile('/api/atencion/adjuntos', { reference: receipt.reference, secret: receipt.secret }, file)
      .then((res) => {
        if (res.ok) {
          fileStore.current.delete(next.id);
          updateFile(next.id, { status: 'done' });
        } else updateFile(next.id, { status: 'failed', error: res.error });
      })
      .finally(() => {
        uploading.current = false;
        setUploadTick((t) => t + 1);
      });
  }, [receipt, uploadTick, updateFile]);

  // When the signal comes back, the files that failed try again by themselves.
  useEffect(() => {
    const online = () =>
      setDraft((d) =>
        d.receipt
          ? { ...d, receipt: { ...d.receipt, files: d.receipt.files.map((f) => (f.status === 'failed' && fileStore.current.has(f.id) ? { ...f, status: 'pending', error: undefined } : f)) } }
          : d,
      );
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, []);

  function scrollToTop() {
    topRef.current?.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }

  function goTo(step: Step) {
    setDraft((d) => ({ ...d, step }));
    setShown({});
    setFormError(null);
    setSimilar({ phase: 'idle', count: 0 });
    focusNext.current = 'heading';
    scrollToTop();
  }

  function showErrors(errors: FieldErrors, extra: string | null = null) {
    setShown(errors);
    setFormError(extra);
    focusNext.current = 'summary';
  }

  function failed(r: Extract<SendResult, { ok: false }>) {
    const fe = r.fieldErrors && Object.keys(r.fieldErrors).length ? r.fieldErrors : null;
    if (fe && !joining) {
      const s = firstErrorStep(fe) ?? draft.step;
      if (s !== draft.step) setDraft((d) => ({ ...d, step: s }));
      showErrors(errorsOfStep(fe, s), r.code === 'validation' ? null : r.error);
    } else if (fe) showErrors(fe, r.code === 'validation' ? null : r.error);
    else showErrors({}, r.error);
  }

  function sent(r: Extract<SendResult, { ok: true }>, picked: PickedFile[]) {
    for (const p of picked) fileStore.current.set(p.id, p.file);
    setDraft((d) => {
      const type = (d.values.type || 'reporte') as RequestType;
      return {
        ...d,
        // What the person wrote is not kept once it is saved: only what the receipt needs.
        values: emptyValues({ type }),
        fileNames: [],
        receipt: {
          reference: r.reference,
          secret: d.secret,
          kind: r.kind,
          sentAt: r.sentAt,
          type,
          files: picked.map((p) => ({ id: p.id, name: p.file.name, size: p.file.size, status: r.kind === 'support' ? 'skipped' : 'pending' })),
          // The server says whether a confirmation is really on its way (email set up to deliver to that address).
          emailNote: r.emailed,
          saved: false,
        },
      };
    });
    setFiles([]);
    setShown({});
    setFormError(null);
    setSimilar({ phase: 'idle', count: 0 });
    setRestored(false);
    scrollToTop();
  }

  function afterTry() {
    if (turnstileSiteKey) {
      setToken(null);
      setTurnstileReset((n) => n + 1);
    }
  }

  async function next() {
    const errors = errorsOfStep(validate(draft.values, today), draft.step);
    if (Object.keys(errors).length) return showErrors(errors);
    if (draft.step === 2 && canAskSimilar(draft.values) && draft.similarAnswered !== similarKey(draft.values)) {
      const v = draft.values;
      setSimilar({ phase: 'checking', count: 0 });
      let r: SimilarResult = { ok: false };
      try {
        r = await checkSimilar({ categoryId: v.categoryId, municipalityId: v.municipalityId || null, parishId: v.parishId || null, sector: v.sector, point: v.point });
      } catch {
        /* without an answer the person goes on with their own report */
      }
      if (r.ok && r.count > 0) {
        setSimilar({ phase: 'offer', count: r.count });
        focusNext.current = 'heading';
        return;
      }
    }
    goTo((draft.step + 1) as Step);
  }

  async function submit() {
    if (sending || !draft.submissionKey) return;
    const all = validate(draft.values, today);
    const s = firstErrorStep(all);
    if (s) {
      if (s !== draft.step) setDraft((d) => ({ ...d, step: s }));
      return showErrors(errorsOfStep(all, s));
    }
    setSending(true);
    setFormError(null);
    try {
      const r = await sendRequest({
        submissionKey: draft.submissionKey,
        secret: draft.secret,
        input: toInput(draft.values),
        hp: hpRef.current?.value ?? '',
        turnstileToken: token,
      });
      if (r.ok) sent(r, files);
      else failed(r);
    } catch {
      showErrors({}, NETWORK_TEXT);
    } finally {
      setSending(false);
      afterTry();
    }
  }

  async function submitJoin() {
    if (sending || !draft.submissionKey) return;
    const errors = validateJoin(draft.values);
    if (Object.keys(errors).length) return showErrors(errors);
    const v = draft.values;
    setSending(true);
    setFormError(null);
    try {
      const r = await joinReport({
        submissionKey: draft.submissionKey,
        secret: draft.secret,
        place: { categoryId: v.categoryId, municipalityId: v.municipalityId || null, parishId: v.parishId || null, sector: v.sector, point: v.point },
        note: v.note,
        anonymous: v.anonymous,
        contact: toInput(v).contact,
        privacyAccepted: v.privacyAccepted,
        hp: hpRef.current?.value ?? '',
        turnstileToken: token,
      });
      if (r.ok) sent(r, []);
      else if (r.code === 'not_found') {
        setDraft((d) => ({ ...d, similarAnswered: similarKey(d.values) }));
        goTo(3);
        setFormError(r.error);
      } else failed(r);
    } catch {
      showErrors({}, NETWORK_TEXT);
    } finally {
      setSending(false);
      afterTry();
    }
  }

  function startOver() {
    fileStore.current.clear();
    removeDraft(DRAFT_KEY);
    setDraft({ ...blankDraft(presetType, linked?.id ?? null), submissionKey: uuidV4(), secret: generateSecret(), savedAt: new Date().toISOString() });
    setFiles([]);
    setRestored(false);
    setShown({});
    setFormError(null);
    setSimilar({ phase: 'idle', count: 0 });
    focusNext.current = 'heading';
    scrollToTop();
  }

  if (receipt) {
    return (
      <div ref={topRef} className="scroll-mt-28">
        <ReceiptView
          receipt={receipt}
          siteName={siteName}
          onRetry={(id) => updateFile(id, fileStore.current.has(id) ? { status: 'pending', error: undefined } : { status: 'lost' })}
          onSaved={() => setDraft((d) => (d.receipt ? { ...d, receipt: { ...d.receipt, saved: true } } : d))}
          onNew={startOver}
        />
      </div>
    );
  }

  const v = draft.values;
  const step = draft.step;
  const title = similar.phase === 'offer' ? 'Reportes parecidos' : joining ? 'Apoyar este reporte' : stepTitle(step, v.type);
  const category = categories.find((c) => c.id === v.categoryId);
  const municipality = municipalities.find((m) => m.id === v.municipalityId);
  const linkedTitle = v.linkedItemId ? (linked && linked.id === v.linkedItemId ? linked : null) : null;

  return (
    <div ref={topRef} className="flex scroll-mt-28 flex-col gap-6">
      {restored ? (
        <Notice tone="info">
          <span>Se recuperó lo que había escrito en esta pestaña. </span>
          <button type="button" onClick={startOver} className="min-h-11 font-semibold text-accent-ink underline underline-offset-2">
            Empezar de nuevo
          </button>
        </Notice>
      ) : null}
      {offline ? (
        <div role="status" className="flex items-start gap-3 rounded-2xl bg-charcoal p-4 text-[15px] text-on-charcoal">
          <WifiOff className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <span>Sin conexión. Lo escrito queda guardado en este dispositivo. Si toca «Enviar», se enviará cuando vuelva la señal.</span>
        </div>
      ) : null}
      {v.linkedItemId ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-4">
          <Link2 className="h-5 w-5 shrink-0 text-accent-ink" aria-hidden />
          <p className="min-w-0 grow basis-40 text-[15px] text-text">
            <span className="block text-sm font-semibold text-text-2">{linkedTitle ? `Sobre esta ${linkedTitle.kindLabel.toLowerCase()}` : 'Sobre una publicación de este sitio'}</span>
            {linkedTitle ? (
              <a href={linkedTitle.href} className="font-semibold text-accent-ink underline underline-offset-2">
                {linkedTitle.title}
              </a>
            ) : null}
          </p>
          <Btn tone="ghost" size="sm" onClick={() => set({ linkedItemId: null })}>
            Quitar
          </Btn>
        </div>
      ) : null}

      <Stepper step={step} onGo={(s) => goTo(s)} />

      <Panel className="flex flex-col gap-7">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-accent-ink">Paso {step} de 4</p>
          <h2 ref={headingRef} tabIndex={-1} className="text-2xl font-bold leading-tight tracking-tight text-text outline-none sm:text-3xl">
            {title}
          </h2>
        </div>
        <ErrorSummary ref={summaryRef} errors={shown} order={ORDER} extra={formError} />

        {similar.phase === 'offer' ? (
          <SimilarOffer
            count={similar.count}
            onJoin={() => {
              setSimilar((s) => ({ ...s, phase: 'join' }));
              setShown({});
              setFormError(null);
              focusNext.current = 'heading';
            }}
            onSkip={() => {
              setDraft((d) => ({ ...d, similarAnswered: similarKey(d.values) }));
              goTo(3);
            }}
          />
        ) : joining ? (
          <JoinForm
            v={v}
            set={set}
            errors={shown}
            sending={sending}
            onSubmit={() => void submitJoin()}
            onBack={() => {
              setSimilar((s) => ({ ...s, phase: 'offer' }));
              setShown({});
              setFormError(null);
              focusNext.current = 'heading';
            }}
            hpRef={hpRef}
            turnstileSiteKey={turnstileSiteKey}
            onToken={setToken}
            turnstileReset={turnstileReset}
          />
        ) : (
          <form
            noValidate
            className="relative flex flex-col gap-8"
            onSubmit={(e) => {
              e.preventDefault();
              if (step < 4) void next();
              else void submit();
            }}
          >
            {step === 1 ? <StepWhat v={v} set={set} errors={shown} categories={categories} /> : null}
            {step === 2 ? <StepWhere v={v} set={set} errors={shown} municipalities={municipalities} /> : null}
            {step === 3 ? (
              <StepDetail
                v={v}
                set={set}
                errors={shown}
                today={today}
                files={files}
                onFiles={(f) => {
                  setFiles(f);
                  setDraft((d) => ({ ...d, fileNames: f.map((x) => x.file.name) }));
                  setShown((e) => {
                    if (!e.attachments) return e;
                    const rest = { ...e };
                    delete rest.attachments;
                    return rest;
                  });
                }}
                maxFileBytes={maxFileBytes}
                remembered={draft.fileNames}
              />
            ) : null}
            {step === 4 ? (
              <>
                <dl className="grid gap-3 rounded-2xl bg-surface-2 p-4 text-[15px] sm:p-5">
                  <ReviewRow label="Tipo" onEdit={() => goTo(1)}>
                    {v.type ? TYPE_COPY[v.type].label : 'Sin elegir'}
                    {category ? ` · ${category.name}` : ''}
                  </ReviewRow>
                  <ReviewRow label="Lugar" onEdit={() => goTo(2)}>
                    {[municipality?.name, v.sector.trim()].filter(Boolean).join(' · ') || 'Sin lugar indicado'}
                    {v.point && v.type !== 'denuncia' ? ' · con punto en el mapa' : ''}
                  </ReviewRow>
                  <ReviewRow label="Detalle" onEdit={() => goTo(3)}>
                    {v.title.trim() || 'Sin título'}
                    {files.length ? ` · ${files.length === 1 ? '1 archivo' : `${files.length} archivos`}` : ''}
                  </ReviewRow>
                </dl>
                <ContactFields v={v} set={set} errors={shown} />
                <PrivacyCheck checked={v.privacyAccepted} onChange={(c) => set({ privacyAccepted: c })} error={shown.privacyAccepted} />
                <Honeypot inputRef={hpRef} />
                {turnstileSiteKey ? <Turnstile siteKey={turnstileSiteKey} onToken={setToken} resetKey={turnstileReset} /> : null}
              </>
            ) : null}
            <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
              {step > 1 ? (
                <Btn tone="soft" size="lg" onClick={() => goTo((step - 1) as Step)} disabled={sending}>
                  <ArrowLeft className="h-5 w-5" aria-hidden /> Atrás
                </Btn>
              ) : (
                <span aria-hidden />
              )}
              {step < 4 ? (
                <Btn type="submit" tone="olive" size="lg" disabled={similar.phase === 'checking'}>
                  {similar.phase === 'checking' ? 'Revisando…' : 'Siguiente'} <ArrowRight className="h-5 w-5" aria-hidden />
                </Btn>
              ) : (
                <Btn type="submit" tone="action" size="lg" disabled={sending || !ready} aria-describedby="envio-estado">
                  {sending ? (offline ? 'Esperando señal…' : 'Enviando…') : 'Enviar'}
                </Btn>
              )}
            </div>
            <p id="envio-estado" role="status" aria-live="polite" className="sr-only">
              {sending ? (offline ? 'Sin conexión. Se enviará cuando vuelva la señal.' : 'Enviando la solicitud.') : ''}
            </p>
          </form>
        )}
      </Panel>
      <EmergencyNote />
    </div>
  );
}

function ReviewRow({ label, children, onEdit }: { label: string; children: ReactNode; onEdit: () => void }) {
  // On a phone the label and «Cambiar» go on one line and the value under them; wider, all three in a row.
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 sm:grid-cols-[6rem_1fr_auto]">
      <dt className="col-start-1 row-start-1 font-semibold text-text-2">{label}</dt>
      <dd className="col-span-2 row-start-2 min-w-0 break-words text-text sm:col-span-1 sm:col-start-2 sm:row-start-1">{children}</dd>
      <dd className="col-start-2 row-start-1 sm:col-start-3">
        <button type="button" onClick={onEdit} className="min-h-11 px-1 font-semibold text-accent-ink underline underline-offset-2" aria-label={`Cambiar: ${label}`}>
          Cambiar
        </button>
      </dd>
    </div>
  );
}

/** Where the person is: four short steps; the finished ones take you back. */
function Stepper({ step, onGo }: { step: Step; onGo: (s: Step) => void }) {
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Pasos del formulario">
      {STEPS.map((s) => {
        const done = s.n < step;
        const current = s.n === step;
        const body = (
          <>
            <span className={cn('block h-1.5 rounded-full', done || current ? 'bg-accent' : 'bg-border')} aria-hidden />
            <span className={cn('mt-2 flex items-center gap-1 text-xs sm:text-sm', current ? 'font-bold text-text' : 'text-text-2')}>
              {done ? <Check className="h-4 w-4 text-accent-ink" aria-hidden /> : <span aria-hidden>{s.n}.</span>}
              <span className="truncate">{s.label}</span>
            </span>
          </>
        );
        return (
          <li key={s.n} aria-current={current ? 'step' : undefined}>
            {done ? (
              <button type="button" onClick={() => onGo(s.n)} className="flex min-h-11 w-full flex-col justify-start text-left" aria-label={`Volver al paso ${s.n}: ${s.label}`}>
                {body}
              </button>
            ) : (
              <div className="min-h-11">
                {body}
                <span className="sr-only">{current ? ' (paso actual)' : ''}</span>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
