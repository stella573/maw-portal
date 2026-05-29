import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/log";

/** Protokolliert eine (erzwungene) Passwortänderung. Actor aus der Session. */
export const runtime = "nodejs";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  await logAudit({ action: "auth.password_changed" });
  return NextResponse.json({ ok: true });
}
