import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { GlossaryTerm, SharedTopic } from '@/lib/guides/types';
import { Card, CardHeader } from '@/components/ui/card';

// «Para todos» (R3, design §5.4, §7.3): one <details> per topic, closed, so the phone shows the titles first. Last,
// «Palabras de la app» (the team guide's glossary, 12/11): each word with what it means, at /ayuda#palabras.
export const GLOSSARY_TITLE = 'Palabras de la app';

function Topic({ title, id, children }: { title: string; id?: string; children: ReactNode }) {
  return (
    <details className="group" id={id}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-2 font-semibold [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">{title}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      {children}
    </details>
  );
}

export function SharedTopics({ topics, glossary, id }: { topics: SharedTopic[]; glossary?: readonly GlossaryTerm[]; id?: string }) {
  const messages = topics.some((t) => t.id === 'mensajes');
  const parts = ['Entrar', 'lo de arriba', 'el teléfono', 'sin señal', 'la regla de la fecha', ...(messages ? ['Mensajes'] : []), '360', ...(glossary?.length ? ['las palabras de la app'] : [])];
  return (
    <Card solid id={id}>
      <CardHeader title="Para todos" subtitle={`${parts.slice(0, -1).join(', ')} y ${parts.at(-1)}.`} />
      <div className="divide-y divide-border">
        {topics.map((t) => (
          <Topic key={t.id} title={t.title}>
            <ul className="flex list-disc flex-col gap-1.5 px-4 pb-4 pl-9 text-[15px]">
              {t.body.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </Topic>
        ))}
        {glossary?.length ? (
          <Topic title={GLOSSARY_TITLE} id="palabras">
            <dl className="flex flex-col gap-3 px-4 pb-4 text-[15px]">
              {glossary.map((g) => (
                <div key={g.id}>
                  <dt className="font-semibold">{g.term}</dt>
                  <dd className="text-text-2">{g.text}</dd>
                </div>
              ))}
            </dl>
          </Topic>
        ) : null}
      </div>
    </Card>
  );
}
