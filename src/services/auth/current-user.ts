import { createClient } from "@/lib/supabase/server";
import type { AuthContext } from "@/lib/auth/permissions";
import type { RoleKey, Permission } from "@/lib/auth/roles";

/**
 * Lädt die aktuelle Rollen-→-Rechte-Matrix aus der DB (role_permissions).
 * Wird für dynamisches UI-Gating verwendet; die DB ist die Quelle der Wahrheit
 * (RLS-Policies lesen dieselbe Tabelle). Fehlerhafte/leere Antwort → undefined,
 * dann greift der statische Fallback in can().
 */
async function loadRolePermissions(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Partial<Record<RoleKey, Permission[]>> | undefined> {
  const { data, error } = await supabase
    .from("role_permissions")
    .select("roles(key), permissions(key)");
  if (error || !data) return undefined;

  const map: Partial<Record<RoleKey, Permission[]>> = {};
  for (const row of data) {
    const role = row.roles as unknown as { key: string } | null;
    const perm = row.permissions as unknown as { key: string } | null;
    if (!role?.key || !perm?.key) continue;
    const rk = role.key as RoleKey;
    (map[rk] ??= []).push(perm.key as Permission);
  }
  return Object.keys(map).length > 0 ? map : undefined;
}

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

  // Profil, Rollen-Zuweisungen und Rechte-Matrix parallel laden
  // (vorher sequentiell → spürbarer Lag bei jeder Navigation, da im Layout).
  const [profileRes, roleRowsRes, rolePermissions] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name").eq("id", user.id).single(),
    supabase.from("user_roles").select("location_id, roles(key)").eq("profile_id", user.id),
    loadRolePermissions(supabase),
  ]);

  const profile = profileRes.data;
  if (!profile) return null;
  const roleRows = roleRowsRes.data;

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
    rolePermissions,
  };
}

/** Wirft, wenn nicht eingeloggt. Für geschützte Server-Pfade. */
export async function requireUser(): Promise<AuthContext> {
  const ctx = await getCurrentUser();
  if (!ctx) throw new Error("UNAUTHENTICATED");
  return ctx;
}
