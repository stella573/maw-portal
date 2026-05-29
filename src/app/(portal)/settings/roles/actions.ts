"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/services/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/audit/log";

export interface ActionResult {
  ok: boolean;
  message: string;
}

const schema = z.object({
  roleId: z.string().uuid(),
  permissionId: z.string().uuid(),
  grant: z.enum(["true", "false"]),
});

/**
 * Schaltet ein Recht für eine Rolle an/aus. Schreibt in role_permissions –
 * die DB ist die Quelle der Wahrheit (RLS liest dieselbe Tabelle).
 *
 * Schutz:
 *  - erfordert roles.manage
 *  - die Owner-Rolle ist gesperrt (behält immer alle Rechte)
 */
export async function toggleRolePermission(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const ctx = await getCurrentUser();
    if (!ctx || !can(ctx, "roles.manage")) {
      return { ok: false, message: "Keine Berechtigung." };
    }

    const parsed = schema.safeParse({
      roleId: formData.get("roleId"),
      permissionId: formData.get("permissionId"),
      grant: formData.get("grant"),
    });
    if (!parsed.success) return { ok: false, message: "Ungültige Eingabe." };
    const { roleId, permissionId } = parsed.data;
    const grant = parsed.data.grant === "true";

    const supabase = await createClient();

    // Owner-Rolle schützen.
    const { data: role } = await supabase
      .from("roles")
      .select("key")
      .eq("id", roleId)
      .single();
    if (!role) return { ok: false, message: "Rolle nicht gefunden." };
    if (role.key === "owner") {
      return { ok: false, message: "Die Owner-Rolle ist geschützt und behält alle Rechte." };
    }

    if (grant) {
      const { error } = await supabase
        .from("role_permissions")
        .insert({ role_id: roleId, permission_id: permissionId });
      // doppelt = bereits gewährt → kein Fehler
      if (error && !/duplicate|unique/i.test(error.message)) {
        return { ok: false, message: error.message };
      }
    } else {
      const { error } = await supabase
        .from("role_permissions")
        .delete()
        .eq("role_id", roleId)
        .eq("permission_id", permissionId);
      if (error) return { ok: false, message: error.message };
    }

    await logAudit({
      action: grant ? "role.permission_granted" : "role.permission_revoked",
      entityType: "role",
      entityId: roleId,
      metadata: { permission_id: permissionId, role: role.key },
    });

    revalidatePath("/settings/roles");
    return { ok: true, message: "Gespeichert." };
  } catch (err) {
    console.error("[roles.toggleRolePermission]", err);
    return { ok: false, message: "Unerwarteter Fehler." };
  }
}
