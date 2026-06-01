import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/services/auth/current-user";
import {
  assignSupplierManually,
  AttachmentNotFoundError,
} from "@/services/attachments/invoice-processing";

/**
 * Manuelle Lieferantenauswahl: ordnet einen GMI-Lieferanten zu (vom Nutzer
 * bestätigt) und lädt die Rechnung anschließend zu GetMyInvoices hoch.
 */
export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({
  attachmentId: z.string().uuid(),
  supplierId: z.string().min(1),
  supplierName: z.string().min(1),
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
    const job = await assignSupplierManually(
      parsed.data.attachmentId,
      parsed.data.supplierId,
      parsed.data.supplierName,
    );
    return NextResponse.json({ ok: true, job });
  } catch (err) {
    if (err instanceof AttachmentNotFoundError) {
      return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
    }
    console.error("[invoices/assign-supplier]", err);
    const message = err instanceof Error ? err.message : "Zuordnung fehlgeschlagen";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
