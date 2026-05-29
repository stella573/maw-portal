import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/log";

/**
 * Logout: beendet die Supabase-Session (löscht die Cookies) und leitet zur
 * Login-Seite. Als POST, damit kein versehentliches Ausloggen per Link/Prefetch
 * passiert.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await logAudit({ action: "auth.logout" });
    await supabase.auth.signOut();
  }

  return NextResponse.redirect(`${request.nextUrl.origin}/login`, {
    status: 303,
  });
}
