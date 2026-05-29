"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/services/auth/current-user";
import { can, isOwnerOrAdmin } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/audit/log";

export interface ActionResult {
  ok: boolean;
  message: string;
}

/** Permission-Guard für alle verwaltenden Aktionen. */
async function guard() {
  const ctx = await getCurrentUser();
  if (!ctx || !can(ctx, "users.manage")) {
    throw new Error("FORBIDDEN");
  }
  return ctx;
}

// ----------------------------------------------------------------------------
// Mitarbeiter anlegen
// ----------------------------------------------------------------------------
const createSchema = z.object({
  email: z.string().email("Ungültige E-Mail-Adresse."),
  fullName: z.string().trim().min(1, "Name ist erforderlich."),
  password: z
    .string()
    .min(10, "Initialpasswort muss mindestens 10 Zeichen haben."),
  roleId: z.string().uuid("Rolle wählen."),
  locationId: z.string().uuid().optional().or(z.literal("")),
});

export async function createEmployee(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actor = await guard();

    const parsed = createSchema.safeParse({
      email: formData.get("email"),
      fullName: formData.get("fullName"),
      password: formData.get("password"),
      roleId: formData.get("roleId"),
      locationId: formData.get("locationId") ?? "",
    });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
    }
    const input = parsed.data;

    // Rolle laden, um Reichweite zu prüfen (nur owner/admin dürfen globale
    // bzw. owner-Rollen vergeben).
    const supabase = await createClient();
    const { data: role } = await supabase
      .from("roles")
      .select("id, key")
      .eq("id", input.roleId)
      .single();
    if (!role) return { ok: false, message: "Rolle nicht gefunden." };

    if (role.key === "owner" && !isOwnerOrAdmin(actor)) {
      return { ok: false, message: "Nur Owner/Admin dürfen die Owner-Rolle vergeben." };
    }

    // User anlegen (Service-Role, E-Mail vorbestätigt → kein Mailversand).
    const admin = createAdminClient();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: input.fullName },
    });
    if (createErr || !created.user) {
      return {
        ok: false,
        message: /already/i.test(createErr?.message ?? "")
          ? "Diese E-Mail ist bereits registriert."
          : createErr?.message ?? "Anlegen fehlgeschlagen.",
      };
    }

    const newUserId = created.user.id;

    // Profil sicherstellen (Trigger legt es i.d.R. an – defensiv upserten).
    await admin.from("profiles").upsert(
      { id: newUserId, email: input.email, full_name: input.fullName },
      { onConflict: "id" },
    );

    // Rolle zuweisen (Service-Role, da der neue User noch keine Session hat).
    const { error: roleErr } = await admin.from("user_roles").insert({
      profile_id: newUserId,
      role_id: input.roleId,
      location_id: input.locationId ? input.locationId : null,
    });
    if (roleErr) {
      return { ok: false, message: `User angelegt, Rolle fehlgeschlagen: ${roleErr.message}` };
    }

    await logAudit({
      action: "user.created",
      entityType: "profile",
      entityId: newUserId,
      locationId: input.locationId ? input.locationId : null,
      metadata: { created_user: input.email, role: role.key },
    });

    revalidatePath("/users");
    return { ok: true, message: `${input.email} wurde angelegt.` };
  } catch (err) {
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return { ok: false, message: "Keine Berechtigung." };
    }
    console.error("[users.createEmployee]", err);
    return { ok: false, message: "Unerwarteter Fehler." };
  }
}

// ----------------------------------------------------------------------------
// Rolle zuweisen
// ----------------------------------------------------------------------------
const assignSchema = z.object({
  profileId: z.string().uuid(),
  roleId: z.string().uuid(),
  locationId: z.string().uuid().optional().or(z.literal("")),
});

