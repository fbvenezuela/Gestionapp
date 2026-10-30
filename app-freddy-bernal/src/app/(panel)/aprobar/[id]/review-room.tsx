'use client';

import { useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Mic, MessageSquare, RotateCcw } from 'lucide-react';
import { addComment, requestVoiceLine, reviewPiece, setReviewLevel } from '@/lib/actions/pieces';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Field, Select, Textarea } from '@/components/ui/field';
import { fmtSecond } from '@/lib/data/pieces';
import { LEVELS, type Level } from '@/lib/domain/review';
import { cn } from '@/lib/cn';
import { MediaFailure, useMediaFailure } from '@/components/media/media-preview';
import { QUICK_REASONS, hasReason, toggleReason } from '@/lib/domain/review-reasons';

// Quick check before approving, on the phone (from the diagnosis' approval flow).
const CHECKS = ['Cada cifra tiene su fuente', 'No dice fecha ni hora del evento', 'Se ve y se oye bien (subtítulos, sonido)', 'Los tres copies están revisados'];
// With open compliance notices (D-66), one more the screen asks for: the boss cannot approve without having read them.
export const NOTICES_READ = 'Leí los avisos de cumplimiento';

export function LevelPicker({ pieceId, level, canLower }: { pieceId: string; level: Level; canLower: boolean }) {
  const { run, pending } = useAction();
  const options = (Object.keys(LEVELS) as Level[]).filter((l) => canLower || l === 'rojo');
  return (
    <Select aria-label="Cambiar nivel" value={level} disabled={pending || options.length < 2} className="w-auto"
      onChange={(e) => run(() => setReviewLevel({ pieceId, level: e.target.value as Level }), { success: 'Nivel cambiado.' })}>
      {options.map((l) => <option key={l} value={l}>Nivel {LEVELS[l].label.toLowerCase()}</option>)}
    </Select>
  );
}

