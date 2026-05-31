import { createClient } from "@/lib/supabase/server";

/** Antwortvorlage für den Composer (Textbaustein). */
export interface ReplyTemplate {
  id: string;
  name: string;
  body: string;
}

/**
 * Antwortvorlagen für den Antwort-Editor. Lesen ist für alle eingeloggten
 * User erlaubt (RLS templates_select). Ohne Treffer → leere Liste.
 */
export async function listReplyTemplates(): Promise<ReplyTemplate[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("templates")
    .select("id, name, body")
    .order("name");
  return (data ?? []).map((t) => ({ id: t.id, name: t.name, body: t.body }));
}
