import Link from 'next/link';
import { cn } from '@/lib/cn';

export type AttentionSection = 'inicio' | 'nueva' | 'consultar' | 'atendido';

const LINKS: { key: AttentionSection; href: string; label: string }[] = [
  { key: 'inicio', href: '/atencion', label: 'Cómo funciona' },
  { key: 'nueva', href: '/atencion/nueva', label: 'Nueva solicitud' },
  { key: 'consultar', href: '/atencion/consultar', label: 'Consultar mi solicitud' },
  { key: 'atendido', href: '/atencion/atendido', label: 'Lo atendido' },
];

/** The attention desk's own small menu, under the site's header (it wraps on a phone, never scrolls sideways). */
export function ParticipationNav({ current }: { current: AttentionSection }) {
  return (
    <nav aria-label="Atención ciudadana" className="mb-8 sm:mb-10">
      <ul className="flex flex-wrap gap-1.5 sm:gap-2">
        {LINKS.map((l) => {
          const on = l.key === current;
          return (
            <li key={l.key}>
              <Link
                href={l.href}
                aria-current={on ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-11 items-center rounded-full border px-3.5 text-sm font-semibold transition-colors motion-reduce:transition-none sm:px-4 sm:text-[15px]',
                  on ? 'border-text bg-text text-surface' : 'border-border bg-surface text-text hover:border-text',
                )}
              >
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
