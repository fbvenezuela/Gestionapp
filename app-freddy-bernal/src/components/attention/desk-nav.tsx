import Link from 'next/link';
import { cn } from '@/lib/cn';
import type { DeskAccess } from '@/lib/domain/attention';

export type DeskTab = 'bandeja' | 'tablero' | 'mapa' | 'cifras' | 'areas' | 'respuestas' | 'registro';

// The tabs of «Atención» (one menu item for the four roles of the desk, D-93): each person sees the tabs of what they
// may do. Links, so they work with the keyboard and without JavaScript; they wrap on a 360 px phone.
export function DeskNav({ access, current }: { access: DeskAccess; current: DeskTab }) {
  const tabs: { key: DeskTab; href: string; label: string; show: boolean }[] = [
    { key: 'bandeja', href: '/admin/atencion', label: 'Bandeja', show: access.readsCases },
    { key: 'tablero', href: '/admin/atencion?vista=tablero', label: 'Tablero', show: access.readsCases },
    { key: 'mapa', href: '/admin/atencion/mapa', label: 'Mapa', show: access.readsCases },
    { key: 'cifras', href: '/admin/atencion/estadisticas', label: 'Cifras', show: access.stats },
    { key: 'areas', href: '/admin/atencion/areas', label: 'Áreas y plazos', show: access.seesAreas },
    { key: 'respuestas', href: '/admin/atencion/plantillas', label: 'Respuestas guardadas', show: access.templates },
    { key: 'registro', href: '/admin/atencion/registro', label: 'Registro', show: access.auditLog },
  ];
  const visible = tabs.filter((t) => t.show);
  if (visible.length < 2) return null;
  return (
    <nav aria-label="Secciones de atención" className="mb-5">
      <ul className="flex flex-wrap gap-2">
        {visible.map((t) => (
          <li key={t.key}>
            <Link
              href={t.href}
              aria-current={t.key === current ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-11 items-center rounded-[var(--radius-chip)] border px-3 text-sm font-semibold',
                t.key === current ? 'border-accent bg-accent-soft text-accent-ink' : 'border-border bg-surface text-text hover:bg-surface-2',
              )}
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
