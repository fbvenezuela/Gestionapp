'use client';

import Link from 'next/link';
import { Fragment, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Copy, Download, FileText, ImageIcon, Printer, RotateCcw } from 'lucide-react';
import { receiptPdf } from '@/lib/participation/pdf';
import { cn } from '@/lib/cn';
import { Btn, EmergencyNote, Notice, buttonStyle } from './kit';
import { DENUNCIA_TEXT, TYPE_COPY, fileSize, longDateTime } from './words';
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
    setSaid('Listo: el comprobante se descargó en tu teléfono.');
    onSaved();
  }

  async function copy() {
    const text = `Código: ${receipt.reference}\nClave: ${receipt.secret}\nConsulta tu solicitud en ${lookupUrl()}`;
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
    setSaid(ok ? 'Copiado: pega el código y la clave en un lugar seguro.' : 'No se pudo copiar. Anota el código y la clave a mano.');
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
          <CheckCircle2 className="h-6 w-6" aria-hidden /> {support ? 'Te sumaste' : 'Solicitud guardada'}
        </p>
        <h2 ref={heading} tabIndex={-1} className="text-3xl font-bold leading-tight tracking-tight text-text outline-none sm:text-4xl">
          {support ? 'Te sumaste al reporte que ya estaba abierto' : `Recibimos tu ${typeLabel.toLowerCase()}`}
        </h2>
        <p className="text-lg leading-relaxed text-text-2">
          {support
            ? 'El reporte suma tu apoyo y tienes tu propio código para seguirlo. No verás lo que escribieron otras personas.'
            : 'Quedó guardada. Con tu código y tu clave puedes ver cómo va cuando quieras.'}
        </p>
      </header>

      <section aria-labelledby="comprobante-titulo" className="comprobante-imprimible rounded-[var(--radius-card)] border-2 border-text bg-surface p-6 sm:p-8">
        <h3 id="comprobante-titulo" className="text-sm font-semibold uppercase tracking-[0.08em] text-text-2">
          Comprobante · {siteName}
        </h3>
        <dl className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <dt className="text-[15px] font-semibold text-text-2">Tu código</dt>
            <dd className="mt-1 font-mono text-[1.35rem] font-bold tracking-wide text-text sm:text-3xl sm:tracking-wider" data-testid="comprobante-codigo">
              <Breakable text={receipt.reference} />
            </dd>
          </div>
          <div>
            <dt className="text-[15px] font-semibold text-text-2">Tu clave</dt>
            <dd className="mt-1 font-mono text-[1.35rem] font-bold tracking-wide text-text sm:text-3xl sm:tracking-wider" data-testid="comprobante-clave">
              <Breakable text={receipt.secret} />
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-[15px] text-text-2">
          {support ? `Apoyo a un reporte (${typeLabel})` : typeLabel} · enviada el {longDateTime(receipt.sentAt)}
        </p>
        <p className="mt-5 rounded-xl bg-warn-soft p-3 text-[15px] leading-snug text-text">
          <strong className="font-semibold">Guárdalos ahora.</strong> La clave se muestra solo esta vez y nadie del equipo la tiene: sin ella no se puede
          consultar la solicitud. No la compartas.
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
            Tus archivos
          </h3>
          {failed.length ? (
            <Notice tone="danger" role="alert">
              Tu solicitud quedó guardada; {failed.length === 1 ? 'un archivo no se pudo subir' : `${failed.length} archivos no se pudieron subir`}. Toca
              «Reintentar».
            </Notice>
          ) : null}
          <ul className="flex flex-col gap-2" aria-live="polite">
            {receipt.files.map((f) => (
              <FileRow key={f.id} f={f} onRetry={() => onRetry(f.id)} />
            ))}
          </ul>
          {receipt.files.some((f) => f.status === 'lost') ? (
            <p className="text-[15px] text-text-2">
              Lo que no alcanzó a subir puedes agregarlo en «Consultar mi solicitud», con tu código y tu clave.
            </p>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="despues-titulo" className="no-imprimir flex flex-col gap-3">
        <h3 id="despues-titulo" className="text-xl font-bold text-text">
          Qué pasa ahora
        </h3>
        <ol className="flex flex-col gap-3 text-[17px] leading-relaxed text-text">
          {[
            support ? 'El equipo ve que una persona más reportó lo mismo.' : 'El equipo revisa tu solicitud y la pasa al área que corresponde.',
            'Entra a «Consultar mi solicitud» con tu código y tu clave para ver en qué va y lo que te respondan.',
            receipt.emailNote ? 'Te enviamos un correo con tu código (nunca con la clave).' : 'Si dejaste un contacto, el equipo puede escribirte si hace falta.',
          ].map((t, i) => (
            <li key={t} className="flex gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft font-bold text-accent-ink" aria-hidden>
                {i + 1}
              </span>
              <span>{t}</span>
            </li>
          ))}
        </ol>
        {receipt.type === 'denuncia' ? <Notice tone="private">{DENUNCIA_TEXT}</Notice> : null}
        <EmergencyNote />
      </section>

      <div className="no-imprimir flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center">
        <Link href="/atencion/consultar" className={cn(buttonStyle({ tone: 'outline', size: 'md' }))}>
          Consultar mi solicitud
        </Link>
        {going ? (
          <p className="text-[15px] text-text-2">Espera a que terminen de subir tus archivos.</p>
        ) : confirmNew ? (
          <div className="flex flex-col gap-2 rounded-2xl bg-warn-soft p-4 sm:flex-1" role="alert">
            <p className="text-[15px] text-text">Antes de seguir, guarda tu código y tu clave: no se pueden recuperar.</p>
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
            Hacer otra solicitud
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
    failed: f.error ? `No se pudo subir: ${f.error}` : 'No se pudo subir.',
    lost: 'No se subió: la página se recargó antes.',
    skipped: 'No va con un apoyo: tu código sigue el reporte abierto.',
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
