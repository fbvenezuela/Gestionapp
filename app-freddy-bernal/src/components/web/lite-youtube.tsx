'use client';

import { useState, type ReactNode } from 'react';

// A YouTube video that loads only when someone taps it (design §2, docs/diagnostico.md problem 11): until then nothing
// of YouTube reaches the phone (no player, no cookies, not even its thumbnail: the poster is the site's own photo or
// placeholder). On tap, the player of youtube-nocookie.com (the privacy-enhanced mode) starts the video. The CSP allows
// frames from that origin only (src/lib/web/headers.ts). Kept tiny (no icon library): it is part of every page that
// can show a video.

const ID = /^[A-Za-z0-9_-]{11}$/;

export function LiteYouTube({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const [playing, setPlaying] = useState(false);
  if (!ID.test(id)) return null;
  if (playing) {
    return (
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className="absolute inset-0 h-full w-full border-0"
      />
    );
  }
  return (
    <>
      <div className="absolute inset-0" aria-hidden>
        {children}
      </div>
      <button type="button" onClick={() => setPlaying(true)} className="group absolute inset-0 grid h-full w-full place-items-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-action px-5 py-3 text-base font-semibold text-on-action shadow-[var(--glass-shadow-pop)] group-hover:bg-action-hover">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
            <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14Z" />
          </svg>
          Ver el video<span className="sr-only">: {title}</span>
        </span>
      </button>
    </>
  );
}
