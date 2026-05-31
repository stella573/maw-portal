/** Lade-Skeleton für Analytics (ROLLER-Aufrufe brauchen einen Moment). */
export default function AnalyticsLoading() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <div className="mb-6 space-y-2">
        <div className="h-7 w-40 rounded-lg bg-[var(--surface)]" />
        <div className="h-4 w-96 max-w-full rounded bg-[var(--surface)]" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl border border-[var(--border)] bg-[var(--surface)]" />
        ))}
      </div>
      <div className="mt-6 h-64 rounded-2xl border border-[var(--border)] bg-[var(--surface)]" />
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="h-64 rounded-2xl border border-[var(--border)] bg-[var(--surface)]" />
        <div className="h-64 rounded-2xl border border-[var(--border)] bg-[var(--surface)]" />
      </div>
    </div>
  );
}
