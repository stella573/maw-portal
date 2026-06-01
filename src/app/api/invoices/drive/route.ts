import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/services/auth/current-user";
import {
  storeAttachmentInGoogleDrive,
  getDriveRecordsForAttachments,
} from "@/services/attachments/google-drive-storage";

/**
 * Google-Drive-Ablage eines Anhangs starten/wiederholen (POST) bzw. den
 * aktuellen Stand abrufen (GET). Auth + RLS-Sichtbarkeit; alle Google-Zugriffe
 * laufen serverseitig.
 */
export const runtime = "nodejs";
export const maxDuration = 120;

async function assertVisible(attachmentId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("attachments")
    .select("id")
    .eq("id", attachmentId)
    .maybeSingle();
  return !!data;
}

const postSchema = z.object({
  attachmentId: z.string().uuid(),
  force: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 422 });

  if (!(await assertVisible(parsed.data.attachmentId))) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }

  try {
    const record = await storeAttachmentInGoogleDrive(parsed.data.attachmentId, {
      force: parsed.data.force,
    });
    return NextResponse.json({ ok: true, record });
  } catch (err) {
    console.error("[invoices/drive:post]", err);
    return NextResponse.json({ error: "Drive-Ablage fehlgeschlagen" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

  const attachmentId = request.nextUrl.searchParams.get("attachmentId");
  const parsed = z.string().uuid().safeParse(attachmentId);
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 422 });

  // RLS-Client: Datensatz nur sichtbar, wenn das Ticket sichtbar ist.
  const supabase = await createClient();
  const records = await getDriveRecordsForAttachments(supabase, [parsed.data]);
  return NextResponse.json({ ok: true, record: records.get(parsed.data) ?? null });
}
