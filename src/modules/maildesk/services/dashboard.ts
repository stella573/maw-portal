import { createClient } from "@/lib/supabase/server";

/**
 * Kennzahlen für das Dashboard. Alle Abfragen laufen über den RLS-Client →
 * jeder User sieht nur Zahlen zu Tickets, die er auch sehen darf
 * (Postfach-Mitgliedschaft / owner-admin / zugewiesen).
 */

export interface DashboardStats {
  open: number;
  pending: number;
  resolvedToday: number;
  unassignedOpen: number;
  assignedToMe: number;
  /** Offene Tickets je Postfach (für die Übersicht). */
  perMailbox: { name: string; open: number }[];
}

export async function getDashboardStats(
  profileId: string,
): Promise<DashboardStats> {
  const supabase = await createClient();

  // Hilfsfunktion: count-only-Query (head:true lädt keine Zeilen).
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [
    openRes,
    pendingRes,
    resolvedTodayRes,
    unassignedRes,
    mineRes,
    mailboxes,
  ] = await Promise.all([
    supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("status", "resolved")
      .gte("updated_at", startOfToday.toISOString()),
    supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("status", "open")
      .is("assignee_id", null),
    supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("assignee_id", profileId)
      .in("status", ["open", "pending"]),
    supabase.from("mailboxes").select("id, name").eq("is_active", true).order("name"),
  ]);

  // Offene Tickets je sichtbarem Postfach.
  const perMailbox: { name: string; open: number }[] = [];
  for (const mb of mailboxes.data ?? []) {
    const { count } = await supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("mailbox_id", mb.id)
      .eq("status", "open");
    perMailbox.push({ name: mb.name, open: count ?? 0 });
  }

  return {
    open: openRes.count ?? 0,
    pending: pendingRes.count ?? 0,
    resolvedToday: resolvedTodayRes.count ?? 0,
    unassignedOpen: unassignedRes.count ?? 0,
    assignedToMe: mineRes.count ?? 0,
    perMailbox,
  };
}
