'use client';

import { useState } from 'react';
import { markPublishedNow } from '@/lib/actions/publications';
import { useAction } from '@/lib/hooks/use-action';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { NETWORK_LABEL } from '@/lib/data/labels';
import { useCard } from './card-context';
import { LazyUpload } from './media-slot';
import { PUBLISH_NETWORKS } from './card-core';

// «Ya lo publiqué» from the card (D-63): the networks where it went out, each with its link, and the screenshot. What is
// recorded is what the boss approved (markPublishedNow takes the approved copy and cover; the database checks it). The
// card turns green.
type Net = (typeof PUBLISH_NETWORKS)[keyof typeof PUBLISH_NETWORKS][number];

export function PublishedDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { card } = useCard();
  const { run, pending } = useAction();
  const nets = PUBLISH_NETWORKS[card.format];
  const [chosen, setChosen] = useState<Partial<Record<Net, string>>>({ [nets[0]]: '' });
  const [evidence, setEvidence] = useState<string | null>(null);
  const items = (Object.entries(chosen) as [Net, string][]).map(([network, url]) => ({ network, url: url.trim() }));
  const ready = items.length > 0 && items.every((x) => /^https?:\/\/\S+$/i.test(x.url));

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Ya lo publiqué" description={`«${card.title}»: dónde salió, con su link.`}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready) return;
          void run(() => markPublishedNow({ pieceId: card.id, items, evidenceId: evidence }), { onOk: () => onOpenChange(false) });
        }}
      >
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-semibold">Redes</legend>
          {nets.map((n) => {
            const on = n in chosen;
            const id = `pieza-${card.id}-pub-${n}`;
            return (
              <div key={n} className="flex flex-col gap-1.5">
                <label className="flex min-h-11 items-center gap-2 text-[15px] font-semibold">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-accent"
                    checked={on}
                    onChange={(e) =>
                      setChosen((c) => {
                        const next = { ...c };
                        if (e.target.checked) next[n] = '';
                        else delete next[n];
                        return next;
                      })
                    }
                  />
                  {NETWORK_LABEL[n]}
                </label>
                {on ? (
                  <>
                    <label htmlFor={id} className="sr-only">
                      Link de {NETWORK_LABEL[n]}
                    </label>
                    <Input
                      id={id}
                      type="url"
                      inputMode="url"
                      placeholder="https://"
                      value={chosen[n] ?? ''}
                      onChange={(e) => setChosen((c) => ({ ...c, [n]: e.target.value }))}
                    />
                  </>
                ) : null}
              </div>
            );
          })}
        </fieldset>
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-semibold">Captura (opcional)</p>
          {evidence ? (
            <p className="text-sm font-semibold text-ok" role="status">
              Captura subida.
            </p>
          ) : (
            <LazyUpload uploadLabel="Subir captura" accept="image/*" kind="evidence" onUploaded={(a) => setEvidence(a.id)} />
          )}
        </div>
        <Button type="submit" disabled={pending || !ready}>
          Guardar
        </Button>
        {!ready ? <p className="text-sm text-text-2">Elige al menos una red y pega su link (empieza con https://).</p> : null}
      </form>
    </Sheet>
  );
}
