'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Link2, Merge, Scissors, Trash2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { checkLinks, createBatch, extractDocx, suggestCategories } from '@/lib/actions/tweets';
import { useAction } from '@/lib/hooks/use-action';
import { useDraft } from '@/lib/hooks/use-draft';
import { checkTweets, splitTweets, X_MAX } from '@/lib/domain/tweets';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/field';
import { CategorySelect } from '@/components/ui/category-select';
import { Chip } from '@/components/ui/chip';
import type { CategoryOption } from '@/lib/data/common';
import { cn } from '@/lib/cn';

type T = { body: string; categoryId: string };

export function NewBatch({ categories }: { categories: CategoryOption[] }) {
  const router = useRouter();
  const { run, pending } = useAction();
  const { value, setValue, restored, clear } = useDraft<{ raw: string; title: string; source: string; tweets: T[] }>('tweet-batch', { raw: '', title: '', source: '', tweets: [] });
  const [links, setLinks] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const checks = useMemo(() => checkTweets(value.tweets.map((t) => t.body)), [value.tweets]);
  const problems = checks.filter((c) => c.tooLong || c.duplicateOf !== null).length + Object.values(links).filter((ok) => !ok).length;

  async function separate(text: string, source = value.source) {
    const parts = splitTweets(text);
    if (!parts.length) return toast.error('No encontré tweets en el texto.');
    setBusy(true);
    const sug = await suggestCategories(parts);
    const cats = sug.ok ? sug.data! : parts.map(() => null);
    setValue({ ...value, raw: text, source, tweets: parts.map((body, i) => ({ body, categoryId: cats[i] ?? '' })) });
    setBusy(false);
    toast.success(`Separé ${parts.length} tweets.`);
    const urls = checkTweets(parts).flatMap((c) => c.urls);
    if (urls.length) checkLinks(urls).then(setLinks);
  }

  async function onFile(f: File) {
    if (/\.docx$/i.test(f.name)) {
      setBusy(true);
      const fd = new FormData();
      fd.set('file', f);
      const r = await extractDocx(fd);
      setBusy(false);
      if (!r.ok) return toast.error(r.error);
      await separate(r.text, f.name);
    } else if (/\.(txt|md)$/i.test(f.name) || f.type.startsWith('text/')) {
      await separate(await f.text(), f.name);
    } else toast.error('Sube un .docx, .txt o .md');
  }

  const setTweet = (i: number, p: Partial<T>) => setValue({ ...value, tweets: value.tweets.map((t, j) => (j === i ? { ...t, ...p } : t)) });

  if (!value.tweets.length) {
    return (
      <div className="flex flex-col gap-4">
        {restored && value.raw ? <p className="rounded-[var(--radius-control)] bg-info-soft px-3 py-2 text-sm text-info">Recuperamos el texto que tenías.</p> : null}
        <Card>
          <CardBody className="flex flex-col gap-4">
            <input ref={fileRef} type="file" accept=".docx,.txt,.md,text/plain" className="sr-only" aria-label="Documento de tweets" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            <Button type="button" size="lg" variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
              <FileText className="h-5 w-5" aria-hidden /> {busy ? 'Leyendo…' : 'Subir el documento (.docx, .txt o .md)'}
            </Button>
            <p className="text-center text-sm text-text-2">o pega el texto</p>
            <Textarea aria-label="Texto con los tweets" rows={10} value={value.raw} onChange={(e) => setValue({ ...value, raw: e.target.value })} placeholder={'1. Primer tweet…\n2. Segundo tweet…\n\n(También sirven líneas en blanco o ---)'} />
            <Button type="button" size="lg" disabled={busy || !value.raw.trim()} onClick={() => separate(value.raw)}>
              <Wand2 className="h-5 w-5" aria-hidden /> Separar tweets
            </Button>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Nombre de la tanda" htmlFor="bt" className="flex-1">
            <Input id="bt" value={value.title} onChange={(e) => setValue({ ...value, title: e.target.value })} placeholder="Ej.: Semana del 26 de octubre" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Chip tone="info">{value.tweets.length} tweets</Chip>
            {problems ? <Chip tone="danger">{problems} por revisar</Chip> : <Chip tone="ok">Todo bien</Chip>}
          </div>
        </CardBody>
      </Card>

      <ol className="flex flex-col gap-3">
        {value.tweets.map((t, i) => {
          const c = checks[i];
          const brokenLinks = c.urls.filter((u) => links[u] === false);
          return (
            <li key={i}>
              <Card className={cn((c.tooLong || c.duplicateOf !== null || brokenLinks.length) && 'border-danger/50')}>
                <CardHeader
                  title={`Tweet ${i + 1}`}
                  action={<span className={cn('font-mono text-sm tabular', c.tooLong ? 'font-bold text-danger' : 'text-text-2')}>{c.length}/{X_MAX}</span>}
                />
                <CardBody className="flex flex-col gap-3">
                  <Textarea id={`tw-${i}`} aria-label={`Texto del tweet ${i + 1}`} rows={3} value={t.body} onChange={(e) => setTweet(i, { body: e.target.value })} />
                  {c.tooLong ? <p className="text-sm text-danger">Se pasa por {c.length - X_MAX}. Acórtalo o pártelo.</p> : null}
                  {c.duplicateOf !== null ? <p className="text-sm text-danger">Repetido: es igual al tweet {c.duplicateOf + 1}.</p> : null}
                  {brokenLinks.map((u) => <p key={u} className="flex items-center gap-1 text-sm text-danger"><Link2 className="h-4 w-4" aria-hidden /> Este link no abre: {u}</p>)}
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <CategorySelect aria-label={`Categoría del tweet ${i + 1}`} categories={categories} value={t.categoryId} onChange={(e) => setTweet(i, { categoryId: e.target.value })} className="sm:max-w-xs" />
                    <div className="flex gap-1 sm:ml-auto">
                      <Button type="button" variant="ghost" size="sm" onClick={() => {
                        const el = document.getElementById(`tw-${i}`) as HTMLTextAreaElement | null;
                        const at = el?.selectionStart ?? 0;
                        if (!at || at >= t.body.length) return toast.info('Pon el cursor donde quieres partir el tweet.');
                        const a = t.body.slice(0, at).trim();
                        const b = t.body.slice(at).trim();
                        const next = [...value.tweets];
                        next.splice(i, 1, { ...t, body: a }, { ...t, body: b });
                        setValue({ ...value, tweets: next });
                      }}>
                        <Scissors className="h-4 w-4" aria-hidden /> Partir
                      </Button>
                      {i < value.tweets.length - 1 ? (
                        <Button type="button" variant="ghost" size="sm" onClick={() => {
                          const next = [...value.tweets];
                          next.splice(i, 2, { ...t, body: `${t.body}\n${value.tweets[i + 1].body}` });
                          setValue({ ...value, tweets: next });
                        }}>
                          <Merge className="h-4 w-4" aria-hidden /> Unir con el siguiente
                        </Button>
                      ) : null}
                      <Button type="button" variant="ghost" size="icon" aria-label={`Quitar tweet ${i + 1}`} onClick={() => setValue({ ...value, tweets: value.tweets.filter((_, j) => j !== i) })}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardBody>
              </Card>
            </li>
          );
        })}
      </ol>

      <div className="sticky bottom-20 z-10 flex flex-col gap-2 rounded-[var(--radius-card)] border border-border bg-surface p-3 shadow-lg sm:flex-row lg:bottom-4">
        <Button type="button" variant="ghost" onClick={() => confirm('¿Empezar de nuevo? Se borra lo separado.') && setValue({ raw: value.raw, title: '', source: '', tweets: [] })}>Empezar de nuevo</Button>
        <Button
          type="button"
          size="lg"
          className="sm:ml-auto"
          disabled={pending || checks.some((c) => c.tooLong)}
          onClick={() =>
            run(() => createBatch({ title: value.title, sourceName: value.source, tweets: value.tweets.map((t) => ({ body: t.body, categoryId: t.categoryId || null })) }), {
              success: 'Tweets repartidos en la semana y enviados al jefe para aprobar.',
              refresh: false,
              onOk: (r) => {
                if (!r.ok) return;
                clear();
                router.push(`/tweets/${r.data!.id}`);
              },
            })
          }
        >
          Repartir en la semana y enviar a aprobación
        </Button>
      </div>
    </div>
  );
}
