import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/services/auth/current-user";
import { can } from "@/lib/auth/permissions";
import type { RoleKey } from "@/lib/auth/roles";

/**
 * Server-seitige Benutzerverwaltung (nur für Owner/Admin).
 *
 * Sicherheitsmodell:
 *  - JEDE Operation prüft ZUERST die Permission des aufrufenden Users.
 *  - Erst danach wird – wo nötig – der Service-Role-Client (umgeht RLS)
 *    für privilegierte Auth-Operationen verwendet.
 *  - Niemals Service-Role auf Basis ungeprüfter Eingaben.
 */

export interface ManagedRole {
  roleKey: RoleKey;
  roleName: string;
  locationId: string | null;
  locationName: string | null;
  userRoleId: string;
}

export interface ManagedUser {
  profileId: string;
  email: string;
  fullName: string | null;
  isActive: boolean;
  createdAt: string;
  roles: ManagedRole[];
  mfaEnabled: boolean;
}

export interface RoleOption {
  id: string;
  key: RoleKey;
  name: string;
}

export interface LocationOption {
  id: string;
  name: string;
}

/** Wirft, wenn der aufrufende User das Recht nicht hat. */
async function requirePermission(permission: "users.manage" | "users.read") {
  const ctx = await getCurrentUser();
  if (!ctx || !can(ctx, permission)) {
    throw new Error("FORBIDDEN");
  }
  return ctx;
}

/**
 * Listet alle Mitarbeiter inkl. Rollen. Nutzt den RLS-Client für profiles/
 * user_roles (owner/admin dürfen per Policy lesen) und den Admin-Client nur
 * für die MFA-Faktor-Übersicht (liegt im auth-Schema).
 */
export async function listUsers(): Promise<ManagedUser[]> {
  await requirePermission("users.read");
  const supabase = await createClient();

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, is_active, created_at")
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("id, profile_id, location_id, roles(key, name), locations(name)");

  // MFA-Status je User zuverlässig über die Admin-MFA-API ermitteln.
  // (Das factors-Feld aus listUsers() ist nicht verlässlich befüllt.)
  const admin = createAdminClient();
  const mfaByUser = new Map<string, boolean>();
  await Promise.all(
    (profiles ?? []).map(async (p) => {
      try {
        const { data } = await admin.auth.admin.mfa.listFactors({ userId: p.id });
        const verified = (data?.factors ?? []).filter(
          (f) => f.status === "verified",
        );
        mfaByUser.set(p.id, verified.length > 0);
      } catch {
        mfaByUser.set(p.id, false);
      }
    }),
  );

  return (profiles ?? []).map((p) => {
    const roles: ManagedRole[] = (roleRows ?? [])
      .filter((r) => r.profile_id === p.id)
      .map((r) => {
        const role = r.roles as unknown as { key: string; name: string } | null;
        const loc = r.locations as unknown as { name: string } | null;
        return {
          userRoleId: r.id,
          roleKey: (role?.key ?? "employee") as RoleKey,
          roleName: role?.name ?? "—",
          locationId: r.location_id,
          locationName: loc?.name ?? null,
        };
      });

    return {
      profileId: p.id,
      email: p.email,
      fullName: p.full_name,
      isActive: p.is_active,
      createdAt: p.created_at,
      roles,
      mfaEnabled: mfaByUser.get(p.id) ?? false,
    };
  });
}

/** Verfügbare Rollen (für Auswahl-Menüs). */
export async function listRoles(): Promise<RoleOption[]> {
  await requirePermission("users.read");
  const supabase = await createClient();
  const { data } = await supabase
    .from("roles")
    .select("id, key, name")
    .order("rank", { ascending: false });
  return (data ?? []).map((r) => ({
    id: r.id,
    key: r.key as RoleKey,
    name: r.name,
  }));
}

/** Verfügbare Standorte (für standortgebundene Rollen). */
export async function listLocations(): Promise<LocationOption[]> {
  await requirePermission("users.read");
  const supabase = await createClient();
  const { data } = await supabase
    .from("locations")
    .select("id, name")
    .eq("is_active", true)
    .order("name");
  return (data ?? []).map((l) => ({ id: l.id, name: l.name }));
}
