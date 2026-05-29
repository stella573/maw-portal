import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/services/auth/current-user";
import type {
  TicketStatus,
  TicketPriority,
} from "@/types/database";

/**
 * Lese-Services für die MailDesk-Inbox. Alle Abfragen laufen über den
 * RLS-Client (User-Session) → Sichtbarkeit folgt automatisch der
 * Postfach-Mitgliedschaft (siehe Migration 0007).
 */

export interface InboxMailbox {
  id: string;
  name: string;
  email: string;
  openCount: number;
}

export interface InboxTicket {
  id: string;
  reference: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  customerEmail: string | null;
  customerName: string | null;
  lastMessageAt: string | null;
  createdAt: string;
}

export interface TicketFilters {
  mailboxId?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  search?: string;
}

/**
 * Postfächer, die der eingeloggte User sehen darf, inkl. Anzahl offener
 * Tickets. RLS sorgt dafür, dass nur erlaubte Postfächer zurückkommen.
 */
export async function getInboxMailboxes(): Promise<InboxMailbox[]> {
  const supabase = await createClient();

  const { data: boxes } = await supabase
    .from("mailboxes")
    .select("id, name, email")
    .eq("is_active", true)
    .order("name");

  if (!boxes || boxes.length === 0) return [];

  // Offene Tickets je Postfach zählen.
  const result: InboxMailbox[] = [];
  await Promise.all(
    boxes.map(async (b) => {
      const { count } = await supabase
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("mailbox_id", b.id)
        .eq("status", "open");
      result.push({
        id: b.id,
        name: b.name,
        email: b.email,
        openCount: count ?? 0,
      });
    }),
  );

  // Reihenfolge stabil nach Name (Promise.all kann umsortieren).
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

/** Tickets eines Postfachs mit optionalen Filtern. */
export async function listTickets(
  filters: TicketFilters,
): Promise<InboxTicket[]> {
  const supabase = await createClient();

  let query = supabase
    .from("tickets")
    .select(
      "id, reference, subject, status, priority, last_message_at, created_at, customers(email, full_name)",
    )
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (filters.mailboxId) query = query.eq("mailbox_id", filters.mailboxId);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.search && filters.search.trim()) {
    // einfache Betreff-Suche (ILIKE); FTS-Ausbau später
    query = query.ilike("subject", `%${filters.search.trim()}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((t) => {
    const c = t.customers as unknown as {
      email: string;
      full_name: string | null;
    } | null;
    return {
      id: t.id,
      reference: t.reference,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      customerEmail: c?.email ?? null,
      customerName: c?.full_name ?? null,
      lastMessageAt: t.last_message_at,
      createdAt: t.created_at,
    };
  });
}

/** Kann der aktuelle User Tickets erstellen? (UI-Gating) */
export async function canCreateTickets(): Promise<boolean> {
  const ctx = await getCurrentUser();
  if (!ctx) return false;
  // tickets.create global ODER an irgendeinem Standort
  return ctx.assignments.length > 0;
}
