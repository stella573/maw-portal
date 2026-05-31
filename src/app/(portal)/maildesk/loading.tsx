/**
 * Lade-Skeleton der MailDesk-Inbox (Postfach-Umschalter, Tabs, Ticketliste).
 * Erscheint sofort beim Öffnen/Wechseln, während Tickets serverseitig laden.
 */
export default function MailDeskLoading() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <div className="mb-6 space-y-2">
        <div className="h-7 w-40 rounded-lg bg-[var(--surface)]" />
        <div className="h-4 w-80 rounded bg-[var(--surface)]" />
      </div>

      {/* Postfach-Chips */}
      <div className="mb-4 flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-9 w-28 rounded-lg bg-[var(--surface)]" />
        ))}
      </div>

      {/* Tabs + Filter */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="h-9 w-56 rounded-lg bg-[var(--surface)]" />
        <div className="h-9 w-40 rounded-lg bg-[var(--surface)]" />
      </div>

      {/* Ticketliste */}
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="divide-y divide-[var(--border)]">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-3">
              <div className="mt-1 h-2 w-2 rounded-full bg-[var(--background)]" />
              <div className="mt-0.5 h-5 w-14 rounded-full bg-[var(--background)]" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-2/3 rounded bg-[var(--background)]" />
                <div className="h-3 w-1/2 rounded bg-[var(--background)]" />
              </div>
              <div className="h-3 w-16 rounded bg-[var(--background)]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
