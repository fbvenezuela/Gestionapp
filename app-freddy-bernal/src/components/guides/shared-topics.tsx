import { ChevronDown } from 'lucide-react';
import type { SharedTopic } from '@/lib/guides/types';
import { Card, CardHeader } from '@/components/ui/card';

// «Para todos» (R3, design §5.4, §7.3): one <details> per topic, closed, so the phone shows the titles first.
export function SharedTopics({ topics, id }: { topics: SharedTopic[]; id?: string }) {
  const messages = topics.some((t) => t.id === 'mensajes');
  return (
    <Card solid id={id}>
      <CardHeader
        title="Para todos"
        subtitle={messages ? 'Entrar, lo de arriba, el teléfono, sin señal, la regla de la fecha, Mensajes y 360.' : 'Entrar, lo de arriba, el teléfono, sin señal, la regla de la fecha y 360.'}
      />
      <div className="divide-y divide-border">
        {topics.map((t) => (
          <details key={t.id} className="group">
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-2 font-semibold [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 flex-1">{t.title}</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <ul className="flex list-disc flex-col gap-1.5 px-4 pb-4 pl-9 text-[15px]">
              {t.body.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </Card>
  );
}
