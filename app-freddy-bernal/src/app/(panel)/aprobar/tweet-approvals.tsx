'use client';

import { useState } from 'react';
import { CheckCheck } from 'lucide-react';
import { approveTweets } from '@/lib/actions/tweets';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { fmtDateTime } from '@/lib/time';
import { approvedToast } from '@/components/tweets/approved-toast';

type T = { id: string; body: string; weighted_length: number; scheduled_at: string | null; category: string | null; batch: string };

export function TweetApprovals({ tweets, canApprove }: { tweets: T[]; canApprove: boolean }) {
  const { run, pending } = useAction();
  const [sel, setSel] = useState<Set<string>>(new Set(tweets.map((t) => t.id)));
  const toggle = (id: string) => setSel((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  return (
    <div className="flex flex-col gap-3">
      {canApprove ? (
        <div className="sticky top-16 z-10 flex items-center gap-2 rounded-[var(--radius-card)] border border-border bg-surface p-3">
          <span className="text-sm text-text-2">{sel.size} de {tweets.length} marcados. Desmarca los que no van.</span>
          <Button className="ml-auto" disabled={pending || !sel.size} onClick={() => run(() => approveTweets({ tweets: tweets.filter((t) => sel.has(t.id)).map((t) => ({ id: t.id, body: t.body })) }), { onOk: approvedToast })}>
            <CheckCheck className="h-4 w-4" aria-hidden /> Aprobar marcados
          </Button>
        </div>
      ) : null}
      <Card>
        <ul className="divide-y divide-border">
          {tweets.map((t) => (
            <li key={t.id}>
              <label className="flex gap-3 px-4 py-3">
                {canApprove ? <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-accent" checked={sel.has(t.id)} onChange={() => toggle(t.id)} /> : null}
                <span className="min-w-0">
                  <span className="block whitespace-pre-wrap text-[15px]">{t.body}</span>
                  <span className="mt-1 block text-sm text-text-2">{[t.category, t.scheduled_at ? fmtDateTime(t.scheduled_at) : 'sin hora', `${t.weighted_length}/280`, t.batch].filter(Boolean).join(' · ')}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
