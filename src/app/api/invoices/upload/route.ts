import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/services/auth/current-user";
import {
  uploadJobToGmi,
  AttachmentNotFoundError,
} from "@/services/attachments/invoice-processing";

/**
 * Manueller (Re-)Upload einer bereits verarbeiteten Rechnung zu GetMyInvoices.
 */
export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({ attachmentId: z.string().uuid() });

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 422 });
  }

  const supabase = await createClient();
  const { data: attachment } = await supabase
    .from("attachments")
    .select("id")
    .eq("id", parsed.data.attachmentId)
    .maybeSingle();
  if (!attachment) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  try {
    const job = await uploadJobToGmi(parsed.data.attachmentId);
    return NextResponse.json({ ok: true, job });
  } catch (err) {
    if (err instanceof AttachmentNotFoundError) {
      return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
    }
    console.error("[invoices/upload]", err);
    const message = err instanceof Error ? err.message : "Upload fehlgeschlagen";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
