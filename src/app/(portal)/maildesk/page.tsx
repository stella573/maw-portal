import { PageHeader } from "@/components/layout/page-header";
import {
  getInboxMailboxes,
  listTickets,
  canCreateTickets,
} from "@/modules/maildesk/services/tickets";
import { Inbox } from "./inbox";
import type { TicketStatus, TicketPriority } from "@/types/database";

/**
 * MailDesk – Ticket-Inbox. Postfächer + Tickets folgen automatisch der
 * Postfach-Mitgliedschaft (RLS). Filter laufen über die URL-Query.
 */
export default async function MailDeskPage({
  searchParams,
}: {
  searchParams: Promise<{
    mailbox?: string;
    status?: string;
    priority?: string;
    q?: string;
  }>;
}) {
  const sp = await searchParams;
  const mailboxes = await getInboxMailboxes();

  // Standard-Postfach: aus Query oder erstes verfügbares.
  const mailboxId = sp.mailbox ?? mailboxes[0]?.id;

  const filters = {
    mailboxId,
    status: sp.status as TicketStatus | undefined,
    priority: sp.priority as TicketPriority | undefined,
    search: sp.q,
  };

  const [tickets, canCreate] = await Promise.all([
    mailboxId ? listTickets(filters) : Promise.resolve([]),
    canCreateTickets(),
  ]);

  return (
    <div>
      <PageHeader
        title="MailDesk"
        description="Internes Ticketsystem – Postfächer, Verlauf, Antworten."
      />
      <Inbox
        mailboxes={mailboxes}
        tickets={tickets}
        filters={filters}
        canCreate={canCreate}
      />
    </div>
  );
}
