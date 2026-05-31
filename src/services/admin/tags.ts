import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/services/auth/current-user";
import { can } from "@/lib/auth/permissions";

/**
 * Verwaltung des Tag-Katalogs. Lesen/Schreiben erfordert tags.manage
 * (RLS-Policy tags_write). Anwenden von Tags am Ticket läuft separat über
 * ticket_tags (Postfach-Mitglieder, s. Migration 0014).
 */

export interface ManagedTag {
  id: string;
  name: string;
  color: string;
  ticketCount: number;
}

async function requireManage() {
  const ctx = await getCurrentUser();
  if (!ctx || !can(ctx, "tags.manage")) throw new Error("FORBIDDEN");
  return ctx;
}

export async function listManagedTags(): Promise<ManagedTag[]> {
  await requireManage();
  const supabase = await createClient();

  const { data: tags, error } = await supabase
    .from("tags")
    .select("id, name, color")
    .order("name");
  if (error) throw new Error(error.message);

  const counts = new Map<string, number>();
  await Promise.all(
    (tags ?? []).map(async (t) => {
      const { count } = await supabase
        .from("ticket_tags")
        .select("ticket_id", { count: "exact", head: true })
        .eq("tag_id", t.id);
      counts.set(t.id, count ?? 0);
    }),
  );

  return (tags ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    color: t.color,
    ticketCount: counts.get(t.id) ?? 0,
  }));
}