export async function assignRole(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actor = await guard();
    const parsed = assignSchema.safeParse({
      profileId: formData.get("profileId"),
      roleId: formData.get("roleId"),
      locationId: formData.get("locationId") ?? "",
    });
    if (!parsed.success) return { ok: false, message: "Ungültige Eingabe." };
    const input = parsed.data;

    const supabase = await createClient();
    const { data: role } = await supabase
      .from("roles")
      .select("id, key")
      .eq("id", input.roleId)
      .single();
    if (!role) return { ok: false, message: "Rolle nicht gefunden." };
    if (role.key === "owner" && !isOwnerOrAdmin(actor)) {
      return { ok: false, message: "Nur Owner/Admin dürfen die Owner-Rolle vergeben." };
    }

    // user_roles über RLS-Client (roles.manage-Policy greift); Owner/Admin ok.
    const { error } = await supabase.from("user_roles").insert({
      profile_id: input.profileId,
      role_id: input.roleId,
      location_id: input.locationId ? input.locationId : null,
    });
    if (error) {
      return {
        ok: false,
        message: /duplicate|unique/i.test(error.message)
          ? "Diese Rolle ist dem Mitarbeiter bereits zugewiesen."
          : error.message,
      };
    }

    await logAudit({
      action: "role.assigned",
      entityType: "profile",
      entityId: input.profileId,
      locationId: input.locationId ? input.locationId : null,
      metadata: { role: role.key },
    });

    revalidatePath("/users");
    return { ok: true, message: "Rolle zugewiesen." };
  } catch (err) {
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return { ok: false, message: "Keine Berechtigung." };
    }
    console.error("[users.assignRole]", err);
    return { ok: false, message: "Unerwarteter Fehler." };
  }
}

// ----------------------------------------------------------------------------
// Rolle entziehen
// ----------------------------------------------------------------------------
export async function revokeRole(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actor = await guard();
    const userRoleId = z.string().uuid().safeParse(formData.get("userRoleId"));
    if (!userRoleId.success) return { ok: false, message: "Ungültige Eingabe." };

    const supabase = await createClient();

    // Zu entziehende Zuweisung laden (für Owner-Schutz + Audit).
    const { data: target } = await supabase
      .from("user_roles")
      .select("profile_id, location_id, roles(key)")
      .eq("id", userRoleId.data)
      .single();
    if (!target) return { ok: false, message: "Zuweisung nicht gefunden." };

    const targetRoleKey =
      (target.roles as unknown as { key: string } | null)?.key ?? "";
    if (targetRoleKey === "owner" && !isOwnerOrAdmin(actor)) {
      return { ok: false, message: "Nur Owner/Admin dürfen Owner-Rollen entziehen." };
    }

    // Sich selbst nicht die letzte Owner-Rolle entziehen (Aussperr-Schutz).
    if (targetRoleKey === "owner") {
      const { count } = await supabase
        .from("user_roles")
        .select("id, roles!inner(key)", { count: "exact", head: true })
        .eq("roles.key", "owner");
      if ((count ?? 0) <= 1 && target.profile_id === actor.profileId) {
        return { ok: false, message: "Der letzte Owner kann sich nicht selbst entfernen." };
      }
    }

    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("id", userRoleId.data);
    if (error) return { ok: false, message: error.message };

    await logAudit({
      action: "role.revoked",
      entityType: "profile",
      entityId: target.profile_id,
      locationId: target.location_id,
      metadata: { role: targetRoleKey },
    });

    revalidatePath("/users");
    return { ok: true, message: "Rolle entzogen." };
  } catch (err) {
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return { ok: false, message: "Keine Berechtigung." };
    }
    console.error("[users.revokeRole]", err);
    return { ok: false, message: "Unerwarteter Fehler." };
  }
}

// ----------------------------------------------------------------------------
// Mitarbeiter aktivieren / deaktivieren
// ----------------------------------------------------------------------------
export async function setActive(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actor = await guard();
    const profileId = z.string().uuid().safeParse(formData.get("profileId"));
    const active = formData.get("active") === "true";
    if (!profileId.success) return { ok: false, message: "Ungültige Eingabe." };

    if (profileId.data === actor.profileId && !active) {
      return { ok: false, message: "Du kannst dich nicht selbst deaktivieren." };
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ is_active: active })
      .eq("id", profileId.data);
    if (error) return { ok: false, message: error.message };

    await logAudit({
      action: "user.updated",
      entityType: "profile",
      entityId: profileId.data,
      metadata: { is_active: active },
    });

    revalidatePath("/users");
    return { ok: true, message: active ? "Mitarbeiter aktiviert." : "Mitarbeiter deaktiviert." };
  } catch (err) {
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return { ok: false, message: "Keine Berechtigung." };
    }
    console.error("[users.setActive]", err);
    return { ok: false, message: "Unerwarteter Fehler." };
  }
}
