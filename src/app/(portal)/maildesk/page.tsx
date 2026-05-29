import { PageHeader } from "@/components/layout/page-header";

/**
 * MailDesk – Ticket-Inbox (Skelett).
 * Liste/Filter/Detail folgen in Phase 1.3 (siehe ROADMAP). Hier nur die
 * Modul-Hülle, damit Navigation und Layout stehen.
 */
export default function MailDeskPage() {
  return (
    <div>
      <PageHeader
        title="MailDesk"
        description="Internes Ticketsystem – Inbox, Verlauf, Antworten."
      />

      <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-10 text-center">
        <p className="text-sm text-[var(--muted)]">
          Die Ticket-Inbox wird in Phase&nbsp;1.3 angebunden:
          Liste, Suche, Filter (Status/Priorität/Tags), Detailansicht mit
          Mailverlauf, internen Notizen und KI-Antwortvorschlägen.
        </p>
      </div>
    </div>
  );
}
