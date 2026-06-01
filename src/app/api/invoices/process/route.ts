import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/services/auth/current-user";
import {
  runInvoiceProcessing,
  AttachmentNotFoundError,
} from "@/services/attachments/invoice-processing";

/**
 * Startet (oder liest aus dem Cache) die vollständige Rechnungsverarbeitung
 * eines Anhangs: KI-Erkennung+Extraktion → Lieferanten-Matching → ggf. Upload.
 *
 * Sicherheit: Auth + RLS-Sichtbarkeitsprüfung (Anhang nur ladbar, wenn das
 * zugehörige Ticket sichtbar ist). Die KI/GMI werden NIE aus dem Browser
 * aufgerufen; alle Keys bleiben serverseitig.
 */
export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({
  attachmentId: z.string().uuid(),
  force: z.boolean().optional(),
  forceHighQuality: z.boolean().optional(),
});

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
    const job = await runInvoiceProcessing(parsed.data.attachmentId, {
      force: parsed.data.force,
      forceHighQuality: parsed.data.forceHighQuality,
    });
    return NextResponse.json({ ok: true, job });
  } catch (err) {
    if (err instanceof AttachmentNotFoundError) {
      return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
    }
    console.error("[invoices/process]", err);
    return NextResponse.json({ error: "Verarbeitung fehlgeschlagen" }, { status: 500 });
  }
}
