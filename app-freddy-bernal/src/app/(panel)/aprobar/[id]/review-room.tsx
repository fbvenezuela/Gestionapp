'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Mic, MessageSquare, RotateCcw } from 'lucide-react';
import { addComment, requestVoiceLine, reviewPiece, setReviewLevel } from '@/lib/actions/pieces';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Field, Select, Textarea } from '@/components/ui/field';
import { fmtSecond } from '@/lib/data/pieces';
import { LEVELS, type Level } from '@/lib/domain/review';

// Quick check before approving, on the phone (from the diagnosis' approval flow).
const CHECKS = ['Cada cifra tiene su fuente', 'No dice fecha ni hora del evento', 'Se ve y se oye bien (subtítulos, sonido)', 'Los tres copies están revisados'];

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

export function ReviewRoom({ pieceId, revision, canApprove, canRequestChanges, canAskVoice, note, media }: {
  pieceId: string; revision: number; canApprove: boolean; canRequestChanges: boolean; canAskVoice: boolean; note: string; media: { id: string; mime: string } | null;
}) {
  const router = useRouter();
  const { run, pending } = useAction();
  const video = useRef<HTMLVideoElement>(null);
  const [comment, setComment] = useState('');
  const [mode, setMode] = useState<'comment' | 'voice'>('comment');
  const [atSecond, setAtSecond] = useState<number | null>(null);
  const [checked, setChecked] = useState<boolean[]>(CHECKS.map(() => false));
  const allChecked = checked.every(Boolean);
  const isVideo = media && !media.mime.startsWith('image/');

  const grabTime = () => {
    if (video.current) setAtSecond(Math.floor(video.current.currentTime));
  };

  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        {media ? (
          isVideo ? (
            <video ref={video} src={`/api/media/${media.id}?ver=1`} controls playsInline preload="metadata" className="max-h-[60vh] w-full rounded-[var(--radius-control)] bg-slate" onPause={grabTime} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/media/${media.id}?ver=1`} alt="Pieza a revisar" className="max-h-[60vh] w-full rounded-[var(--radius-control)] bg-slate object-contain" />
          )
        ) : (
          <p className="rounded-[var(--radius-control)] bg-surface-2 p-6 text-center text-text-2">Esta pieza no tiene archivo todavía.</p>
        )}

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
        >
          <Textarea id="rv-text" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>

        {mode === 'voice' ? (
          <Button type="button" variant="secondary" disabled={pending || !comment.trim()} onClick={() => run(() => requestVoiceLine({ pieceId, phrase: comment, atSecond }), { success: 'Pedido anotado. Redes le pide el audio al jefe.', onOk: () => setComment('') })}>
            <Mic className="h-4 w-4" aria-hidden /> Anotar pedido de frase
          </Button>
        ) : canApprove || canRequestChanges ? (
          <div className="flex flex-col gap-3">
            {note ? <p className="text-sm text-text-2">{note}</p> : null}
            {canApprove ? (
              <fieldset className="flex flex-col gap-1 rounded-[var(--radius-control)] border border-border p-3">
                <legend className="px-1 text-sm font-semibold">Antes de aprobar</legend>
                {CHECKS.map((c, n) => (
                  <label key={c} className="flex min-h-10 items-center gap-3 text-[15px]">
                    <input type="checkbox" className="h-5 w-5 accent-accent" checked={checked[n]} onChange={(e) => setChecked(checked.map((v, k) => (k === n ? e.target.checked : v)))} />
                    {c}
                  </label>
                ))}
              </fieldset>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-3">
              {canApprove ? (
                <Button type="button" size="lg" disabled={pending || !allChecked} onClick={() => run(() => reviewPiece({ pieceId, decision: 'approved', comment, revision }), { success: 'Aprobada.', refresh: false, onOk: (r) => r.ok && router.push('/aprobar') })}>
                  <CheckCircle2 className="h-5 w-5" aria-hidden /> {allChecked ? 'Aprobar' : 'Marca la lista para aprobar'}
                </Button>
              ) : null}
              <Button
                type="button"
                size="lg"
                variant="danger"
                disabled={pending}
                onClick={async () => {
                  if (!comment.trim()) return alert('Escribe qué hay que cambiar.');
                  const text = atSecond !== null ? `[${fmtSecond(atSecond)}] ${comment}` : comment;
                  const r = await run(() => reviewPiece({ pieceId, decision: 'changes_requested', comment: text, revision }), { success: 'Se pidieron los cambios.', refresh: false });
                  if (r?.ok) router.push('/aprobar');
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
          <Button type="button" variant="secondary" disabled={pending || !comment.trim()} onClick={() => run(() => addComment({ pieceId, body: comment, atSecond }), { success: 'Comentario guardado.', onOk: () => setComment('') })}>
            Guardar comentario
          </Button>
        )}
      </CardBody>
    </Card>
  );
}
