import Link from 'next/link';
import { FORMAT, type Format } from '@/lib/domain/redes';
import { cn } from '@/lib/cn';

// The month's quota of a section (D-68, A1): «Reels de Mes 1: 9 de 12», or «14 de 12: pasaste el cupo (no bloquea
// nada)». Informative: going over blocks nothing. Fin de mes has no quota. Administración (who sets it, with 2FA) gets
// «Cambiar en Ajustes».
export function quotaText(format: Format, monthLabel: string, count: number, quota: number | null): string {
  const head = `${FORMAT[format].plural} de ${monthLabel}`;
  if (quota === null) return `${head}: ${count} ${count === 1 ? 'pieza' : 'piezas'} (sin cupo)`;
  if (count > quota) return `${head}: ${count} de ${quota}: pasaste el cupo (no bloquea nada)`;
  return `${head}: ${count} de ${quota}`;
}

export function QuotaLine({ format, monthLabel, count, quota, canChange }: { format: Format; monthLabel: string; count: number; quota: number | null; canChange: boolean }) {
  const over = quota !== null && count > quota;
  const pct = quota ? Math.min(100, Math.round((count / quota) * 100)) : 0;
  return (
    <div data-tour="month-quota" className="mb-4 flex min-w-0 flex-col gap-1.5">
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[15px]">
        <span className={cn('font-semibold', over ? 'text-warn' : 'text-text')}>{quotaText(format, monthLabel, count, quota)}</span>
        {canChange && quota !== null ? (
          <Link href="/ajustes/contenido" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-ink">
            Cambiar en Ajustes
          </Link>
        ) : null}
      </p>
      {quota ? (
        <div className="h-2 w-full max-w-sm overflow-hidden rounded-full bg-surface-2" aria-hidden>
          <div className={cn('h-full', over ? 'bg-warn' : 'bg-accent')} style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </div>
  );
}
