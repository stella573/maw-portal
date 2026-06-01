import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/services/auth/current-user";
import { resortAttachmentInGoogleDrive } from "@/services/attachments/google-drive-storage";

/**
 * Sortiert eine bereits in Google Drive abgelegte Datei neu ein (verschiebt/
 * benennt sie anhand des aktuell berechneten Zielpfads).
 */
export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({ attachmentId: z.string().uuid() });

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 422 });

  const supabase = await createClient();
  const { data: attachment } = await supabase
    .from("attachments")
    .select("id")
    .eq("id", parsed.data.attachmentId)
    .maybeSingle();
  if (!attachment) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  try {
    const record = await resortAttachmentInGoogleDrive(parsed.data.attachmentId);
    return NextResponse.json({ ok: true, record });
  } catch (err) {
    console.error("[invoices/drive/resort]", err);
    return NextResponse.json({ error: "Neu einsortieren fehlgeschlagen" }, { status: 500 });
  }
}
