'use client';

import { useState } from 'react';
import { CalendarClock, CheckCheck, Shuffle } from 'lucide-react';
import { approveTweets, redistributeBatch, scheduleTweets, updateTweet } from '@/lib/actions/tweets';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Textarea } from '@/components/ui/field';
import { Chip } from '@/components/ui/chip';
import { CategorySelect } from '@/components/ui/category-select';
import type { CategoryOption } from '@/lib/data/common';
import { TWEET_STATUS } from '@/lib/data/labels';
import { tweetLength, X_MAX } from '@/lib/domain/tweets';

export function BatchActions({ batchId, counts, draftIds, canApprove, canEdit }: { batchId: string; counts: { draft: number; approved: number; scheduled: number }; draftIds: string[]; canApprove: boolean; canEdit: boolean }) {
  const { run, pending } = useAction();
  return (
    <Card className="mb-4">
      <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-2">
          <Chip tone="warn">{counts.draft} por aprobar</Chip>
          <Chip tone="info">{counts.approved} aprobados</Chip>
          <Chip tone="accent">{counts.scheduled} programados</Chip>
        </div>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          {canApprove && counts.draft ? (
            <Button disabled={pending} onClick={() => run(() => approveTweets({ ids: draftIds }), { success: 'Tweets aprobados.' })}>
              <CheckCheck className="h-4 w-4" aria-hidden /> Aprobar los {counts.draft}
            </Button>
          ) : null}
          {canEdit ? (
            <Button variant="secondary" disabled={pending} onClick={() => confirm('¿Volver a repartir las horas de esta tanda?') && run(() => redistributeBatch({ batchId }), { success: 'Horas repartidas de nuevo.' })}>
              <Shuffle className="h-4 w-4" aria-hidden /> Repartir de nuevo
            </Button>
          ) : null}
          {canEdit && counts.approved ? (
            <Button disabled={pending} onClick={() => run(() => scheduleTweets({ batchId }), { success: 'Programados. Quedan en el calendario con «Copiar» y «Ya lo publiqué».' })}>
              <CalendarClock className="h-4 w-4" aria-hidden /> Programar
            </Button>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}

type T = { id: string; body: string; status: string; category_id: string | null; position: number };

export function BatchEditor({ tweets, categories }: { tweets: T[]; categories: CategoryOption[] }) {
  return (
    <Card>
      <CardHeader title="Editar textos" subtitle="Si cambias un tweet aprobado, vuelve a la aprobación del jefe." />
      <ol className="divide-y divide-border">
        {tweets.map((t, i) => <Row key={t.id} t={t} n={i + 1} categories={categories} />)}
      </ol>
    </Card>
  );
}

function Row({ t, n, categories }: { t: T; n: number; categories: CategoryOption[] }) {
  const { run, pending } = useAction();
  const [body, setBody] = useState(t.body);
  const len = tweetLength(body);
  const locked = t.status === 'published' || t.status === 'skipped';
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">Tweet {n}</span>
        <span className="flex items-center gap-2">
          <span className={len > X_MAX ? 'font-mono text-sm font-bold text-danger' : 'font-mono text-sm text-text-2'}>{len}/{X_MAX}</span>
          <Chip tone={TWEET_STATUS[t.status]?.tone}>{TWEET_STATUS[t.status]?.label}</Chip>
        </span>
      </div>
      <Textarea aria-label={`Texto del tweet ${n}`} rows={3} value={body} disabled={locked} onChange={(e) => setBody(e.target.value)} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <CategorySelect aria-label={`Categoría del tweet ${n}`} categories={categories} value={t.category_id ?? ''} disabled={locked || pending} onChange={(e) => run(() => updateTweet({ id: t.id, categoryId: e.target.value || null }))} className="sm:max-w-xs" />
        {body !== t.body ? (
          <Button size="sm" disabled={pending || len > X_MAX} onClick={() => run(() => updateTweet({ id: t.id, body }), { success: 'Guardado.' })} className="sm:ml-auto">Guardar texto</Button>
        ) : null}
      </div>
    </li>
  );
}
