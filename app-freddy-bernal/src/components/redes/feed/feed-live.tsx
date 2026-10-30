import { feedLiveText } from './feed-core';

// The feed's live line (R4, D-69): on top, «● 21 de 24 espacios ocupados en este mes · receptividad media 7,4» (only the
// rated pieces count, D-65); for screen readers, every move said as it happens («Movida al #6», «Espacio vaciado»).
export function FeedLive({ filled, avg, said }: { filled: number; avg: number | null; said: string }) {
  return (
    <div data-tour="feed-live" className="min-w-0">
      <p className="flex min-w-0 items-start gap-2 text-sm text-text-2">
        <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-ok" />
        <span className="min-w-0">{feedLiveText(filled, avg)}</span>
      </p>
      <p role="status" aria-live="polite" className="min-h-5 text-sm font-semibold text-text">
        {said}
      </p>
    </div>
  );
}
