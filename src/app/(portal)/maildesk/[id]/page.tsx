import { notFound } from "next/navigation";
import { getTicketDetail } from "@/modules/maildesk/services/ticket-detail";
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
  const ticket = await getTicketDetail(id);
  if (!ticket) notFound();

  return <TicketView ticket={ticket} />;
}
