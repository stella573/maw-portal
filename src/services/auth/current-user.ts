import { createClient } from "@/lib/supabase/server";
import type { AuthContext } from "@/lib/auth/permissions";
import type { RoleKey } from "@/lib/auth/roles";

/**
 * Lädt den eingeloggten User inkl. seiner Rollen-Zuweisungen und baut den
 * AuthContext für Permission-Gating. Liefert null, wenn nicht eingeloggt.
 *
 * Läuft mit der User-Session → RLS schützt die Abfragen.
 */
export async function getCurrentUser(): Promise<AuthContext | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .eq("id", user.id)
    .single();
  if (!profile) return null;

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("location_id, roles(key)")
    .eq("profile_id", user.id);

  const assignments = (roleRows ?? [])
    .map((row) => {
      // roles kann je nach Join-Form Objekt oder Array sein – defensiv lesen.
      const rel = row.roles as unknown as { key: string } | { key: string }[] | null;
      const key = Array.isArray(rel) ? rel[0]?.key : rel?.key;
      if (!key) return null;
      return { roleKey: key as RoleKey, locationId: row.location_id };
    })
    .filter((a): a is { roleKey: RoleKey; locationId: string | null } => a !== null);

  return {
    profileId: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    assignments,
  };
}

/** Wirft, wenn nicht eingeloggt. Für geschützte Server-Pfade. */
export async function requireUser(): Promise<AuthContext> {
  const ctx = await getCurrentUser();
  if (!ctx) throw new Error("UNAUTHENTICATED");
  return ctx;
}
