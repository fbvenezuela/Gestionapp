import Link from 'next/link';
import { cn } from '@/lib/cn';
import { TabStrip } from '@/app/(panel)/ajustes/asistente/tab-strip';

// The boss's three pages of Mensajes (D-50, D-51): his own conversations, every one to read, and who talks to whom.
const TABS = [
  { key: 'mias', href: '/mensajes', label: 'Mías' },
  { key: 'todas', href: '/mensajes/todas', label: 'Todas' },
  { key: 'permisos', href: '/mensajes/permisos', label: 'Quién habla con quién' },
] as const;

export function ChatTabs({ current }: { current: (typeof TABS)[number]['key'] }) {
  return (
    <nav aria-label="Mensajes del jefe" className="mb-4">
      <TabStrip current={current} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {TABS.map((t) => (
          <li key={t.key} className="shrink-0">
            <Link
              href={t.href}
              aria-current={t.key === current ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-11 items-center whitespace-nowrap rounded-full border px-4 text-sm font-semibold',
                t.key === current ? 'border-accent bg-accent text-on-accent' : 'border-border bg-surface text-text-2 hover:bg-surface-2 hover:text-text',
              )}
            >
              {t.label}
            </Link>
          </li>
        ))}
      </TabStrip>
    </nav>
  );
}
