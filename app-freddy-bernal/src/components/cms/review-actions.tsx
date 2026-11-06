'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, CalendarClock, CornerUpLeft, Rocket, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { archiveWebItem, cancelWebSchedule, publishWebItem, returnWebItem, unarchiveWebItem } from '@/lib/actions/web';
import { suggestedMoment } from '@/lib/web/cms/schedule';

// The publisher's decisions on one item (design §3, «Por aprobar»): publish now, schedule (a day and an hour in the
// Táchira), return with a comment, take a schedule back, archive or unarchive. Each asks first when it changes the
// public site. The database decides who may (publish_web_item & co.): this only shows the buttons that apply.

export type ReviewState = {
  id: string;
  rev: number;
  title: string;
  status: string;
  live: boolean;
  scheduled: boolean;
  archived: boolean;
  hasPublished: boolean;
  ready: boolean;
  isHome: boolean;
};

export function ReviewActions({ s, tz }: { s: ReviewState; tz: string }) {
  const router = useRouter();
  const id = useId();
  const { confirm, dialog } = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [when, setWhen] = useState(() => suggestedMoment(tz));
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    if (!r.ok) {
      toast.error((r as { error: string }).error);
      return false;
    }
    toast.success(ok);
    setDone(ok);
    router.refresh();
    return true;
  }

  async function publishNow() {
    const yes = await confirm({
      title: s.live ? '¿Publicar estos cambios ahora?' : '¿Publicar ahora?',
      body: s.isHome ? 'La portada de la web cambia en este momento para todos.' : 'Sale en la web en este momento, tal como lo viste en la vista previa.',
      confirmLabel: 'Publicar ahora',
    });
    if (!yes) return;
    await run('publish', () => publishWebItem({ id: s.id, rev: s.rev, at: null }), 'Publicado: ya se ve en la web.');
  }

  async function schedule() {
    const yes = await confirm({ title: '¿Programar la publicación?', body: `Sale solo el ${when.date.split('-').reverse().join('/')} a las ${when.time} (hora del Táchira).`, confirmLabel: 'Programar' });
    if (!yes) return;
    await run('schedule', () => publishWebItem({ id: s.id, rev: s.rev, at: when }), 'Programado: sale solo a esa hora.');
  }

  async function giveBack() {
    if (note.trim().length < 3) {
      setNoteError('Escribe qué hay que cambiar.');
      return;
    }
    if (await run('return', () => returnWebItem({ id: s.id, note }), 'Devuelto con tu comentario.')) setNote('');
  }

  async function archive() {
    const yes = await confirm({
      title: '¿Archivar?',
      body: s.isHome ? 'Sale de la web al momento: la portada vuelve a la de inicio. El historial se queda.' : 'Sale de la web al momento. El historial y lo aprobado se quedan, y se puede desarchivar.',
      confirmLabel: 'Archivar',
      tone: 'danger',
    });
    if (!yes) return;
    await run('archive', () => archiveWebItem({ id: s.id }), 'Archivado: ya no se ve en la web.');
  }

  if (s.archived) {
    return (
      <div className="flex flex-col gap-3">
        {dialog}
        <p className="text-[15px] text-text-2">Al desarchivarlo vuelve lo que estaba aprobado (si estaba publicado, se ve de nuevo en la web).</p>
        <Button type="button" className="self-start" disabled={!!busy} onClick={() => run('unarchive', () => unarchiveWebItem({ id: s.id }), 'Desarchivado.')}>
          <ArchiveRestore className="h-4 w-4" aria-hidden /> Desarchivar
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {dialog}
      {done ? (
        <p className="rounded-[var(--radius-control)] bg-ok-soft px-4 py-3 text-[15px] font-semibold text-ok" role="status">
          {done}
        </p>
      ) : null}
      {!s.ready ? <p className="text-[15px] font-semibold text-warn">Todavía no se puede publicar: falta lo que dice la lista de arriba.</p> : null}

      <section aria-labelledby={`${id}-pub`} className="flex flex-col gap-2">
        <h3 id={`${id}-pub`} className="font-semibold">
          Publicar
        </h3>
        <Button type="button" className="self-start" size="lg" disabled={!!busy || !s.ready} onClick={publishNow}>
          <Rocket className="h-5 w-5" aria-hidden /> {busy === 'publish' ? 'Publicando…' : 'Publicar ahora'}
        </Button>
      </section>

      <section aria-labelledby={`${id}-sch`} className="flex flex-col gap-2">
        <h3 id={`${id}-sch`} className="font-semibold">
          Programar
        </h3>
        {s.live ? (
          <p className="text-[15px] text-text-2">Ya está en la web: sus cambios se publican ahora. Para programarlo, archívalo antes.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:max-w-md">
              <Field label="Día" htmlFor={`${id}-d`}>
                <Input id={`${id}-d`} type="date" value={when.date} onChange={(e) => setWhen((w) => ({ ...w, date: e.target.value }))} />
              </Field>
              <Field label="Hora" htmlFor={`${id}-t`}>
                <Input id={`${id}-t`} type="time" value={when.time} onChange={(e) => setWhen((w) => ({ ...w, time: e.target.value }))} />
              </Field>
            </div>
            <p className="text-sm text-text-2">Hora del Táchira. A esa hora aparece sola en la web (en menos de un minuto).</p>
            <Button type="button" variant="secondary" className="self-start" disabled={!!busy || !s.ready || !when.date || !when.time} onClick={schedule}>
              <CalendarClock className="h-4 w-4" aria-hidden /> {busy === 'schedule' ? 'Programando…' : 'Programar'}
            </Button>
          </>
        )}
        {s.scheduled ? (
          <Button type="button" variant="ghost" className="self-start" disabled={!!busy} onClick={() => run('cancel', () => cancelWebSchedule({ id: s.id }), 'Programación quitada: vuelve a borrador.')}>
            <XCircle className="h-4 w-4" aria-hidden /> Quitar la programación
          </Button>
        ) : null}
      </section>

      {s.status === 'in_review' ? (
        <section aria-labelledby={`${id}-ret`} className="flex flex-col gap-2">
          <h3 id={`${id}-ret`} className="font-semibold">
            Devolver con comentario
          </h3>
          <Field label="Qué hay que cambiar" htmlFor={`${id}-note`} error={noteError} hint="Lo lee quien lo envió, en su aviso y arriba del editor.">
            <Textarea
              id={`${id}-note`}
              rows={3}
              maxLength={1000}
              value={note}
              aria-invalid={!!noteError || undefined}
              onChange={(e) => {
                setNote(e.target.value);
                setNoteError(null);
              }}
            />
          </Field>
          <Button type="button" variant="secondary" className="self-start" disabled={!!busy} onClick={giveBack}>
            <CornerUpLeft className="h-4 w-4" aria-hidden /> {busy === 'return' ? 'Devolviendo…' : 'Devolver con comentario'}
          </Button>
        </section>
      ) : null}

      <section aria-labelledby={`${id}-arc`} className="flex flex-col gap-2 border-t border-border pt-4">
        <h3 id={`${id}-arc`} className="font-semibold">
          Archivar
        </h3>
        <p className="text-[15px] text-text-2">Lo saca de la web al momento, sin borrar nada.</p>
        <Button type="button" variant="danger" className="self-start" disabled={!!busy} onClick={archive}>
          <Archive className="h-4 w-4" aria-hidden /> Archivar
        </Button>
      </section>
    </div>
  );
}