// `back`: where a decision lands (the card «Revisar» came from, or «Por aprobar»: afterReview in format-view.tsx).
// `details`: the format's fields, read-only, under the file; `band`: the open notices, above the checklist.
export function ReviewRoom({ pieceId, revision, canApprove, canRequestChanges, canAskVoice, note, media, back = '/aprobar', details, band, noticeCount = 0 }: {
  pieceId: string; revision: number; canApprove: boolean; canRequestChanges: boolean; canAskVoice: boolean; note: string; media: { id: string; mime: string; drive?: boolean } | null;
  back?: string; details?: ReactNode; band?: ReactNode; noticeCount?: number;
}) {
  const router = useRouter();
  const { run, pending } = useAction();
  const video = useRef<HTMLVideoElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [comment, setCommentRaw] = useState('');
  const [error, setError] = useState('');
  const setComment = (v: string) => {
    setCommentRaw(v);
    if (v.trim()) setError('');
  };
  const [mode, setMode] = useState<'comment' | 'voice'>('comment');
  const [atSecond, setAtSecond] = useState<number | null>(null);
  const [checked, setChecked] = useState<boolean[]>(CHECKS.map(() => false));
  const [noticesRead, setNoticesRead] = useState(false);
  const allChecked = checked.every(Boolean) && (noticeCount === 0 || noticesRead);
  const isVideo = media && !media.mime.startsWith('image/');
  const src = media ? `/api/media/${media.id}?ver=1` : '';
  const { message: failure, attempt, watch, onError, retry } = useMediaFailure(src, media?.mime ?? '', !!media?.drive);

  const grabTime = () => {
    if (video.current) setAtSecond(Math.floor(video.current.currentTime));
  };

  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        {media && failure ? (
          <MediaFailure message={failure} onRetry={retry} />
        ) : media ? (
          isVideo ? (
            <video
              key={attempt}
              ref={(el) => {
                video.current = el;
                watch(el);
              }}
              src={src}
              controls
              playsInline
              preload="metadata"
              data-tour="review-video"
              className="max-h-[60vh] w-full rounded-[var(--radius-control)] bg-slate"
              onPause={grabTime}
              onError={onError}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={attempt} ref={watch} src={src} alt="Pieza a revisar" data-tour="review-video" onError={onError} className="max-h-[60vh] w-full rounded-[var(--radius-control)] bg-slate object-contain" />
          )
        ) : (
          <p className="rounded-[var(--radius-control)] bg-surface-2 p-6 text-center text-text-2">Esta pieza no tiene archivo todavía.</p>
        )}

        {details}

        {canAskVoice ? (
          <div className="flex gap-1" role="tablist">
            <Button type="button" size="sm" variant={mode === 'comment' ? 'slate' : 'secondary'} onClick={() => setMode('comment')} role="tab" aria-selected={mode === 'comment'}>
              <MessageSquare className="h-4 w-4" aria-hidden /> Comentario
            </Button>
            <Button type="button" size="sm" variant={mode === 'voice' ? 'slate' : 'secondary'} onClick={() => setMode('voice')} role="tab" aria-selected={mode === 'voice'}>
              <Mic className="h-4 w-4" aria-hidden /> Pedir frase al jefe
            </Button>
          </div>
        ) : null}

        <Field
          label={mode === 'comment' ? 'Qué hay que cambiar (o un comentario)' : 'Qué frase tiene que mandar el jefe por audio'}
          htmlFor="rv-text"
          hint={isVideo ? (atSecond !== null ? `En el segundo ${fmtSecond(atSecond)} del video. Pausa el video para cambiarlo.` : 'Pausa el video donde está lo que comentas para anotar el segundo.') : undefined}
          error={mode === 'comment' && error ? error : undefined}
        >
          <Textarea ref={textRef} id="rv-text" rows={3} value={comment} aria-invalid={mode === 'comment' && error ? true : undefined} aria-describedby={mode === 'comment' ? 'rv-reasons-hint' : undefined} onChange={(e) => setComment(e.target.value)} />
        </Field>

        {mode === 'comment' ? (
          <div role="group" aria-labelledby="rv-reasons-hint" className="-mt-2 flex flex-col gap-2">
            <p id="rv-reasons-hint" className="text-sm text-text-2">Motivos rápidos: toca para agregarlos al comentario (otra vez para quitarlos).</p>
            <div className="flex flex-wrap gap-2">
              {QUICK_REASONS.map((r) => {
                const on = hasReason(comment, r);
                return (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setComment(toggleReason(comment, r))}
                    className={cn(
                      'min-h-11 rounded-full border px-3.5 text-sm font-semibold',
                      on ? 'border-accent bg-accent-soft text-accent-ink' : 'border-border bg-surface text-text-2 hover:bg-surface-2',
                    )}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {mode === 'voice' ? (
          <Button type="button" variant="secondary" disabled={pending || !comment.trim()} onClick={() => run(() => requestVoiceLine({ pieceId, phrase: comment, atSecond }), { success: 'Pedido anotado. Redes le pide el audio al jefe.', onOk: () => setComment('') })}>
            <Mic className="h-4 w-4" aria-hidden /> Anotar pedido de frase
          </Button>
        ) : canApprove || canRequestChanges ? (
          <div className="flex flex-col gap-3">
            {note ? <p className="text-sm text-text-2">{note}</p> : null}
            {band}
            {canApprove ? (
              <fieldset className="flex flex-col gap-1 rounded-[var(--radius-control)] border border-border p-3" data-tour="checklist">
                <legend className="px-1 text-sm font-semibold">Antes de aprobar</legend>
                {CHECKS.map((c, n) => (
                  <label key={c} className="flex min-h-10 items-center gap-3 text-[15px]">
                    <input type="checkbox" className="h-5 w-5 accent-accent" checked={checked[n]} onChange={(e) => setChecked(checked.map((v, k) => (k === n ? e.target.checked : v)))} />
                    {c}
                  </label>
                ))}
                {noticeCount > 0 ? (
                  <label className="flex min-h-10 items-center gap-3 text-[15px] font-semibold text-warn">
                    <input type="checkbox" className="h-5 w-5 accent-accent" checked={noticesRead} onChange={(e) => setNoticesRead(e.target.checked)} />
                    {NOTICES_READ}
                  </label>
                ) : null}
              </fieldset>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-3">
              {canApprove ? (
                <Button type="button" size="lg" data-tour="approve" disabled={pending || !allChecked} onClick={() => run(() => reviewPiece({ pieceId, decision: 'approved', comment, revision }), { success: 'Aprobada.', refresh: false, onOk: (r) => r.ok && router.push(back) })}>
                  <CheckCircle2 className="h-5 w-5" aria-hidden /> {allChecked ? 'Aprobar' : 'Marca la lista para aprobar'}
                </Button>
              ) : null}
              <Button
                type="button"
                size="lg"
                variant="danger"
                data-tour="request-changes"
                disabled={pending}
                onClick={async () => {
                  if (!comment.trim()) {
                    setError('Escribe qué hay que cambiar o toca un motivo rápido.');
                    textRef.current?.focus();
                    return;
                  }
                  const text = atSecond !== null ? `[${fmtSecond(atSecond)}] ${comment}` : comment;
                  const r = await run(() => reviewPiece({ pieceId, decision: 'changes_requested', comment: text, revision }), { success: 'Se pidieron los cambios.', refresh: false });
                  if (r?.ok) router.push(back);
                }}
              >
                <RotateCcw className="h-5 w-5" aria-hidden /> Pedir cambios
              </Button>
              <Button type="button" size="lg" variant="secondary" disabled={pending || !comment.trim()} onClick={() => run(() => addComment({ pieceId, body: comment, atSecond }), { success: 'Comentario guardado.', onOk: () => setComment('') })}>
                Solo comentar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {note ? <p className="text-sm text-text-2">{note}</p> : null}
            {band}
            <Button type="button" variant="secondary" disabled={pending || !comment.trim()} onClick={() => run(() => addComment({ pieceId, body: comment, atSecond }), { success: 'Comentario guardado.', onOk: () => setComment('') })}>
              Guardar comentario
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
