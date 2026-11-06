'use client';

import { useEffect, useRef } from 'react';

// Cloudflare Turnstile (design §4): rendered only when the page got a site key, which happens only when both Turnstile
// keys are configured (src/lib/participation/turnstile.ts); otherwise the forms rely on the honeypot and the persistent
// limits. The script loads once, on demand, when this box appears (the last step of the form). Each token is good for
// one send: the form asks for a new one after trying (resetKey).

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const s = document.createElement('script');
    s.src = SRC;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')));
    s.onerror = () => {
      loading = null;
      reject(new Error('turnstile'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export function Turnstile({ siteKey, onToken, resetKey = 0 }: { siteKey: string; onToken: (token: string | null) => void; resetKey?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const cb = useRef(onToken);
  useEffect(() => {
    cb.current = onToken;
  });
  useEffect(() => {
    let id: string | null = null;
    let cancelled = false;
    cb.current(null);
    loadTurnstile()
      .then((ts) => {
        if (cancelled || !box.current) return;
        id = ts.render(box.current, {
          sitekey: siteKey,
          language: 'es',
          callback: (token: string) => cb.current(token),
          'expired-callback': () => cb.current(null),
          'error-callback': () => cb.current(null),
        });
      })
      .catch(() => cb.current(null));
    return () => {
      cancelled = true;
      if (id) window.turnstile?.remove(id);
    };
  }, [siteKey, resetKey]);
  return (
    <div className="flex flex-col gap-1">
      <div ref={box} className="min-h-16" />
      <p className="text-sm text-text-2">Una comprobación rápida de que no eres un robot.</p>
    </div>
  );
}
