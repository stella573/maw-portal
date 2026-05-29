import { createClient } from "@/lib/supabase/server";
import type {
  TicketStatus,
  TicketPriority,
  MessageDirection,
} from "@/types/database";

/** Aggregat für die Ticket-Detailansicht. */
export interface TicketDetailMessage {
  id: string;
  direction: MessageDirection;
  fromEmail: string | null;
  toEmail: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  isDraft: boolean;
  createdAt: string;
  authorName: string | null;
  /** Roh-Payload des eingehenden Webhooks (nur für Diagnose, Owner/Admin). */
  raw: unknown;
}

export interface TicketDetailNote {
  id: string;
  body: string;
  authorName: string | null;
  createdAt: string;
}

export interface TicketDetail {
  id: string;
  reference: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  mailboxId: string | null;
  mailboxName: string | null;
  customerEmail: string | null;
  customerName: string | null;
  createdAt: string;
  messages: TicketDetailMessage[];
  notes: TicketDetailNote[];
}

/**
 * Lädt ein Ticket inkl. Verlauf, Notizen und Kunde. Gibt null zurück, wenn das
 * Ticket nicht existiert ODER der User es laut RLS nicht sehen darf.
 */
export async function getTicketDetail(
  ticketId: string,
): Promise<TicketDetail | null> {
  const supabase = await createClient();

  const { data: ticket } = await supabase
    .from("tickets")
    .select(
      "id, reference, subject, status, priority, mailbox_id, created_at, customers(email, full_name), mailboxes(name)",
    )
    .eq("id", ticketId)
    .maybeSingle();

  if (!ticket) return null;

  const { data: messages } = await supabase
    .from("messages")
    .select(
      "id, direction, from_email, to_email, body_text, body_html, is_draft, created_at, raw, profiles(full_name)",
    )
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });

  const { data: notes } = await supabase
    .from("notes")
    .select("id, body, created_at, profiles(full_name)")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });

  const customer = ticket.customers as unknown as {
    email: string;
    full_name: string | null;
  } | null;
  const mailbox = ticket.mailboxes as unknown as { name: string } | null;

  return {
    id: ticket.id,
    reference: ticket.reference,
    subject: ticket.subject,
    status: ticket.status,
    priority: ticket.priority,
    mailboxId: ticket.mailbox_id,
    mailboxName: mailbox?.name ?? null,
    customerEmail: customer?.email ?? null,
    customerName: customer?.full_name ?? null,
    createdAt: ticket.created_at,
    messages: (messages ?? []).map((m) => {
      const author = m.profiles as unknown as { full_name: string | null } | null;
      return {
        id: m.id,
        direction: m.direction,
        fromEmail: m.from_email,
        toEmail: m.to_email,
        bodyText: m.body_text,
        bodyHtml: m.body_html,
        isDraft: m.is_draft,
        createdAt: m.created_at,
        authorName: author?.full_name ?? null,
        raw: m.raw ?? null,
      };
    }),
    notes: (notes ?? []).map((n) => {
      const author = n.profiles as unknown as { full_name: string | null } | null;
      return {
        id: n.id,
        body: n.body,
        authorName: author?.full_name ?? null,
        createdAt: n.created_at,
      };
    }),
  };
}
