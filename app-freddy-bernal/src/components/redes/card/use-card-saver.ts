'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { saveDetails, saveShots, saveSlideTexts, saveTitle } from '@/lib/actions/redes';
import { saveCopy } from '@/lib/actions/pieces';
import { draftStorageKey } from '@/lib/hooks/use-draft';
import { STALE_CARD } from '@/lib/domain/redes';
import type { CardData, CardDetails, Shot } from '@/lib/data/redes';
import type { SlideText } from './card-core';

// The card saves on its own (D-61, §4.4): what is typed goes to the server 1,2 s after the last key, one save after the
// other (every save of piece_details carries `rev`, so nobody's newer change is stepped on), with a copy in the phone
// (a lost signal or a closed tab keeps the work until it is saved). What the server sends back (live refresh, another
// person's change) replaces what is on screen only when nothing is waiting to be saved and nothing is in flight.

export const SAVE_DELAY = 1200;

export type Group = 'long' | 'medium' | 'short';
export type DetailKey = Exclude<keyof CardDetails, 'rev' | 'shots' | 'slides'>;
type Patch = Partial<Pick<CardDetails, DetailKey>>;
type Pending = { patch: Patch; shots?: Shot[]; slides?: SlideText[]; title?: string; copies: Partial<Record<Group, string>> };
type Draft = Pending & { rev: number };

const empty = (): Pending => ({ patch: {}, copies: {} });

