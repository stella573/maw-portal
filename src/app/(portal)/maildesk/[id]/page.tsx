import { notFound } from "next/navigation";
import { getTicketDetail } from "@/modules/maildesk/services/ticket-detail";
import { listReplyTemplates } from "@/modules/maildesk/services/templates";
import { getInboxMailboxes } from "@/modules/maildesk/services/tickets";
import { getCurrentUser } from "@/services/auth/current-user";
import { isOwnerOrAdmin } from "@/lib/auth/permissions";
import { TicketView } from "./ticket-view";

/**
 * Ticket-Detailansicht. RLS stellt sicher, dass nur berechtigte User (Postfach-
 * Mitglied/Owner/Admin/Assignee) das Ticket sehen – sonst 404.
 */
export default async function TicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [ticket, ctx, templates, mailboxes] = await Promise.all([
    getTicketDetail(id),
    getCurrentUser(),
    listReplyTemplates(),
    getInboxMailboxes(),
  ]);
  if (!ticket) notFound();

  const currentUser = ctx
    ? { profileId: ctx.profileId, name: ctx.fullName ?? ctx.email }
    : null;

  return (
    <TicketView
      ticket={ticket}
      showDiagnostics={isOwnerOrAdmin(ctx)}
      currentUser={currentUser}
      templates={templates}
      mailboxes={mailboxes.map((m) => ({ id: m.id, name: m.name }))}
    />
  );
}
