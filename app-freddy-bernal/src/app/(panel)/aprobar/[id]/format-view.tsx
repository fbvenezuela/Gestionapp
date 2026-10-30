import type { ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { MediaThumb } from '@/components/media/media-thumb';
import { padImages, padTexts, slideCount } from '@/components/redes/card/card-core';
import type { CardData, CardNotice } from '@/lib/data/redes';
import { FORMAT, NOTICE_KINDS, SLIDE_ROLES, STICKERS, formatFromSlug, safeReturn, suggestedRole } from '@/lib/domain/redes';

// What the boss reviews besides the file and the copies (R4, D-61, D-63, D-66, I1): the format's fields, read-only, in
// the review room. A story's on-screen text and sticker (its kind, text and link) are written in the app when it is
// published: they are «Lo que sale en la app», and the approval covers them. A post's art text, a reel's or YouTube's
// title and shots, a carousel's slides in order. Server-rendered: nothing here edits.

/** Where the review room goes after «Aprobar» or «Pedir cambios» (F5): the card «Revisar» came from, only when it is a
 * Redes address (safeReturn); anything else, «Por aprobar». */
export function afterReview(volver: string | null | undefined): string {
  return safeReturn(volver) ?? '/aprobar';
}

/** The name of where the review room goes back to: the section («Posts»), the board («Redes») or «Por aprobar». */
export function backLabel(back: string): string {
  if (!back.startsWith('/redes')) return 'Por aprobar';
  const f = formatFromSlug(back.split(/[?#]/)[0].split('/')[2] ?? '');
  return f ? FORMAT[f].plural : 'Redes';
}

export const OUT_IN_APP = 'Lo que sale en la app';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-sm font-semibold text-text-2">{label}</dt>
      <dd className="whitespace-pre-wrap break-words text-[15px]">{children}</dd>
    </div>
  );
}

// One block of the room (inside its card: a bordered section, never a card in a card), named by its heading.
function Block({ id, title, subtitle, children }: { id: string; title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3 rounded-[var(--radius-control)] border border-border p-3 sm:p-4">
      <div>
        <h2 id={id} className="text-base font-semibold leading-6">{title}</h2>
        {subtitle ? <p className="text-sm text-text-2">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

const or = (v: string, empty = 'Vacío'): ReactNode => (v.trim() ? v : <span className="text-text-2">{empty}</span>);

function StoryView({ card }: { card: CardData }) {
  const d = card.details;
  return (
    <Block id="rv-out" title={OUT_IN_APP} subtitle="Se escribe en la app al publicar la historia: es parte de lo que apruebas.">
      <div>
        <dl className="flex flex-col gap-3">
          <Row label="Texto en pantalla">{or(d.on_screen)}</Row>
          <Row label="Formato del sticker">{d.sticker ? STICKERS[d.sticker] ?? 'Otro' : <span className="text-text-2">Sin sticker</span>}</Row>
          {d.sticker ? <Row label="Texto del sticker">{or(d.sticker_text)}</Row> : null}
          {d.sticker ? <Row label="Enlace del sticker">{d.sticker_url ? <span className="break-all">{d.sticker_url}</span> : or('')}</Row> : null}
        </dl>
        {d.idea.trim() ? (
          <dl className="mt-4 border-t border-border pt-3">
            <Row label="Idea original">{d.idea}</Row>
          </dl>
        ) : null}
      </div>
    </Block>
  );
}

function PostView({ card }: { card: CardData }) {
  const d = card.details;
  const art = [
    ['Antetítulo', d.art_overline],
    ['Titular', d.art_headline],
    ['Sellos', d.art_seals],
    ['Letra pequeña', d.art_fine_print],
  ].filter(([, v]) => v.trim());
  return (
    <Block id="rv-art" title="Texto del arte" subtitle={`Lo que va escrito dentro de la imagen · Proporción ${d.post_ratio}`}>
      <div>
        {art.length ? (
          <dl className="flex flex-col gap-3">
            {art.map(([label, v]) => <Row key={label} label={label}>{v}</Row>)}
          </dl>
        ) : (
          <p className="text-[15px] text-text-2">Sin texto del arte.</p>
        )}
        {d.visual_concept.trim() ? (
          <dl className="mt-4 border-t border-border pt-3">
            <Row label="Concepto visual">{d.visual_concept}</Row>
          </dl>
        ) : null}
      </div>
    </Block>
  );
}

function VideoView({ card }: { card: CardData }) {
  const shots = card.details.shots;
  return (
    <Block id="rv-shots" title="Título y tomas">
      <div className="flex flex-col gap-4">
        <dl>
          <Row label={card.format === 'reel' ? 'Título (sale como título del Short)' : 'Título (sale con el video)'}>{card.title}</Row>
        </dl>
        {shots.length ? (
          <ol className="flex flex-col gap-3">
            {shots.map((s, i) => (
              <li key={i} className="rounded-[var(--radius-control)] border border-border p-3">
                <p className="mb-1 text-sm font-semibold">Toma {i + 1}</p>
                <dl className="flex flex-col gap-2">
                  <Row label="Lo que dice">{or(s.says)}</Row>
                  <Row label="La acción">{or(s.action)}</Row>
                  {s.on_screen.trim() ? <Row label="Texto en pantalla">{s.on_screen}</Row> : null}
                </dl>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-[15px] text-text-2">Sin tomas escritas.</p>
        )}
      </div>
    </Block>
  );
}

function SlidesView({ card }: { card: CardData }) {
  const images = card.version?.slideIds ?? [];
  const n = slideCount(images, card.details.slides);
  const pics = padImages(images, n);
  const texts = padTexts(card.details.slides, n);
  return (
    <Block id="rv-slides" title="Láminas en orden" subtitle={`${n} ${n === 1 ? 'lámina' : 'láminas'}: así salen, una detrás de otra.`}>
      <div>
        <ol className="grid min-w-0 grid-cols-1 gap-3 min-[480px]:grid-cols-2">
          {texts.map((t, i) => (
            <li key={i} className="flex min-w-0 gap-3 rounded-[var(--radius-control)] border border-border p-2">
              <MediaThumb ids={[pics[i]]} mime="image/jpeg" className="h-[5.5rem] w-[4.4rem]" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  Lámina {i + 1} · {SLIDE_ROLES[card.details.slides[i] ? t.role : suggestedRole(i, n)]}
                </p>
                {pics[i] ? null : <p className="text-sm text-warn">Sin imagen</p>}
                {t.title.trim() ? <p className="break-words text-[15px] font-semibold">{t.title}</p> : null}
                {t.text.trim() ? <p className="whitespace-pre-wrap break-words text-[15px] text-text-2">{t.text}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Block>
  );
}

/** The format's fields as the boss reads them. */
export function FormatView({ card }: { card: CardData }) {
  if (card.format === 'story') return <StoryView card={card} />;
  if (card.format === 'post') return <PostView card={card} />;
  if (card.format === 'reel' || card.format === 'youtube') return <VideoView card={card} />;
  return <SlidesView card={card} />;
}

/** «Antes de publicar:» (D-66): the piece's open compliance notices, above «Antes de aprobar». */
export function NoticesBand({ notices }: { notices: CardNotice[] }) {
  if (!notices.length) return null;
  return (
    <section aria-label="Avisos de cumplimiento" className="flex min-w-0 flex-col gap-2 rounded-[var(--radius-control)] border border-warn bg-warn-soft p-3 text-text">
      <p className="flex items-center gap-2 font-semibold text-warn">
        <TriangleAlert className="h-4 w-4" aria-hidden /> Antes de publicar:
      </p>
      <ul className="flex flex-col gap-1.5">
        {notices.map((n) => (
          <li key={n.id} className="text-[15px]">
            <span className="font-semibold">{NOTICE_KINDS[n.kind] ?? 'Aviso'}:</span> {n.body}
            {n.by ? <span className="text-sm text-text-2"> · {n.by}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
