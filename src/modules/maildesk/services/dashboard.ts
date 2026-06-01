import { createClient } from "@/lib/supabase/server";
import { getInboxMailboxes } from "./tickets";

/**
 * Kennzahlen für das Dashboard. Alle Abfragen laufen über den RLS-Client →
 * jeder User sieht nur Zahlen zu Tickets, die er auch sehen darf
 * (Postfach-Mitgliedschaft / Owner / zugewiesen).
 *
 * Die Postfach-Übersicht nutzt dieselbe Sichtbarkeit wie die Inbox:
 * NUR der Owner sieht alle Postfächer, alle anderen nur ihre zugewiesenen.
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
    inboxMailboxes,
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
    // Nur Postfächer, auf die der User Zugriff hat (Owner = alle, sonst eigene
    // Mitgliedschaften). Liefert die offenen Zahlen gleich mit.
    getInboxMailboxes(),
  ]);

  const perMailbox = inboxMailboxes.map((mb) => ({ name: mb.name, open: mb.openCount }));

  return {
    open: openRes.count ?? 0,
    pending: pendingRes.count ?? 0,
    resolvedToday: resolvedTodayRes.count ?? 0,
    unassignedOpen: unassignedRes.count ?? 0,
    assignedToMe: mineRes.count ?? 0,
    perMailbox,
  };
}
