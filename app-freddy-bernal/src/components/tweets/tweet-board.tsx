'use client';

import { useState } from 'react';
import { DateTime } from 'luxon';
import { Check, Copy, ExternalLink, ImagePlus, SkipForward } from 'lucide-react';
import { toast } from 'sonner';
import { markTweetPublished, skipTweet, updateTweet } from '@/lib/actions/tweets';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { Uploader } from '@/components/media/uploader';
import { DownloadLink } from '@/components/media/drive-download';
import { TWEET_STATUS } from '@/lib/data/labels';
import { TZ, fmtAt, ms } from '@/lib/time';
import { cn } from '@/lib/cn';

export type BoardTweet = {
  id: string; body: string; weighted_length: number; scheduled_at: string | null; status: string; category: string | null;
  image_asset_id: string | null; published_url: string | null;
  // Where the reference image is kept: one in Drive downloads by pieces.
  image_bucket: string | null; image_size: number | string | null;
};

const local = (iso: string) => DateTime.fromJSDate(new Date(iso)).setZone(TZ).setLocale('es');

// Week board: one column per day. Tap a tweet (finger or mouse) to change its day or hour, add
// the reference image, copy it or mark it as published by hand. On a computer it can also be
// dragged to another day (keeps the hour); dragging does not work with a finger, so the tap is
// the main way and every target is at least 44 px.
export function TweetBoard({ tweets, canEdit }: { tweets: BoardTweet[]; canEdit: boolean }) {
  const { run, pending } = useAction();
  const [open, setOpen] = useState<BoardTweet | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const scheduled = tweets.filter((t) => t.scheduled_at);
  const days = [...new Set(scheduled.map((t) => local(t.scheduled_at!).toISODate()!))].sort();
  const noTime = tweets.filter((t) => !t.scheduled_at);

  const moveTo = (t: BoardTweet, day: string) => {
    const cur = local(t.scheduled_at!);
    const target = DateTime.fromISO(day, { zone: TZ }).set({ hour: cur.hour, minute: cur.minute });
    if (target.toISODate() === cur.toISODate()) return;
    run(() => updateTweet({ id: t.id, scheduledAt: target.toUTC().toISO() }), { success: `Movido al ${target.toFormat("cccc d")}.` });
  };

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {days.map((d) => {
          const list = scheduled.filter((t) => local(t.scheduled_at!).toISODate() === d).sort((a, b) => ms(a.scheduled_at) - ms(b.scheduled_at));
          return (
            <section
              key={d}
              aria-label={DateTime.fromISO(d).setLocale('es').toFormat("cccc d 'de' LLLL")}
              className={cn('w-[280px] shrink-0 rounded-[var(--radius-card)] border border-border bg-surface-2 p-2', drag && 'outline-dashed outline-2 outline-accent/40')}
              onDragOver={(e) => canEdit && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const t = tweets.find((x) => x.id === e.dataTransfer.getData('text/plain'));
                setDrag(null);
                if (t) moveTo(t, d);
              }}
            >
              <h3 className="px-1 pb-2 text-sm font-bold first-letter:uppercase">
                {DateTime.fromISO(d).setLocale('es').toFormat("cccc d 'de' LLL")} <span className="font-normal text-text-2">· {list.length}</span>
              </h3>
              <ul className="flex flex-col gap-2">
                {list.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      draggable={canEdit && t.status !== 'published'}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', t.id);
                        setDrag(t.id);
                      }}
                      onDragEnd={() => setDrag(null)}
                      onClick={() => setOpen(t)}
                      aria-haspopup="dialog"
                      className={cn('min-h-11 w-full rounded-[var(--radius-control)] border border-border bg-surface p-2 text-left hover:border-accent', t.status === 'skipped' && 'opacity-50')}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-mono text-sm font-semibold">{fmtAt(local(t.scheduled_at!), 'h:mm a')}</span>
                        <Chip tone={TWEET_STATUS[t.status]?.tone}>{TWEET_STATUS[t.status]?.label}</Chip>
                      </span>
                      <span className="mt-1 line-clamp-3 block text-sm">{t.body}</span>
                      <span className="mt-1 flex gap-2 text-xs text-text-2">
                        {t.category ? <span>{t.category}</span> : null}
                        {t.image_asset_id ? <span>· con imagen</span> : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {noTime.length ? (
          <section className="w-[280px] shrink-0 rounded-[var(--radius-card)] border border-dashed border-border p-2">
            <h3 className="px-1 pb-2 text-sm font-bold">Sin hora</h3>
            {noTime.map((t) => (
              <button key={t.id} type="button" onClick={() => setOpen(t)} aria-haspopup="dialog" className="mb-2 min-h-11 w-full rounded-[var(--radius-control)] border border-border bg-surface p-2 text-left text-sm hover:border-accent">{t.body}</button>
            ))}
          </section>
        ) : null}
      </div>

      {open ? <TweetSheet t={open} canEdit={canEdit} pending={pending} onClose={() => setOpen(null)} run={run} /> : null}
    </>
  );
}

function TweetSheet({ t, canEdit, pending, onClose, run }: { t: BoardTweet; canEdit: boolean; pending: boolean; onClose: () => void; run: ReturnType<typeof useAction>['run'] }) {
  const cur = t.scheduled_at ? local(t.scheduled_at) : null;
  const [date, setDate] = useState(cur?.toISODate() ?? '');
  const [time, setTime] = useState(cur?.toFormat('HH:mm') ?? '');
  const [url, setUrl] = useState('');
  const done = t.status === 'published';
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title="Tweet" description={TWEET_STATUS[t.status]?.label}>
      <div className="flex flex-col gap-4">
        <p className="whitespace-pre-wrap rounded-[var(--radius-control)] bg-surface-2 p-3 text-[15px]">{t.body}</p>
        <p className="font-mono text-sm text-text-2">{t.weighted_length}/280</p>
        <Button type="button" variant="secondary" onClick={() => navigator.clipboard.writeText(t.body).then(() => toast.success('Copiado. Pégalo en X.'))}>
          <Copy className="h-4 w-4" aria-hidden /> Copiar texto
        </Button>
        {t.image_asset_id ? (
          <DownloadLink file={{ id: t.image_asset_id, label: 'Imagen de referencia', size: Number(t.image_size ?? 0) }} drive={t.image_bucket === 'drive'} className="inline-flex min-h-11 items-center text-left text-sm font-semibold text-accent-ink">
            Descargar la imagen de referencia
          </DownloadLink>
        ) : null}

        {canEdit && !done ? (
          <>
            <p className="text-sm text-text-2">Cambia el día o la hora y toca «Cambiar día y hora».</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-sm font-semibold">Día<Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
              <label className="flex flex-col gap-1 text-sm font-semibold">Hora<Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
            </div>
            <Button type="button" variant="secondary" disabled={pending || !date || !time} onClick={() => {
              const iso = DateTime.fromISO(`${date}T${time}`, { zone: TZ }).toUTC().toISO();
              run(() => updateTweet({ id: t.id, scheduledAt: iso }), { success: 'Hora cambiada.', onOk: onClose });
            }}>Cambiar día y hora</Button>
            <Uploader eventId={null} kind="tweet_image" accept="image/*" multiple={false} compact label={t.image_asset_id ? 'Cambiar imagen de referencia' : 'Agregar imagen de referencia'} hint="Una muestra de que lo que se dice es real."
              onUploaded={(a) => run(() => updateTweet({ id: t.id, imageAssetId: a.id }), { success: 'Imagen agregada.' })} />
          </>
        ) : null}

        {canEdit && (t.status === 'approved' || t.status === 'scheduled') ? (
          <div className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-border p-3">
            <p className="text-sm font-semibold">¿Ya lo publicaste a mano?</p>
            <Input type="url" inputMode="url" placeholder="Pega el link del tweet" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Link del tweet publicado" />
            <Button type="button" disabled={pending || !url} onClick={() => run(() => markTweetPublished({ id: t.id, url }), { success: 'Marcado como publicado.', onOk: onClose })}>
              <Check className="h-4 w-4" aria-hidden /> Ya lo publiqué
            </Button>
          </div>
        ) : null}
        {done && t.published_url ? (
          <a href={t.published_url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 font-semibold text-accent-ink">Ver en X <ExternalLink className="h-4 w-4" aria-hidden /></a>
        ) : null}
        {canEdit && !done && t.status !== 'skipped' ? (
          <Button type="button" variant="ghost" disabled={pending} onClick={() => run(() => skipTweet({ id: t.id }), { success: 'Tweet saltado.', onOk: onClose })}>
            <SkipForward className="h-4 w-4" aria-hidden /> Saltar este tweet
          </Button>
        ) : null}
        {canEdit && !done ? <p className="text-sm text-text-2"><ImagePlus className="mr-1 inline h-4 w-4" aria-hidden />Para editar el texto, ábrelo en la tanda. Si estaba aprobado, vuelve a la aprobación del jefe.</p> : null}
      </div>
    </Sheet>
  );
}
