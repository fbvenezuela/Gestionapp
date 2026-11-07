'use client';

import Link from 'next/link';
import { Fragment, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Copy, Download, FileText, ImageIcon, Printer, RotateCcw } from 'lucide-react';
import { receiptPdf } from '@/lib/participation/pdf';
import { cn } from '@/lib/cn';
import { Btn, DenunciaNote, EmergencyNote, Notice, buttonStyle } from './kit';
import { TYPE_COPY, fileSize, longDateTime } from './words';
import type { Receipt, ReceiptFile } from './form-core';

// Only the receipt is printed while it is on screen («Imprimir», or the browser's own print): the rest of the page
// (the site's header and footer too) stays off the paper. A plain <style> in place, so it goes away with this view.
const PRINT_CSS = `@media print {
  body * { visibility: hidden !important; }
  .comprobante-imprimible, .comprobante-imprimible * { visibility: visible !important; }
  .comprobante-imprimible { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; }
  .no-imprimir { display: none !important; }
}`;

/**
 * The receipt (design §4): the reference and the secret, shown this once, with what to do with them; the PDF made here
 * in the browser (receiptPdf, text only), a print view and «Copiar». The secret never goes into an address. Then what
 * happens next, and the files going up one by one with their own «Reintentar».
 */
export function ReceiptView({
  receipt, siteName, onRetry, onSaved, onNew,
}: {
  receipt: Receipt;
  siteName: string;
  onRetry: (fileId: string) => void;
  onSaved: () => void;
  onNew: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [said, setSaid] = useState('');
  const [confirmNew, setConfirmNew] = useState(false);
  const support = receipt.kind === 'support';
  const typeLabel = TYPE_COPY[receipt.type].label;
  const failed = receipt.files.filter((f) => f.status === 'failed');
  const going = receipt.files.some((f) => f.status === 'pending' || f.status === 'uploading');

  useEffect(() => {
    heading.current?.focus();
  }, []);

  const lookupUrl = () => `${window.location.origin}/atencion/consultar`;

  function download() {
    const bytes = receiptPdf({ siteName, reference: receipt.reference, secret: receipt.secret, typeLabel, sentAt: longDateTime(receipt.sentAt), lookupUrl: lookupUrl(), support });
    const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `comprobante-${receipt.reference}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    setSaid('Comprobante descargado.');
    onSaved();
  }

  async function copy() {
    const text = `Código: ${receipt.reference}\nClave: ${receipt.secret}\nConsulte su solicitud en ${lookupUrl()}`;
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      const t = document.createElement('textarea');
      t.value = text;
      t.setAttribute('readonly', '');
      t.className = 'fixed -left-[9999px]';
      document.body.appendChild(t);
      t.select();
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      t.remove();
    }
    setSaid(ok ? 'Código y clave copiados. Guárdelos en un lugar seguro.' : 'No se pudo copiar. Anote el código y la clave.');
    if (ok) onSaved();
  }

  function print() {
    onSaved();
    window.print();
  }

  return (
    <div className="flex flex-col gap-8">
      <style>{PRINT_CSS}</style>
      <header className="no-imprimir flex flex-col gap-3">
        <p className="flex items-center gap-2 text-base font-semibold text-ok">
          <CheckCircle2 className="h-6 w-6" aria-hidden /> {support ? 'Apoyo registrado' : 'Solicitud registrada'}
        </p>
        <h2 ref={heading} tabIndex={-1} className="text-3xl font-bold leading-tight tracking-tight text-text outline-none sm:text-4xl">
          {support ? 'Su apoyo al reporte quedó registrado' : `Recibimos su ${typeLabel.toLowerCase()}`}
        </h2>
        <p className="text-lg leading-relaxed text-text-2">
          {support
            ? 'Recibió un código propio para consultar el reporte. Los datos de las otras personas no se muestran.'
            : 'Con su código y su clave puede consultar el estado cuando lo necesite.'}
        </p>
      </header>

      <section aria-labelledby="comprobante-titulo" className="comprobante-imprimible rounded-[var(--radius-card)] border-2 border-text bg-surface p-6 sm:p-8">
        <h3 id="comprobante-titulo" className="text-sm font-semibold uppercase tracking-[0.08em] text-text-2">
          Comprobante · {siteName}
        </h3>
        <dl className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <dt className="text-[15px] font-semibold text-text-2">Código</dt>
            <dd className="mt-1 font-mono text-[1.35rem] font-bold tracking-wide text-text sm:text-3xl sm:tracking-wider" data-testid="comprobante-codigo">
              <Breakable text={receipt.reference} />
            </dd>
          </div>
          <div>
            <dt className="text-[15px] font-semibold text-text-2">Clave</dt>
            <dd className="mt-1 font-mono text-[1.35rem] font-bold tracking-wide text-text sm:text-3xl sm:tracking-wider" data-testid="comprobante-clave">
              <Breakable text={receipt.secret} />
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-[15px] text-text-2">
          {support ? `Apoyo a un reporte · registrado el ${longDateTime(receipt.sentAt)}` : `${typeLabel} · enviada el ${longDateTime(receipt.sentAt)}`}
        </p>
        <p className="mt-5 rounded-xl bg-warn-soft p-3 text-[15px] leading-snug text-text">
          <strong className="font-semibold">Guárdelos ahora.</strong> La clave se muestra una sola vez y no se puede recuperar. Sin ella no es posible
          consultar la solicitud. No la comparta.
        </p>
      </section>

      <div className="no-imprimir flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Btn tone="action" size="lg" onClick={download}>
            <Download className="h-5 w-5" aria-hidden /> Descargar comprobante (PDF)
          </Btn>
          <Btn tone="soft" size="lg" onClick={print}>
            <Printer className="h-5 w-5" aria-hidden /> Imprimir
          </Btn>
          <Btn tone="soft" size="lg" onClick={() => void copy()}>
            <Copy className="h-5 w-5" aria-hidden /> Copiar código y clave
          </Btn>
        </div>
        <p role="status" aria-live="polite" className="min-h-6 text-[15px] font-medium text-text">
          {said}
        </p>
      </div>

      {receipt.files.length ? (
        <section aria-labelledby="archivos-titulo" className="no-imprimir flex flex-col gap-3">
          <h3 id="archivos-titulo" className="text-xl font-bold text-text">
            Archivos adjuntos
          </h3>
          {failed.length ? (
            <Notice tone="danger" role="alert">
              Su solicitud quedó registrada, pero {failed.length === 1 ? 'un archivo no se pudo subir' : `${failed.length} archivos no se pudieron subir`}.
              Toque «Reintentar».
            </Notice>
          ) : null}
          <ul className="flex flex-col gap-2" aria-live="polite">
            {receipt.files.map((f) => (
              <FileRow key={f.id} f={f} onRetry={() => onRetry(f.id)} />
            ))}
          </ul>
          {receipt.files.some((f) => f.status === 'lost') ? (
            <p className="text-[15px] text-text-2">Los archivos que no se subieron puede agregarlos en «Consultar mi solicitud».</p>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="despues-titulo" className="no-imprimir flex flex-col gap-3">
        <h3 id="despues-titulo" className="text-xl font-bold text-text">
          Próximos pasos
        </h3>
        <ol className="flex flex-col gap-3 text-[17px] leading-relaxed text-text">
          {[
            support ? 'El reporte suma su apoyo.' : 'La solicitud se revisa y se asigna al área correspondiente.',
            'En «Consultar mi solicitud» puede ver el estado y las respuestas, con su código y su clave.',
            receipt.emailNote
              ? 'Se envió un correo con su código. La clave nunca se envía por correo.'
              : 'Si dejó un contacto, el personal de atención podrá escribirle si hace falta.',
          ].map((t, i) => (
            <li key={t} className="flex gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft font-bold text-accent-ink" aria-hidden>
                {i + 1}
              </span>
              <span>{t}</span>
            </li>
          ))}
        </ol>
        {receipt.type === 'denuncia' ? <DenunciaNote /> : null}
        <EmergencyNote />
      </section>

      <div className="no-imprimir flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center">
        <Link href="/atencion/consultar" className={cn(buttonStyle({ tone: 'outline', size: 'md' }))}>
          Consultar mi solicitud
        </Link>
        {going ? (
          <p className="text-[15px] text-text-2">Espere a que terminen de subir los archivos.</p>
        ) : confirmNew ? (
          <div className="flex flex-col gap-2 rounded-2xl bg-warn-soft p-4 sm:flex-1" role="alert">
            <p className="text-[15px] text-text">Antes de continuar, guarde su código y su clave. No se pueden recuperar.</p>
            <div className="flex flex-wrap gap-2">
              <Btn tone="olive" size="sm" onClick={onNew}>
                Sí, ya los guardé
              </Btn>
              <Btn tone="soft" size="sm" onClick={() => setConfirmNew(false)}>
                Volver
              </Btn>
            </div>
          </div>
        ) : (
          <Btn tone="ghost" size="md" onClick={() => (receipt.saved ? onNew() : setConfirmNew(true))}>
            Nueva solicitud
          </Btn>
        )}
      </div>
    </div>
  );
}

/** A code that may wrap only after its dashes (never in the middle of a group). */
function Breakable({ text }: { text: string }) {
  const parts = text.split('-');
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>
          <span className="whitespace-nowrap">
            {p}
            {i < parts.length - 1 ? '-' : ''}
          </span>
          {i < parts.length - 1 ? <wbr /> : null}
        </Fragment>
      ))}
    </>
  );
}

function FileRow({ f, onRetry }: { f: ReceiptFile; onRetry: () => void }) {
  const Icon = /\.pdf$/i.test(f.name) ? FileText : ImageIcon;
  const status: Record<ReceiptFile['status'], string> = {
    pending: 'En espera…',
    uploading: 'Subiendo…',
    done: 'Listo',
    // The error already says what happened (files-client.ts and the routes answer whole sentences).
    failed: f.error ?? 'No se pudo subir.',
    lost: 'No se subió porque la página se recargó.',
    skipped: 'Los archivos no se adjuntan a un apoyo.',
  };
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
      <Icon className="h-5 w-5 shrink-0 text-accent-ink" aria-hidden />
      <span className="min-w-0 grow basis-40">
        <span className="block truncate text-[15px] font-medium text-text">{f.name}</span>
        <span className={cn('block text-sm', f.status === 'failed' ? 'font-medium text-danger' : f.status === 'done' ? 'text-ok' : 'text-text-2')}>
          {f.size ? `${fileSize(f.size)} · ` : ''}
          {status[f.status]}
        </span>
      </span>
      {f.status === 'failed' ? (
        <Btn tone="soft" size="sm" onClick={onRetry}>
          <RotateCcw className="h-4 w-4" aria-hidden /> Reintentar
        </Btn>
      ) : null}
    </li>
  );
}
