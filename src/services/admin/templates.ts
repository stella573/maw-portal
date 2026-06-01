import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/services/auth/current-user";
import { can } from "@/lib/auth/permissions";

/**
 * Verwaltung der Antwortvorlagen (Textbausteine). Verwaltung erfordert
 * templates.manage; Lesen/Verwenden ist für alle eingeloggten User möglich
 * (RLS templates_select, s. Migration 0014).
 */

export interface ManagedTemplate {
  id: string;
  name: string;
  subject: string | null;
  body: string;
}

async function requireManage() {
  const ctx = await getCurrentUser();
  if (!ctx || !can(ctx, "templates.manage")) throw new Error("FORBIDDEN");
  return ctx;
}

export async function listManagedTemplates(): Promise<ManagedTemplate[]> {
  await requireManage();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("templates")
    .select("id, name, subject, body")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    subject: t.subject,
    body: t.body,
  }));
}
