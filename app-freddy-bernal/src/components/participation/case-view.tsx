import type { ReactNode } from 'react';
import { Download, FileText, ImageIcon, LogOut, MessageSquare, ShieldCheck, Users } from 'lucide-react';
import { closeCase } from '@/lib/actions/participation';
import { downloadGate } from '@/lib/storage/scanner';
import type { CitizenAttachment, CitizenView, TimelineItem } from '@/lib/web/participation';
import { cn } from '@/lib/cn';
import { Btn, EmergencyNote, Notice, Panel } from './kit';
import { AddInfoForm, ConfirmForm } from './case-actions';
import { DENUNCIA_TEXT, STATE_PLAIN, TYPE_COPY, dayDate, fileSize, longDate, longDateTime, reportsCount, timelineLine } from './words';

/**
 * The person's own request, while the consultation lasts (design §4): ONLY the safe summary the database gives back
 * (citizen.lookup_request), its state in plain words, the shared timeline (the team's replies and requests for more
 * information, the person's messages; never internal notes or who in the team did what), their own files and the
 * evidence the team shared, and what they can do: add information, confirm the resolution or say it is not resolved,
 * and «Salir». A supporter sees the report's kind, category, municipality and state, never the other person's text.
 */
export function CaseView({ view, maxFileBytes }: { view: CitizenView; maxFileBytes: number }) {
  const r = view.request;
  const support = view.kind === 'support';
  const shownState = r.merged && r.mainState ? r.mainState : r.state;
  const plain = STATE_PLAIN[shownState];
  const general = view.attachments.filter((a) => !a.messageId);
  const byMessage = new Map<string, CitizenAttachment[]>();
  for (const a of view.attachments) if (a.messageId) byMessage.set(a.messageId, [...(byMessage.get(a.messageId) ?? []), a]);
  const asked = r.state === 'requiere_informacion';

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-2">
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-accent-ink">{support ? 'Tu apoyo a un reporte' : 'Tu solicitud'}</p>
            <h1 id="caso-titulo" tabIndex={-1} className="break-all font-mono text-3xl font-bold tracking-wider text-text outline-none sm:text-4xl">
              {r.reference}
            </h1>
          </div>
          <form action={closeCase}>
            <Btn type="submit" tone="soft" size="sm">
              <LogOut className="h-4 w-4" aria-hidden /> Salir
            </Btn>
          </form>
        </div>
        <p className="text-[15px] text-text-2">
          {[TYPE_COPY[r.type]?.label, r.category, r.municipality].filter(Boolean).join(' · ')} · {support ? 'te sumaste' : 'enviada'} el {longDate(r.createdAt)}
        </p>
      </header>

      <section aria-labelledby="estado-titulo" className={cn('rounded-[var(--radius-card)] p-6 sm:p-8', plain.tone === 'ask' ? 'bg-warn-soft' : plain.tone === 'done' ? 'bg-ok-soft' : 'bg-accent-soft')}>
        <h2 id="estado-titulo" className="text-sm font-semibold uppercase tracking-[0.08em] text-text-2">
          Cómo va
        </h2>
        <p className="mt-2 text-3xl font-bold leading-tight text-text" data-testid="estado-solicitud">
          {plain.label}
        </p>
        <p className="mt-2 text-[17px] leading-relaxed text-text">{plain.text}</p>
        {r.merged ? <p className="mt-3 text-[15px] text-text">Tu solicitud se unió con otra del mismo problema: aquí ves el estado de esa.</p> : null}
        {r.supportCount > 0 ? (
          <p className="mt-3 flex items-center gap-2 text-[15px] text-text">
            <Users className="h-4 w-4" aria-hidden /> {support ? `Con tu apoyo, este caso suma ${reportsCount(r.supportCount + 1)}.` : `Otras personas se sumaron: ${reportsCount(r.supportCount)} más.`}
          </p>
        ) : null}
        {r.citizenConfirmation === 'resolved' ? <p className="mt-3 text-[15px] font-semibold text-text">Confirmaste que se resolvió. Gracias por contarnos.</p> : null}
        {r.resolvedAt && shownState === 'resuelto' ? <p className="mt-1 text-[15px] text-text-2">Resuelta el {longDate(r.resolvedAt)}.</p> : null}
      </section>

      {!support ? (
        <Panel className="flex flex-col gap-4">
          <h2 className="text-xl font-bold text-text">Lo que enviaste</h2>
          <dl className="grid gap-4 text-[15px]">
            <Row label="Título">{r.title}</Row>
            <Row label="Lo que contaste">
              <p className="whitespace-pre-line leading-relaxed">{r.description}</p>
            </Row>
            {r.municipality || r.parish || r.sector ? <Row label="Dónde">{[r.municipality, r.parish, r.sector].filter(Boolean).join(' · ')}</Row> : null}
            {r.locationReference ? <Row label="Referencia">{r.locationReference}</Row> : null}
            {r.hasLocation ? <Row label="Ubicación">Guardaste un punto en el mapa (lo ve solo el equipo).</Row> : null}
            {r.eventDate ? <Row label="Cuándo pasó">{dayDate(r.eventDate)}</Row> : null}
            <Row label="Contacto">{r.anonymous ? 'Anónima: sin datos de contacto.' : 'Lo que dejaste está cifrado y no se muestra aquí.'}</Row>
          </dl>
          {general.length ? <Files files={general} /> : null}
        </Panel>
      ) : (
        <Panel className="flex flex-col gap-3">
          <h2 className="text-xl font-bold text-text">Tu apoyo</h2>
          <p className="text-[15px] leading-relaxed text-text">
            Te sumaste a un reporte de {r.category?.toLowerCase()}
            {r.municipality ? ` en ${r.municipality}` : ''}. Por respeto a quien lo envió, aquí no se muestra su texto: ves el estado del caso.
          </p>
          {r.note ? (
            <p className="rounded-xl bg-surface-2 p-3 text-[15px] text-text">
              <span className="font-semibold">Lo que agregaste:</span> {r.note}
            </p>
          ) : null}
        </Panel>
      )}

      {r.canConfirm ? (
        <Panel className="flex flex-col gap-4 border-2 border-accent">
          <h2 className="text-xl font-bold text-text">El equipo dice que se resolvió</h2>
          <ConfirmForm />
        </Panel>
      ) : null}

      {r.canAddInfo ? (
        <Panel id="agregar" className={cn('flex flex-col gap-4', asked && 'border-2 border-warn')}>
          <h2 className="text-xl font-bold text-text">{asked ? 'Responde lo que te pidieron' : 'Agregar información'}</h2>
          <AddInfoForm maxFileBytes={maxFileBytes} asked={asked} />
        </Panel>
      ) : null}

      <section aria-labelledby="historia-titulo" className="flex flex-col gap-4">
        <h2 id="historia-titulo" className="text-xl font-bold text-text">
          Historia de tu solicitud
        </h2>
        {view.timeline.length ? (
          <ol className="relative flex flex-col gap-5 border-l-2 border-border pl-6">
            {view.timeline.map((t, i) => (
              <TimelineRow key={`${t.at}-${i}`} t={t} />
            ))}
          </ol>
        ) : (
          <p className="text-[15px] text-text-2">Todavía no hay movimientos.</p>
        )}
        {byMessage.size ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-base font-semibold text-text">Archivos de tus mensajes y del equipo</h3>
            <Files files={[...byMessage.values()].flat()} />
          </div>
        ) : null}
      </section>

      {r.type === 'denuncia' ? <Notice tone="private">{DENUNCIA_TEXT}</Notice> : null}
      <Notice tone="info" title="Tu consulta se cierra sola">
        Por seguridad, en 30 minutos o al tocar «Salir». Para volver, escribe otra vez tu código y tu clave.
      </Notice>
      <EmergencyNote />
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="font-semibold text-text-2">{label}</dt>
      <dd className="min-w-0 break-words text-text">{children}</dd>
    </div>
  );
}

