import { FileText, MessageSquareText } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Uploader } from '@/components/media/uploader';
import type { Handoff } from '@/lib/data/recording';
import { myNote } from '@/lib/data/recording';
import { MediaRow } from './media-row';
import { RecordingNoteForm } from './recording-note-form';

// Grabación's handoff to the editor on an event (cambios del 27/10/2026, §5).
//   * The camera person assigned to it (`camera`): uploads the storyboard it recorded with (a photo or a PDF) or
//     writes it out, and leaves ONE note for the editor (saving again replaces it).
//   * Redes, the boss and admin (`notes`): read both, with the first name of who wrote them and no time.
//   * Despacho sees the storyboard files only (the database gives it no notes).
// No date, time or address here: the notes table has no place for them, and the page passes none.
export function HandoffPanel({
  eventId, handoff, camera, notes, canRemove,
}: { eventId: string; handoff: Handoff; camera: boolean; notes: boolean; canRemove: boolean }) {
  const typed = handoff.notes.filter((n) => n.kind === 'storyboard_text' && n.body.trim());
  const forEditor = handoff.notes.filter((n) => n.kind === 'editor_note' && n.body.trim());
  const files = handoff.storyboards;
  return (
    <section aria-label="Entrega de Grabación" className="flex flex-col gap-4">
      <Card>
        <CardHeader
          title="Storyboard con el que se grabó"
          subtitle={camera ? 'Una foto o un PDF del que usaste, o escríbelo aquí abajo.' : 'Lo que usó Grabación en el evento.'}
          action={files.length || typed.length ? <Chip tone="ok">{files.length + typed.length}</Chip> : <Chip>Vacío</Chip>}
        />
        <CardBody className="flex flex-col gap-3">
          {files.map((m) => <MediaRow key={m.id} m={m} canRemove={canRemove} />)}
          {camera ? (
            <>
              <Uploader eventId={eventId} kind="storyboard" label="Subir el storyboard (foto o PDF)" accept="image/*,application/pdf" multiple={false} compact={files.length > 0} />
              <RecordingNoteForm
                eventId={eventId}
                kind="storyboard_text"
                initial={myNote(handoff, 'storyboard_text')}
                label="O escríbelo aquí"
                placeholder="Plano por plano, como lo grabaste."
                button="Guardar storyboard"
              />
            </>
          ) : notes ? (
            typed.map((n) => (
              <div key={n.id} className="rounded-[var(--radius-control)] border border-border px-3 py-2">
                <p className="flex items-center gap-2 text-sm font-semibold text-text-2">
                  <FileText className="h-4 w-4" aria-hidden /> Escrito por {n.author}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-[15px] [overflow-wrap:anywhere]">{n.body}</p>
              </div>
            ))
          ) : null}
          {!camera && !files.length && !(notes && typed.length) ? <p className="text-[15px] text-text-2">Grabación todavía no lo subió.</p> : null}
        </CardBody>
      </Card>

      {camera || notes ? (
        <Card data-tour="editor-note">
          <CardHeader
            title="Nota para el editor"
            subtitle={camera ? 'Lo que Redes tiene que saber para editar: qué toma sirve, qué falló, qué falta.' : 'Lo que dejó Grabación para quien edita.'}
          />
          <CardBody className="flex flex-col gap-3">
            {camera ? (
              <RecordingNoteForm
                eventId={eventId}
                kind="editor_note"
                initial={myNote(handoff, 'editor_note')}
                label="Tu nota para el editor"
                placeholder="Ejemplo: lo mejor del jefe está en el segundo clip; el dron tiene viento al final."
                button="Guardar nota"
              />
            ) : forEditor.length ? (
              forEditor.map((n) => (
                <div key={n.id} className="rounded-[var(--radius-control)] border border-border px-3 py-2">
                  <p className="flex items-center gap-2 text-sm font-semibold text-text-2">
                    <MessageSquareText className="h-4 w-4" aria-hidden /> {n.author}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-[15px] [overflow-wrap:anywhere]">{n.body}</p>
                </div>
              ))
            ) : (
              <p className="text-[15px] text-text-2">Grabación todavía no dejó nota.</p>
            )}
          </CardBody>
        </Card>
      ) : null}
    </section>
  );
}
