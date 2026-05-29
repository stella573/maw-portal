import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { publicEnv, getServerEnv } from "@/lib/env";

/**
 * Service-Role-Client: UMGEHT RLS.
 *
 * ⚠️ Nur in klar abgegrenzten, geprüften Server-Pfaden verwenden
 * (z. B. Resend-Inbound-Webhook, System-Jobs). Niemals auf Basis von
 * ungeprüftem User-Input ausführen. `server-only` verhindert den Import
 * im Client-Bundle.
 */
export function createAdminClient() {
  const env = getServerEnv();
  return createSupabaseClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}
