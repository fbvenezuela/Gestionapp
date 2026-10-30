'use client';

import { useState } from 'react';
import { ArrowLeft, ArrowRight, Plus, Trash2 } from 'lucide-react';
import { setSlides as setSlideImages } from '@/lib/actions/pieces';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/field';
import { suggestedRole } from '@/lib/domain/redes';
import { useCard } from './card-context';
import { LockEdit } from './lock-edit';
import { MediaSlot } from './media-slot';
import { isLocked, moveSlide, padImages, padTexts, roleLabel, slideCount, type SlideText } from './card-core';
import { fieldId } from './card-fields';

// The slides of a carousel (cover → development → summary → CTA, each with its text and its 1080×1350 image) and the
// images of Fin de mes (each with its title and its note). Images and their order live in the version: changing an image
// or the order is a new version, so on an approved piece they are read-only until «Editar (vuelve al jefe)»; the texts
// are script and stay free (D-61). In a row on the iPad and the computer, one under the other on the phone.
const MAX = 20;
const NONE: (string | null)[] = [];

export function SlidesEditor({ kind }: { kind: 'carousel' | 'month_end' }) {
  const { card, ctx, saver, unlocked, announce, confirm } = useCard();
  const { run, pending } = useAction();
  const server = card.version?.slideIds ?? NONE;
  const version = card.version?.n ?? 0;
  const [local, setLocal] = useState<{ from: number; ids: (string | null)[] } | null>(null);
  // What was just chosen shows at once; the server's list wins as soon as its new version comes back.
  const images = local && local.from === version ? local.ids : server;
  const texts = saver.details.slides;
  const n = slideCount(images, texts);
  const locked = !unlocked && isLocked(card.status, ctx.format, 'slides');
  const noun = kind === 'carousel' ? 'lámina' : 'imagen';
  const Noun = kind === 'carousel' ? 'Lámina' : 'Imagen';

  const saveImages = (ids: (string | null)[], success: string) => {
    setLocal({ from: version, ids });
    return run(() => setSlideImages({ pieceId: card.id, slides: ids }), { success });
  };
  // An upload finishes on its own time (another may finish first, or the order may have changed meanwhile): only its
  // place is sent, and the server sets it in the current version, so nothing another save did is undone.
  const saveSlot = (i: number, id: string, success: string) => {
    setLocal((prev) => {
      const base = prev && prev.from === version ? prev.ids : server;
      return { from: version, ids: padImages(base, Math.max(n, i + 1)).map((x, j) => (j === i ? id : x)) };
    });
    return run(() => setSlideImages({ pieceId: card.id, slot: { index: i, assetId: id, count: n } }), { success });
  };
  const saveTexts = (next: SlideText[]) => saver.setSlides(next.map((t, i) => ({ ...t, role: t.role ?? suggestedRole(i, next.length) })), true);

  const add = () => {
    const nextTexts = [...padTexts(texts, n), { role: suggestedRole(n, n + 1), title: '', text: '' }];
    saveTexts(nextTexts);
    if (images.some(Boolean)) void saveImages([...padImages(images, n), null], `${Noun} ${n + 1} agregada.`);
    announce(`${Noun} ${n + 1} agregada.`);
  };
  const move = (i: number, dir: -1 | 1) => {
    const t = moveSlide(padTexts(texts, n), i, dir);
    if (!t) return;
    saveTexts(t);
    if (images.some(Boolean)) void saveImages(moveSlide(padImages(images, n), i, dir)!, `${Noun} ${i + 1} movida.`);
    announce(`La ${noun} ${i + 1} pasó a ser la ${i + 1 + dir}.`);
  };
  const remove = async (i: number) => {
    if (n <= 1) return;
    if (!(await confirm({ title: `¿Quitar la ${noun} ${i + 1}?`, body: 'Se quita su imagen y su texto. Queda al menos una.', confirmLabel: 'Quitar', tone: 'danger' }))) return;
    saveTexts(padTexts(texts, n).filter((_, j) => j !== i));
    if (images.some(Boolean)) void saveImages(padImages(images, n).filter((_, j) => j !== i), `${Noun} ${i + 1} quitada.`);
    announce(`${Noun} ${i + 1} quitada.`);
  };
  const editText = (i: number, k: 'title' | 'text', v: string) => {
    const next = padTexts(texts, n).map((t, j) => (j === i ? { ...t, [k]: v } : t));
    saver.setSlides(next);
  };

  return (
    <section aria-labelledby={fieldId(card.id, 'slides')} className="flex min-w-0 flex-col gap-3">
      <h4 id={fieldId(card.id, 'slides')} className="label-caps">
        {kind === 'carousel' ? 'Láminas' : 'Imágenes del cierre'}
      </h4>
      <LockEdit part="slides" label={kind === 'carousel' ? 'Las imágenes de las láminas' : 'Las imágenes del cierre'} view={<p className="text-text-2">Las imágenes y su orden ya los aprobó el jefe. Los textos se pueden cambiar.</p>}>
        {null}
      </LockEdit>
      <ol className="flex min-w-0 flex-col gap-3 min-[600px]:flex-row min-[600px]:overflow-x-auto min-[600px]:pb-2">
        {Array.from({ length: n }, (_, i) => {
          const t = padTexts(texts, n)[i];
          const titleId = fieldId(card.id, `slide-${i}-title`);
          const textId = fieldId(card.id, `slide-${i}-text`);
          return (
            <li key={i} className="flex min-w-0 flex-col gap-2 rounded-[var(--radius-control)] border border-border p-3 min-[600px]:w-60 min-[600px]:shrink-0">
              <p className="flex items-baseline justify-between gap-2 font-semibold">
                <span>
                  {Noun} {i + 1}
                </span>
                {kind === 'carousel' ? <span className="text-xs font-semibold text-text-2">{roleLabel(i, n)}</span> : null}
              </p>
              <MediaSlot
                label={kind === 'carousel' ? 'Imagen 4:5' : 'Imagen'}
                size="1080×1350"
                ratio="4:5"
                ids={[images[i] ?? null]}
                uploadLabel={`Subir imagen ${i + 1}`}
                accept="image/*"
                kind="final"
                eventId={card.event?.id ?? null}
                demo={ctx.demo}
                readOnly={locked}
                onUploaded={(a) => void saveSlot(i, a.id, `${Noun} ${i + 1} guardada.`)}
              />
              {!images[i] ? <p className="text-xs font-semibold text-warn">Sin imagen</p> : null}
              <div className="flex flex-col gap-1">
                <label htmlFor={titleId} className="text-sm font-semibold">
                  {kind === 'carousel' ? 'Título de la lámina' : 'Título de esta imagen'}
                </label>
                <Input id={titleId} value={t.title} maxLength={120} onChange={(e) => editText(i, 'title', e.target.value)} onBlur={() => void saver.flush()} />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor={textId} className="text-sm font-semibold">
                  {kind === 'carousel' ? 'Texto de la lámina' : 'Nota de esta imagen'}
                </label>
                <Textarea id={textId} rows={3} maxLength={1000} value={t.text} className="min-h-0" onChange={(e) => editText(i, 'text', e.target.value)} onBlur={() => void saver.flush()} />
              </div>
              {locked ? null : (
                <div className="flex flex-wrap gap-1">
                  <Button type="button" variant="ghost" size="md" className="min-h-11" disabled={pending || i === 0} aria-label={`Antes: mover la ${noun} ${i + 1} a la izquierda`} onClick={() => move(i, -1)}>
                    <ArrowLeft className="h-4 w-4" aria-hidden /> Antes
                  </Button>
                  <Button type="button" variant="ghost" size="md" className="min-h-11" disabled={pending || i === n - 1} aria-label={`Después: mover la ${noun} ${i + 1} a la derecha`} onClick={() => move(i, 1)}>
                    Después <ArrowRight className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button type="button" variant="ghost" size="md" className="min-h-11" disabled={pending || n <= 1} aria-label={`Quitar ${noun} ${i + 1}`} onClick={() => void remove(i)}>
                    <Trash2 className="h-4 w-4" aria-hidden /> {kind === 'carousel' ? 'Quitar lámina' : 'Quitar imagen'}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {locked ? null : (
        <Button type="button" variant="secondary" size="md" className="self-start" disabled={pending || n >= MAX} onClick={add}>
          <Plus className="h-4 w-4" aria-hidden /> {kind === 'carousel' ? 'Agregar lámina' : 'Agregar imagen'}
        </Button>
      )}
    </section>
  );
}
