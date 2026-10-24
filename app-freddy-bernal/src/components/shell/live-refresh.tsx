'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { LIVE_TABLES, POLL_MS, createRefresher, isEditing } from './live-refresh-core';

// Keeps the screens up to date without touching anything: with Supabase, Realtime tells us when
// pieces, tweets, publications or notices change; in the demo (no Realtime) it looks again every
// minute while the tab is visible. It never refreshes while someone is typing in a field or has a
// dialog open: it waits until they leave the field.
export function LiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    const canRefresh = () =>
      document.visibilityState === 'visible' &&
      navigator.onLine !== false &&
      !isEditing(document.activeElement as HTMLElement | null) &&
      !document.querySelector('dialog[open], [role="dialog"], [role="alertdialog"]');

    const r = createRefresher({
      refresh: () => router.refresh(),
      canRefresh,
      timers: { now: () => Date.now(), setTimeout: (fn, ms) => window.setTimeout(fn, ms), clearTimeout: (id) => window.clearTimeout(id as number) },
    });

    let poll: number | null = null;
    const startPolling = () => {
      if (poll !== null) return;
      poll = window.setInterval(() => {
        if (document.visibilityState === 'visible') r.request(0);
      }, POLL_MS);
    };

    const sb = supabaseBrowser();
    const channel = sb ? sb.channel('live-refresh') : null;
    if (sb && channel) {
      for (const table of LIVE_TABLES) channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => r.request());
      channel.subscribe((status: string) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') startPolling();
      });
    } else startPolling();

    // Back from another app or tab: catch up if it has been a while; leaving a field lets a
    // pending refresh go through.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - r.lastRefresh >= POLL_MS) r.request(0);
      else r.resume();
    };
    const onFocusOut = () => r.resume();
    document.addEventListener('visibilitychange', onVisible);
    document.addEventListener('focusout', onFocusOut);
    window.addEventListener('online', onVisible);

    return () => {
      r.dispose();
      if (poll !== null) window.clearInterval(poll);
      if (sb && channel) void sb.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisible);
      document.removeEventListener('focusout', onFocusOut);
      window.removeEventListener('online', onVisible);
    };
  }, [router]);

  return null;
}
