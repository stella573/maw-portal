import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/log";

/**
 * Auth-Callback (PKCE): Supabase leitet nach dem Klick auf den Magic Link
 * hierher zurück. Wir tauschen den `code` serverseitig gegen eine Session
 * (setzt die Session-Cookies) und leiten anschließend ins Portal.
 *
 * Funktioniert für Magic Link, OAuth und E-Mail-Bestätigung gleichermaßen.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  // Whitelist: nur interne Pfade als Redirect-Ziel zulassen (offener-Redirect-Schutz).
  const rawNext = searchParams.get("next") ?? "/dashboard";
  const next = rawNext.startsWith("/") ? rawNext : "/dashboard";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  // Login protokollieren (best effort – blockiert den Flow nicht).
  await logAudit({ action: "auth.login" });

  return NextResponse.redirect(`${origin}${next}`);
}
