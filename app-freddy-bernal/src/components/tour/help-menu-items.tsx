'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CircleHelp, PlayCircle } from 'lucide-react';
import type { Tour } from '@/lib/guides/types';
import { TOUR_CAN_ANSWER_EVENT, TOUR_CAN_EVENT, TOUR_START_EVENT, type TourCanAnswer, type TourStartDetail } from './tour-core';

// In «Mi cuenta», after «Mi perfil y avisos» (R3, D-46, design §5.2): «Ayuda y guías» and the tutorials of this
// screen that can run now. When the menu opens it asks the engine (tour-host.tsx) about each of the person's
// tutorials (`fb:tour:can`, answered at once): the engine knows the screen, the person's home and what is on screen.
// Nothing is listed on the server or before the menu opens, so there is nothing to differ when the page hydrates.

const ITEM = 'flex min-h-11 w-full items-center gap-2 rounded-[var(--radius-control)] px-3 text-left text-[15px] hover:bg-surface-2';

type Here = { id: string; title: string };

/** The person's tutorials that the engine says can run on this screen now, in the engine's order. */
export function tutorialsHere(tours: readonly Tour[], target: Pick<Window, 'addEventListener' | 'removeEventListener' | 'dispatchEvent'> = window): Here[] {
  const answers: TourCanAnswer[] = [];
  const onAnswer = (e: Event) => {
    const d = (e as CustomEvent<TourCanAnswer>).detail;
    if (d?.ok) answers.push(d);
  };
  target.addEventListener(TOUR_CAN_ANSWER_EVENT, onAnswer);
  try {
    for (const t of tours) target.dispatchEvent(new CustomEvent(TOUR_CAN_EVENT, { detail: { id: t.id } }));
  } finally {
    target.removeEventListener(TOUR_CAN_ANSWER_EVENT, onAnswer);
  }
  return answers
    .sort((a, b) => a.order - b.order)
    .flatMap((a) => {
      const t = tours.find((x) => x.id === a.id);
      return t ? [{ id: t.id, title: t.title }] : [];
    });
}

/** One tutorial: «Ver el tutorial de esta pantalla»; more (the home has `bienvenida` and its own): one per title. */
export function tutorialLabel(title: string, count: number): string {
  return count === 1 ? 'Ver el tutorial de esta pantalla' : `Ver el tutorial: ${title}`;
}

export function HelpMenuItems({ tours }: { tours: Tour[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [here, setHere] = useState<Here[]>([]);

  useEffect(() => {
    const menu = box.current?.closest('details');
    if (!menu) return;
    const onToggle = () => {
      if (menu.open) setHere(tutorialsHere(tours));
    };
    menu.addEventListener('toggle', onToggle);
    return () => menu.removeEventListener('toggle', onToggle);
  }, [tours]);

  return (
    <div ref={box}>
      <Link href="/ayuda" data-tour="help-menu" className={ITEM}>
        <CircleHelp className="h-4 w-4 shrink-0" aria-hidden />
        Ayuda y guías
      </Link>
      {here.map((t) => (
        <button
          key={t.id}
          type="button"
          className={ITEM}
          onClick={(e) => {
            // The focus comes back to «Mi cuenta» when the tutorial ends (this menu closes when the focus leaves it).
            const opener = e.currentTarget.closest('details')?.querySelector('summary') ?? null;
            window.dispatchEvent(new CustomEvent(TOUR_START_EVENT, { detail: { id: t.id, opener } satisfies TourStartDetail }));
          }}
        >
          <PlayCircle className="h-4 w-4 shrink-0" aria-hidden />
          {tutorialLabel(t.title, here.length)}
        </button>
      ))}
    </div>
  );
}
