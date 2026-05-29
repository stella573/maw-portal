import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/log";
import type { AuditAction } from "@/types/database";

/**
 * Protokolliert MFA-Ereignisse vom Client (Enrollment, Verifikation,
 * fehlgeschlagene Challenge). Bewusst serverseitig, damit der Actor aus der
 * Session (auth.uid) kommt und nicht fälschbar ist.
 */
export const runtime = "nodejs";

const schema = z.object({
  event: z.enum(["enrolled", "verified", "challenge_failed"]),
});

const EVENT_TO_ACTION: Record<
  z.infer<typeof schema>["event"],
  AuditAction
> = {
  enrolled: "mfa.enrolled",
  verified: "mfa.verified",
  challenge_failed: "mfa.challenge_failed",
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 422 });
  }

  await logAudit({ action: EVENT_TO_ACTION[parsed.data.event] });

  return NextResponse.json({ ok: true });
}
