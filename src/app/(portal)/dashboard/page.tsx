import { PageHeader } from "@/components/layout/page-header";

export default function DashboardPage() {
  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Überblick über das MAW Internal Portal."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { label: "Offene Tickets", hint: "MailDesk" },
          { label: "Wartend", hint: "MailDesk" },
          { label: "Heute erledigt", hint: "MailDesk" },
        ].map((c) => (
          <div
            key={c.label}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
          >
            <div className="text-sm text-[var(--muted)]">{c.label}</div>
            <div className="mt-2 text-3xl font-semibold">—</div>
            <div className="mt-1 text-xs text-[var(--muted)]">{c.hint}</div>
          </div>
        ))}
      </div>
      <p className="mt-8 text-sm text-[var(--muted)]">
        Kennzahlen werden mit dem MailDesk-Datenfluss (Phase 1.3) angebunden.
      </p>
    </div>
  );
}
