import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/services/auth/current-user";
import { listSupplierCandidates } from "@/services/attachments/invoice-processing";

/**
 * Liefert GetMyInvoices-Lieferantenkandidaten (mit Match-Score) für die
 * manuelle Auswahl zu einem Anhang. Nur serverseitig (GMI-API-Key bleibt
 * geschützt); Zugriff an Ticket-Sichtbarkeit gekoppelt.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({ attachmentId: z.string().uuid() });

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

  const attachmentId = request.nextUrl.searchParams.get("attachmentId");
  const parsed = schema.safeParse({ attachmentId });
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
    const { configured, candidates } = await listSupplierCandidates(parsed.data.attachmentId);
    return NextResponse.json({ ok: true, configured, candidates });
  } catch (err) {
    console.error("[invoices/companies]", err);
    return NextResponse.json({ error: "Lieferanten konnten nicht geladen werden" }, { status: 500 });
  }
}
