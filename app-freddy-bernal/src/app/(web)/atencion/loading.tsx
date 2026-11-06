// While an attention page loads (a slow connection): a calm placeholder of the page, no spinner wall.
export default function AttentionLoading() {
  return (
    <div className="w-full bg-ivory px-4 py-10 sm:px-6 sm:py-14" aria-busy="true">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <p className="sr-only" role="status">
          Cargando…
        </p>
        <div className="flex flex-wrap gap-2" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="h-11 w-36 rounded-full bg-surface-2 motion-safe:animate-pulse" />
          ))}
        </div>
        <span className="h-4 w-40 rounded bg-surface-2 motion-safe:animate-pulse" aria-hidden />
        <span className="h-12 w-full max-w-2xl rounded-xl bg-surface-2 motion-safe:animate-pulse" aria-hidden />
        <span className="h-6 w-full max-w-xl rounded bg-surface-2 motion-safe:animate-pulse" aria-hidden />
        <span className="mt-4 h-72 w-full max-w-3xl rounded-[var(--radius-card)] bg-surface-2 motion-safe:animate-pulse" aria-hidden />
      </div>
    </div>
  );
}