/** What did not reach the server goes back in front of what was typed since (the newer value of a field wins). */
function requeue(failed: Pending, now: Pending): Pending {
  return {
    patch: { ...failed.patch, ...now.patch },
    shots: now.shots ?? failed.shots,
    slides: now.slides ?? failed.slides,
    title: now.title ?? failed.title,
    copies: { ...failed.copies, ...now.copies },
  };
}
const isEmpty = (p: Pending) =>
  !Object.keys(p.patch).length && p.shots === undefined && p.slides === undefined && p.title === undefined && !Object.keys(p.copies).length;

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function useCardSaver(card: CardData, userId: string) {
  const router = useRouter();
  const [details, setDetails] = useState<CardDetails>(card.details);
  const [title, setTitleState] = useState(card.title);
  const [copies, setCopies] = useState(card.copies);
  const [state, setState] = useState<SaveState>('idle');
  // Something of ours waits or is on its way (state, so the render can compare), and the rev our last save got.
  const [dirty, setDirty] = useState(false);
  const [savedRev, setSavedRev] = useState(card.details.rev);
  const [seen, setSeen] = useState(card);
  const rev = useRef(card.details.rev);
  const pending = useRef<Pending>(empty());
  const inFlight = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const storageKey = draftStorageKey(userId, `redes:card:${card.id}`);

  const keepDraft = useCallback(() => {
    try {
      if (isEmpty(pending.current)) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, JSON.stringify({ ...pending.current, rev: rev.current } satisfies Draft));
    } catch {
      /* storage unavailable: the save still goes */
    }
  }, [storageKey]);

  const send = useCallback(
    async (p: Pending) => {
      inFlight.current++;
      setState('saving');
      let failed = false;
      let back = false;
      let refresh = false;
      // What has not reached the server yet: each part leaves it once saved. A cut signal (the action throws) or a
      // refusal keeps it, and it goes back in front of what was typed since, so the next save carries it and the
      // phone's copy keeps it. Only «another person changed this card» drops it (resending would step on that change).
      const left: Pending = { ...p, patch: { ...p.patch }, copies: { ...p.copies } };
      const done = (r: { ok: boolean; error?: string; message?: string; data?: unknown }, drop: () => void) => {
        if (!r.ok) {
          failed = true;
          toast.error(r.error ?? 'No se pudo guardar.');
          if (r.error === STALE_CARD) drop();
          return false;
        }
        drop();
        if (r.message === 'Volvió al jefe') back = true;
        return true;
      };
      try {
        if (p.title !== undefined) done(await saveTitle({ pieceId: card.id, title: p.title }), () => delete left.title);
        if (Object.keys(p.patch).length) {
          const r = await saveDetails({ pieceId: card.id, rev: rev.current, patch: p.patch });
          if (done(r, () => (left.patch = {})) && r.ok) rev.current = r.data!.rev;
        }
        if (p.shots) {
          const r = await saveShots({ pieceId: card.id, rev: rev.current, shots: p.shots });
          if (done(r, () => delete left.shots) && r.ok) rev.current = r.data!.rev;
        }
        if (p.slides) {
          const r = await saveSlideTexts({ pieceId: card.id, rev: rev.current, slides: p.slides });
          if (done(r, () => delete left.slides) && r.ok) rev.current = r.data!.rev;
        }
        for (const g of Object.keys(p.copies) as Group[]) {
          const r = await saveCopy({ pieceId: card.id, group: g, body: p.copies[g]! });
          if (done(r, () => delete left.copies[g])) {
            refresh = true; // saveCopy does not refresh Redes: the card's «what is missing» comes from the server
            if (r.ok && r.data?.reopened) back = true;
          }
        }
      } catch {
        failed = true;
        toast.error('No se pudo guardar. Revisa la señal: lo escrito sigue en este teléfono.');
      } finally {
        inFlight.current--;
      }
      if (!isEmpty(left)) pending.current = requeue(left, pending.current);
      if (back) toast.info('Volvió al jefe');
      if (back || refresh) router.refresh();
      const busy = inFlight.current > 0 || !isEmpty(pending.current);
      setState(failed ? 'error' : busy ? 'saving' : 'saved');
      setSavedRev(rev.current);
      setDirty(busy);
      keepDraft();
    },
    [card.id, keepDraft, router],
  );

  // Sends what waits now; the promise ends when every save so far is done (an action that writes the same row waits).
  const flush = useCallback((): Promise<void> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const p = pending.current;
    if (!isEmpty(p)) {
      pending.current = empty();
      queue.current = queue.current.then(() => send(p));
    }
    return queue.current;
  }, [send]);

  const schedule = useCallback(() => {
    keepDraft();
    setDirty(true);
    setState('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY);
  }, [flush, keepDraft]);

  const setField = useCallback(
    <K extends DetailKey>(key: K, value: CardDetails[K]) => {
      setDetails((d) => ({ ...d, [key]: value }));
      pending.current = { ...pending.current, patch: { ...pending.current.patch, [key]: value } };
      schedule();
    },
    [schedule],
  );

  const setShots = useCallback(
    (shots: Shot[]) => {
      setDetails((d) => ({ ...d, shots }));
      pending.current = { ...pending.current, shots };
      schedule();
    },
    [schedule],
  );

  const setSlides = useCallback(
    (slides: SlideText[], now = false) => {
      setDetails((d) => ({ ...d, slides }));
      pending.current = { ...pending.current, slides };
      if (now) flush();
      else schedule();
    },
    [flush, schedule],
  );

  const setTitle = useCallback(
    (t: string) => {
      setTitleState(t);
      // 3 to 140 letters (the database's rule): shorter is kept on screen and saved when it is long enough.
      if (t.trim().length < 3) {
        const { title: _drop, ...rest } = pending.current;
        void _drop;
        pending.current = { ...rest };
        return;
      }
      pending.current = { ...pending.current, title: t.trim() };
      schedule();
    },
    [schedule],
  );

  const setCopy = useCallback(
    (g: Group, body: string) => {
      setCopies((c) => ({ ...c, [g]: body }));
      pending.current = { ...pending.current, copies: { ...pending.current.copies, [g]: body } };
      schedule();
    },
    [schedule],
  );

  // An action that wrote piece_details itself («Traer del storyboard»): its rev and what it wrote become ours.
  const applyServer = useCallback((next: number, cols: Partial<CardDetails>) => {
    rev.current = next;
    setSavedRev(next);
    setDetails((d) => ({ ...d, ...cols }));
  }, []);

  // A copy kept in this phone (a cut signal, a closed tab) comes back if the card did not change since. Read after the
  // first paint: the server never has the phone's copy, so the first render is the server's card.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return;
        const d = JSON.parse(raw) as Draft;
        if (d.rev !== rev.current) {
          localStorage.removeItem(storageKey);
          return;
        }
        pending.current = { patch: d.patch ?? {}, shots: d.shots, slides: d.slides, title: d.title, copies: d.copies ?? {} };
        if (isEmpty(pending.current)) return;
        setDetails((x) => ({ ...x, ...d.patch, ...(d.shots ? { shots: d.shots } : {}), ...(d.slides ? { slides: d.slides } : {}) }));
        if (d.title) setTitleState(d.title);
        if (d.copies) setCopies((c) => ({ ...c, ...d.copies }));
        schedule();
      } catch {
        /* a broken draft: work without it */
      }
    });
    return () => cancelAnimationFrame(id);
  }, [storageKey, schedule]);

  // What the server says now (live refresh, another person's save, ours coming back), when nothing of ours is waiting
  // and it is not older than our last save.
  if (seen !== card) {
    setSeen(card);
    if (!dirty && card.details.rev >= savedRev) {
      setDetails(card.details);
      setTitleState(card.title);
      setCopies(card.copies);
    }
  }

  // A card adopted from the server carries its rev: the next save goes on from it.
  useEffect(() => {
    if (details.rev > rev.current) rev.current = details.rev;
  }, [details.rev]);

  // Leaving the page or the tab: what is waiting goes now. The signal coming back: what a cut kept goes too.
  useEffect(() => {
    const out = () => void flush();
    window.addEventListener('pagehide', out);
    window.addEventListener('online', out);
    return () => {
      window.removeEventListener('pagehide', out);
      window.removeEventListener('online', out);
      out();
    };
  }, [flush]);

  return { details, title, copies, state, setField, setShots, setSlides, setTitle, setCopy, flush, applyServer };
}

export type CardSaver = ReturnType<typeof useCardSaver>;
