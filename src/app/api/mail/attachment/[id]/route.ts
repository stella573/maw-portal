import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/services/auth/current-user";

/**
 * Download eines Anhangs. Berechtigung: der RLS-Client lädt den
 * attachments-Datensatz – sieht ihn nur, wer das zugehörige Ticket sehen darf
 * (Postfach-Mitglied/Owner/Admin/Assignee). Erst danach erzeugt der
 * Service-Role-Client eine kurzlebige signierte Storage-URL.
 */
export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  // RLS-Client: nur sichtbare Anhänge (an Ticket-Berechtigung gekoppelt).
  const supabase = await createClient();
  const { data: attachment } = await supabase
    .from("attachments")
    .select("storage_path, file_name")
    .eq("id", id)
    .maybeSingle();

  if (!attachment) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }

  // Signierte URL (60s) über Service-Role – Bucket ist privat.
  const admin = createAdminClient();
  const { data: signed, error } = await admin.storage
    .from("mail-attachments")
    .createSignedUrl(attachment.storage_path, 60, {
      download: attachment.file_name,
    });

  if (error || !signed) {
    console.error("[attachment] signed url:", error?.message);
    return NextResponse.json({ error: "Download nicht möglich" }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
