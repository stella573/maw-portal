import { PageHeader } from "@/components/layout/page-header";
import {
  getInboxMailboxes,
  listTickets,
  canCreateTickets,
  type TicketFilters,
} from "@/modules/maildesk/services/tickets";
import { getCurrentUser } from "@/services/auth/current-user";
import { Inbox, type InboxView } from "./inbox";
import type { TicketStatus, TicketPriority } from "@/types/database";

/**
 * MailDesk – Ticket-Inbox. Postfächer + Tickets folgen automatisch der
 * Postfach-Mitgliedschaft (RLS). Filter laufen über die URL-Query.
 *
 * Standardansicht ist „Aktiv" (offen + wartend) – erledigte Tickets sind aus
 * dem aktiven Postfach ausgeblendet und nur über den Tab „Erledigt"/„Alle"
 * sichtbar.
 */
const VIEWS: InboxView[] = ["active", "resolved", "all"];

function statusesForView(view: InboxView): TicketStatus[] | undefined {
  switch (view) {
    case "active":
      return ["open", "pending"];
    case "resolved":
      return ["resolved"];
    case "all":
      return undefined;
  }
}

export default async function MailDeskPage({
  searchParams,
}: {
  searchParams: Promise<{
    mailbox?: string;
    view?: string;
    priority?: string;
    q?: string;
  }>;
}) {
  const sp = await searchParams;
  const [mailboxes, ctx] = await Promise.all([
    getInboxMailboxes(),
    getCurrentUser(),
  ]);

  // Standard-Postfach: aus Query oder erstes verfügbares.
  const mailboxId = sp.mailbox ?? mailboxes[0]?.id;
  const view: InboxView = VIEWS.includes(sp.view as InboxView)
    ? (sp.view as InboxView)
    : "active";

  const filters: TicketFilters = {
    mailboxId,
    statuses: statusesForView(view),
    priority: sp.priority as TicketPriority | undefined,
    search: sp.q,
  };

  const [tickets, canCreate] = await Promise.all([
    mailboxId ? listTickets(filters) : Promise.resolve([]),
    canCreateTickets(),
  ]);

  const currentUser = ctx
    ? { profileId: ctx.profileId, name: ctx.fullName ?? ctx.email }
    : null;

  return (
    <div>
      <PageHeader
        title="MailDesk"
        description="Internes Ticketsystem – Postfächer, Verlauf, Antworten."
      />
      <Inbox
        mailboxes={mailboxes}
        tickets={tickets}
        mailboxId={mailboxId}
        view={view}
        priority={sp.priority as TicketPriority | undefined}
        search={sp.q}
        canCreate={canCreate}
        currentUser={currentUser}
      />
    </div>
  );
}
