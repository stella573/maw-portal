/**
 * Lade-Skeleton der Ticket-Detailansicht (Verlauf + Seitenspalte).
 * Erscheint sofort beim Öffnen eines Tickets, während Nachrichten/Notizen
 * serverseitig geladen werden – kein Warten auf den fertigen Render.
 */
export default function TicketLoading() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <div className="mb-4 h-4 w-32 rounded bg-[var(--surface)]" />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Hauptspalte: Verlauf */}
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="h-6 w-2/3 rounded bg-[var(--background)]" />
            <div className="mt-2 h-3 w-1/3 rounded bg-[var(--background)]" />
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              <div className="mb-3 h-3 w-40 rounded bg-[var(--background)]" />
              <div className="space-y-2">
                <div className="h-3 w-full rounded bg-[var(--background)]" />
                <div className="h-3 w-11/12 rounded bg-[var(--background)]" />
                <div className="h-3 w-3/4 rounded bg-[var(--background)]" />
              </div>
            </div>
          ))}
          <div className="h-40 rounded-xl border border-[var(--border)] bg-[var(--surface)]" />
        </div>

        {/* Seitenspalte */}
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-36 rounded-xl border border-[var(--border)] bg-[var(--surface)]"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