function TimelineRow({ t }: { t: TimelineItem }) {
  const team = t.by === 'team';
  const message = t.kind === 'public_reply' || t.kind === 'info_request' || t.kind === 'citizen_message';
  return (
    <li className="relative">
      <span
        className={cn('absolute -left-[33px] top-1 grid h-4 w-4 place-items-center rounded-full border-2 border-surface', t.kind === 'info_request' ? 'bg-warn' : team ? 'bg-accent' : 'bg-action')}
        aria-hidden
      />
      <p className="flex flex-wrap items-baseline gap-x-2 text-[15px]">
        <span className="font-semibold text-text">{timelineLine(t)}</span>
        <time dateTime={t.at} className="text-sm text-text-2">
          {longDateTime(t.at)}
        </time>
      </p>
      {message ? (
        <div className={cn('mt-2 rounded-2xl p-4 text-[15px] leading-relaxed', team ? 'bg-surface-2 text-text' : 'border border-border bg-surface text-text')}>
          {t.redacted ? (
            <p className="italic text-text-2">El equipo retiró este texto para proteger datos personales.</p>
          ) : (
            <p className="flex gap-2 whitespace-pre-line">
              <MessageSquare className="mt-1 h-4 w-4 shrink-0 text-text-2" aria-hidden />
              <span className="min-w-0 break-words">{t.body}</span>
            </p>
          )}
        </div>
      ) : null}
    </li>
  );
}

function Files({ files }: { files: CitizenAttachment[] }) {
  return (
    <ul className="flex flex-col gap-2" aria-label="Archivos">
      {files.map((f, i) => {
        const pdf = f.mime === 'application/pdf';
        const Icon = pdf ? FileText : ImageIcon;
        // Production serves only what the scanner passed; the demo also what it could not scan (with a warning).
        const ready = downloadGate(f.scanStatus as Parameters<typeof downloadGate>[0]).ok;
        const label = `${f.kind === 'evidence' ? 'Evidencia del equipo' : pdf ? 'Documento' : 'Foto'} ${i + 1}`;
        return (
          <li key={f.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
            <Icon className="h-5 w-5 shrink-0 text-accent-ink" aria-hidden />
            <span className="min-w-0 grow basis-40 text-[15px]">
              <span className="block font-medium text-text">{label}</span>
              <span className="block text-sm text-text-2">
                {fileSize(f.bytes)} · {longDate(f.at)}
                {f.scanStatus === 'sin_analizar' ? (ready ? ' · sin revisión antivirus (versión de prueba)' : ' · pendiente de revisión de seguridad') : ''}
                {f.scanStatus === 'cuarentena' ? ' · en revisión de seguridad' : ''}
                {f.scanStatus === 'infectado' ? ' · bloqueado por seguridad' : ''}
              </span>
            </span>
            {ready ? (
              <a
                href={`/atencion/consultar/archivo/${f.id}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-border px-4 text-[15px] font-semibold text-text hover:bg-surface-2"
                aria-label={`Descargar ${label}`}
              >
                <Download className="h-4 w-4" aria-hidden /> Descargar
              </a>
            ) : (
              <span className="flex items-center gap-1 text-sm text-text-2">
                <ShieldCheck className="h-4 w-4" aria-hidden /> Se podrá descargar cuando termine la revisión
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
