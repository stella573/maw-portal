/**
 * Globaler Lade-Skeleton für den gesamten Portalbereich.
 *
 * Erzeugt eine Suspense-Grenze um die Portal-Seiten: Bei jeder Navigation
 * erscheint SOFORT dieses Gerüst, während die Server-Komponente (Auth + DB)
 * im Hintergrund streamt. Dadurch fühlt sich das Klicken unmittelbar an,
 * statt auf den fertigen Server-Render zu warten.
 */
export default function PortalLoading() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      {/* PageHeader-Platzhalter */}
      <div className="mb-6 space-y-2">
        <div className="h-7 w-48 rounded-lg bg-[var(--surface)]" />
        <div className="h-4 w-72 rounded bg-[var(--surface)]" />
      </div>

      {/* Inhalts-Platzhalter (Karten) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
          >
            <div className="h-4 w-24 rounded bg-[var(--background)]" />
            <div className="mt-4 h-8 w-16 rounded bg-[var(--background)]" />
            <div className="mt-3 h-3 w-full rounded bg-[var(--background)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
