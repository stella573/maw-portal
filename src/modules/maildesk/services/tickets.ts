import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/services/auth/current-user";
import type {
  TicketStatus,
  TicketPriority,
  MessageDirection,
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
  /** Kurzvorschau der letzten Nachricht. */
  preview: string | null;
  /** true, wenn die letzte Nachricht vom Kunden kam (noch unbeantwortet). */
  needsReply: boolean;
  /** Zugeordnete Tags (für Chips in der Liste). */
  tags: { id: string; name: string; color: string }[];
}

export interface TicketFilters {
  mailboxId?: string;
  /** Einzelner Status (z. B. nur „resolved"). */
  status?: TicketStatus;
  /** Mehrere Status (z. B. Aktiv-Tab = ["open","pending"]). Hat Vorrang vor status. */
  statuses?: TicketStatus[];
  priority?: TicketPriority;
  search?: string;
  /** Nur Tickets mit diesem Tag. */
  tagId?: string;
}

/**
 * Postfächer für die Inbox. NUR der Owner sieht alle Postfächer; alle anderen
 * (inkl. Admin) sehen ausschließlich ihre zugewiesenen (Postfach-Mitgliedschaft).
 */
export async function getInboxMailboxes(): Promise<InboxMailbox[]> {
  const supabase = await createClient();
  const ctx = await getCurrentUser();
  if (!ctx) return [];
  const isOwner = ctx.assignments.some((a) => a.roleKey === "owner");

  let boxesQuery = supabase
    .from("mailboxes")
    .select("id, name, email")
    .eq("is_active", true)
    .order("name");

  if (!isOwner) {
    const { data: memberships } = await supabase
      .from("mailbox_members")
      .select("mailbox_id")
      .eq("profile_id", ctx.profileId);
    const ids = (memberships ?? []).map((m) => m.mailbox_id);
    if (ids.length === 0) return [];
    boxesQuery = boxesQuery.in("id", ids);
  }

  const { data: boxes } = await boxesQuery;

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

  // Tag-Filter: zuerst die Ticket-IDs zum Tag holen, dann einschränken.
  let tagTicketIds: string[] | null = null;
  if (filters.tagId) {
    const { data: links } = await supabase
      .from("ticket_tags")
      .select("ticket_id")
      .eq("tag_id", filters.tagId);
    tagTicketIds = (links ?? []).map((l) => l.ticket_id);
    if (tagTicketIds.length === 0) return [];
  }

  let query = supabase
    .from("tickets")
    .select(
      "id, reference, subject, status, priority, last_message_at, created_at, customers(email, full_name)",
    )
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (tagTicketIds) query = query.in("id", tagTicketIds);
  if (filters.mailboxId) query = query.eq("mailbox_id", filters.mailboxId);
  if (filters.statuses && filters.statuses.length > 0) {
    query = query.in("status", filters.statuses);
  } else if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.search && filters.search.trim()) {
    // einfache Betreff-Suche (ILIKE); FTS-Ausbau später
    query = query.ilike("subject", `%${filters.search.trim()}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const ticketIds = (data ?? []).map((t) => t.id);

  // Letzte Nachricht je Ticket für Vorschau + "unbeantwortet"-Markierung.
  // DB-seitig (DISTINCT ON) → nur EINE bereits gekürzte/HTML-bereinigte Zeile
  // je Ticket statt aller (großen) Nachrichten-Bodies. Deutlich schneller,
  // besonders im "Alle"-Tab.
  const latestByTicket = new Map<
    string,
    { direction: MessageDirection; preview: string | null }
  >();
  const tagsByTicket = new Map<string, { id: string; name: string; color: string }[]>();
  if (ticketIds.length > 0) {
    const [{ data: latest }, { data: tagLinks }] = await Promise.all([
      supabase.rpc("ticket_last_messages", { p_ticket_ids: ticketIds }),
      supabase
        .from("ticket_tags")
        .select("ticket_id, tags(id, name, color)")
        .in("ticket_id", ticketIds),
    ]);
    for (const row of latest ?? []) {
      latestByTicket.set(row.ticket_id, {
        direction: row.direction,
        preview: row.preview,
      });
    }
    for (const link of tagLinks ?? []) {
      const tag = link.tags as unknown as { id: string; name: string; color: string } | null;
      if (!tag) continue;
      const list = tagsByTicket.get(link.ticket_id) ?? [];
      list.push(tag);
      tagsByTicket.set(link.ticket_id, list);
    }
  }

  return (data ?? []).map((t) => {
    const c = t.customers as unknown as {
      email: string;
      full_name: string | null;
    } | null;
    const latest = latestByTicket.get(t.id);
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
      preview: latest?.preview ? truncate(latest.preview, 120) : null,
      // unbeantwortet = letzte Nachricht kam vom Kunden (inbound)
      needsReply: latest ? latest.direction === "inbound" : false,
      tags: tagsByTicket.get(t.id) ?? [],
    };
  });
}

function truncate(s: string, n: number): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > n ? `${clean.slice(0, n)}…` : clean;
}

/** Tag-Katalog für den Inbox-Filter (alle eingeloggten dürfen lesen). */
export async function listInboxTags(): Promise<
  { id: string; name: string; color: string }[]
> {
  const supabase = await createClient();
  const { data } = await supabase.from("tags").select("id, name, color").order("name");
  return data ?? [];
}

/** Kann der aktuelle User Tickets erstellen? (UI-Gating) */
export async function canCreateTickets(): Promise<boolean> {
  const ctx = await getCurrentUser();
  if (!ctx) return false;
  // tickets.create global ODER an irgendeinem Standort
  return ctx.assignments.length > 0;
}
