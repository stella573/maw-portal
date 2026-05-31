import { notFound } from "next/navigation";
import { getTicketDetail } from "@/modules/maildesk/services/ticket-detail";
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
  const [ticket, ctx] = await Promise.all([
    getTicketDetail(id),
    getCurrentUser(),
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
    />
  );
}
