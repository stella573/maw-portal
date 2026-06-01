import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/services/auth/current-user";
import {
  runAttachmentAnalysis,
  AttachmentNotFoundError,
} from "@/services/attachments/invoice-analysis";

/**
 * Startet (oder liest aus dem Cache) die KI-Analyse eines Anhangs und gibt das
 * Ergebnis zurück.
 *
 * Sicherheit:
 *  - Auth erforderlich.
 *  - Sichtbarkeit wird über den RLS-Client geprüft: der Anhang ist nur ladbar,
 *    wenn der User das zugehörige Ticket sehen darf. Erst danach läuft die
 *    serverseitige Analyse (Service-Role) – die KI wird NIE aus dem Browser
 *    aufgerufen, der API-Key bleibt serverseitig.
 *  - Fehler der KI werden sauber gespeichert; der Endpunkt bleibt 200, damit die
 *    App weiterläuft.
 */
export const runtime = "nodejs";
// KI-Aufruf (inkl. PDF/Bild) kann einige Sekunden dauern.
export const maxDuration = 60;

const schema = z.object({
  attachmentId: z.string().uuid(),
  force: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 422 });
  }

  // RLS-Client: Anhang nur sichtbar, wer das zugehörige Ticket sehen darf.
  const supabase = await createClient();
  const { data: attachment } = await supabase
    .from("attachments")
    .select("id")
    .eq("id", parsed.data.attachmentId)
    .maybeSingle();

  if (!attachment) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }

  try {
    const analysis = await runAttachmentAnalysis(parsed.data.attachmentId, {
      force: parsed.data.force,
    });
    return NextResponse.json({ ok: true, analysis });
  } catch (err) {
    if (err instanceof AttachmentNotFoundError) {
      return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
    }
    console.error("[attachments/analyze]", err);
    return NextResponse.json(
      { error: "Analyse fehlgeschlagen" },
      { status: 500 },
    );
  }
}
