export default function Loading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      <div className="h-8 w-48 animate-pulse rounded bg-surface-2" />
      <div className="h-28 animate-pulse rounded-[var(--radius-card)] bg-surface-2" />
      <div className="h-28 animate-pulse rounded-[var(--radius-card)] bg-surface-2" />
    </div>
  );
}
