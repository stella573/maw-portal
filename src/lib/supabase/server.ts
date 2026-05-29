import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { publicEnv } from "@/lib/env";

/**
 * Supabase-Client für Server-Komponenten, Server Actions und Route Handler.
 * Bindet die User-Session aus den Cookies → RLS läuft mit dem echten User.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // In reinen Server-Komponenten ist set nicht erlaubt – die
            // Middleware übernimmt das Session-Refresh. Bewusst ignoriert.
          }
        },
      },
    },
  );
}
