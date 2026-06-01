/**
 * Lade-Skeleton für den Einstellungsbereich. Die Unter-Navigation kommt aus
 * dem settings/layout (bleibt stehen); hier wird nur der Inhaltsbereich als
 * Gerüst gezeigt, während die jeweilige Unterseite (Benutzer, Postfächer,
 * Rollen, Signatur …) serverseitig lädt.
 */
export default function SettingsLoading() {
  return (
    <div className="animate-pulse space-y-4" aria-hidden="true">
      <div className="space-y-2">
        <div className="h-5 w-40 rounded bg-[var(--surface)]" />
        <div className="h-4 w-72 rounded bg-[var(--surface)]" />
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <div className="h-4 w-48 rounded bg-[var(--background)]" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="h-10 rounded-lg bg-[var(--background)]" />
          <div className="h-10 rounded-lg bg-[var(--background)]" />
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4 last:border-b-0"
          >
            <div className="space-y-2">
              <div className="h-4 w-44 rounded bg-[var(--background)]" />
              <div className="h-3 w-60 rounded bg-[var(--background)]" />
            </div>
            <div className="h-8 w-24 rounded-lg bg-[var(--background)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
