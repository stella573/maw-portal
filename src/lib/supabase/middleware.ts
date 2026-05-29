import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { publicEnv } from "@/lib/env";
import { getMfaStatus } from "@/lib/auth/mfa";

/** Öffentliche Routen, die ohne Session erreichbar sind. */
const PUBLIC_PATHS = ["/login", "/auth"];
/** Pfad-Präfixe, die von der Auth-Middleware ausgenommen sind. */
const BYPASS_PREFIXES = ["/api/webhooks", "/_next", "/favicon"];
/** Pfad für die 2FA-Einrichtung/-Abfrage (immer erreichbar, solange eingeloggt). */
const MFA_PATH = "/security/2fa";

/**
 * Aktualisiert die Supabase-Session (Cookie-Refresh), schützt Routen und
 * erzwingt 2FA (AAL2) für alle authentifizierten Bereiche.
 * Wird aus src/middleware.ts aufgerufen.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[],
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // WICHTIG: getUser() validiert das Token serverseitig (nicht nur getSession()).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isBypass = BYPASS_PREFIXES.some((p) => pathname.startsWith(p));
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  // Nicht eingeloggt → Login (außer öffentliche/ausgenommene Pfade).
  if (!user && !isPublic && !isBypass) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  if (user && !isBypass) {
    // 2FA-Status der aktuellen Session prüfen (AAL).
    const mfa = await getMfaStatus(supabase);
    const onMfaPath = pathname.startsWith(MFA_PATH);

    // Solange 2FA nicht voll erfüllt ist: ALLES auf die 2FA-Seite leiten
    // (auch /login), damit kein geschützter Bereich mit aal1 erreichbar ist.
    if (mfa.state !== "ok" && !onMfaPath) {
      const url = request.nextUrl.clone();
      url.pathname = MFA_PATH;
      url.search = "";
      return NextResponse.redirect(url);
    }

    // 2FA erfüllt → Login- und 2FA-Seite überspringen, ins Portal.
    if (mfa.state === "ok" && (pathname === "/login" || onMfaPath)) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return response;
}
