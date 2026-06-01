import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/services/auth/current-user";
import { getJobsForAttachments } from "@/services/attachments/invoice-processing";

/**
 * Aktueller Stand des Verarbeitungs-Jobs eines Anhangs (RLS-gebunden).
 * Für den „GetMyInvoices-Status aktualisieren"-Button in der UI.
 */
export const runtime = "nodejs";

const schema = z.object({ attachmentId: z.string().uuid() });

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

  const parsed = schema.safeParse({
    attachmentId: request.nextUrl.searchParams.get("attachmentId"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 422 });
  }

  // RLS-Client: getJobsForAttachments liest nur sichtbare Jobs.
  const supabase = await createClient();
  const jobs = await getJobsForAttachments(supabase, [parsed.data.attachmentId]);
  const job = jobs.get(parsed.data.attachmentId) ?? null;
  return NextResponse.json({ ok: true, job });
}
