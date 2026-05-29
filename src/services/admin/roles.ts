import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/services/auth/current-user";
import { can } from "@/lib/auth/permissions";
import type { RoleKey, Permission } from "@/lib/auth/roles";

/**
 * Liest Rollen, Rechte und die aktuelle Zuordnung aus der DB für die
 * (editierbare) Rechteübersicht. Erfordert roles.manage.
 */

export interface RoleRow {
  id: string;
  key: RoleKey;
  name: string;
}

export interface PermissionRow {
  id: string;
  key: Permission;
  description: string | null;
}

export interface RolesMatrix {
  roles: RoleRow[];
  permissions: PermissionRow[];
  /** Set-artige Map: `${roleId}:${permissionId}` → true, wenn gewährt. */
  granted: Record<string, boolean>;
}

export async function getRolesMatrix(): Promise<RolesMatrix> {
  const ctx = await getCurrentUser();
  if (!ctx || !can(ctx, "roles.manage")) {
    throw new Error("FORBIDDEN");
  }
  const supabase = await createClient();

  const [{ data: roles }, { data: perms }, { data: rp }] = await Promise.all([
    supabase.from("roles").select("id, key, name").order("rank", { ascending: false }),
    supabase.from("permissions").select("id, key, description").order("key"),
    supabase.from("role_permissions").select("role_id, permission_id"),
  ]);

  const granted: Record<string, boolean> = {};
  for (const row of rp ?? []) {
    granted[`${row.role_id}:${row.permission_id}`] = true;
  }

  return {
    roles: (roles ?? []).map((r) => ({
      id: r.id,
      key: r.key as RoleKey,
      name: r.name,
    })),
    permissions: (perms ?? []).map((p) => ({
      id: p.id,
      key: p.key as Permission,
      description: p.description,
    })),
    granted,
  };
}
