"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/services/auth/current-user";
import { can, isOwnerOrAdmin } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/audit/log";
import { syncFromPersonio } from "@/services/admin/personio";
import { getResend, getFromEmail } from "@/lib/resend/client";
import { renderWelcomeEmail } from "@/lib/resend/email-template";
import { EMAIL_SENDER_BRAND } from "@/config/app";
import { publicEnv } from "@/lib/env";

export interface ActionResult {
  ok: boolean;
  message: string;
}

// ----------------------------------------------------------------------------
// Manueller Sync aus Personio (Button)
// ----------------------------------------------------------------------------
export async function runPersonioSync(): Promise<ActionResult> {
  try {
    const ctx = await getCurrentUser();
    if (!ctx || !can(ctx, "employees.manage")) {
      return { ok: false, message: "Keine Berechtigung." };
    }
    const r = await syncFromPersonio();
    await logAudit({
      action: "user.updated",
      entityType: "personio_sync",
      metadata: { ...r },
    });
    revalidatePath("/employees");
    return {
      ok: true,
      message: `Synchronisiert: ${r.total} Mitarbeiter (${r.active} aktiv, ${r.inactive} inaktiv). ` +
        `${r.deactivatedAccounts} Konto/Konten gesperrt, ${r.reactivatedAccounts} entsperrt.`,
    };
  } catch (err) {
    console.error("[employees.runPersonioSync]", err);
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Sync fehlgeschlagen.",
    };
  }
}

// ----------------------------------------------------------------------------
// Portal-Zugang für einen Personio-Mitarbeiter anlegen
//   Admin legt an + Initialpasswort (Pflicht-Änderung beim 1. Login). Nur für
//   in Personio AKTIVE Mitarbeiter mit E-Mail.
// ----------------------------------------------------------------------------
const accessSchema = z.object({
  personioId: z.coerce.number().int(),
  password: z.string().min(10, "Initialpasswort muss mindestens 10 Zeichen haben."),
  roleId: z.string().uuid("Rolle wählen."),
  locationId: z.string().uuid().optional().or(z.literal("")),
});

export async function createPortalAccess(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const ctx = await getCurrentUser();
    if (!ctx || !can(ctx, "users.manage")) {
      return { ok: false, message: "Keine Berechtigung." };
    }

    const parsed = accessSchema.safeParse({
      personioId: formData.get("personioId"),
      password: formData.get("password"),
      roleId: formData.get("roleId"),
      locationId: formData.get("locationId") ?? "",
    });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
    }
    const input = parsed.data;

    const supabase = await createClient();

    // Personio-Mitarbeiter laden (RLS employees.read genügt zum Lesen).
    const { data: emp } = await supabase
      .from("personio_employees")
      .select("personio_id, email, first_name, last_name, status, profile_id")
      .eq("personio_id", input.personioId)
      .maybeSingle();
    if (!emp) return { ok: false, message: "Mitarbeiter nicht gefunden." };
    if (emp.profile_id) return { ok: false, message: "Es existiert bereits ein Zugang." };
    if (!emp.email) return { ok: false, message: "Mitarbeiter hat keine E-Mail in Personio." };
    if (emp.status !== "active") {
      return { ok: false, message: "Nur für in Personio aktive Mitarbeiter möglich." };
    }

    // Rolle prüfen (Owner nur durch Owner/Admin).
    const { data: role } = await supabase
      .from("roles")
      .select("id, key")
      .eq("id", input.roleId)
      .single();
    if (!role) return { ok: false, message: "Rolle nicht gefunden." };
    if (role.key === "owner" && !isOwnerOrAdmin(ctx)) {
      return { ok: false, message: "Nur Owner/Admin dürfen die Owner-Rolle vergeben." };
    }

    const fullName = [emp.first_name, emp.last_name].filter(Boolean).join(" ").trim() || emp.email;

    // Auth-User anlegen (Service-Role, E-Mail vorbestätigt, Pflicht-Passwortwechsel).
    const admin = createAdminClient();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: emp.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: fullName, must_change_password: true },
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

    await admin
      .from("profiles")
      .upsert({ id: newUserId, email: emp.email, full_name: fullName }, { onConflict: "id" });

    const { error: roleErr } = await admin.from("user_roles").insert({
      profile_id: newUserId,
      role_id: input.roleId,
      location_id: input.locationId ? input.locationId : null,
    });
    if (roleErr) {
      return { ok: false, message: `Zugang angelegt, Rolle fehlgeschlagen: ${roleErr.message}` };
    }

    // Verknüpfung im Verzeichnis setzen.
    await admin
      .from("personio_employees")
      .update({ profile_id: newUserId })
      .eq("personio_id", input.personioId);

    // Willkommens-Mail (MAW-Design) mit Zugangsdaten – best effort: ein
    // Fehler beim Versand bricht die Konto-Erstellung nicht ab.
    let mailSent = false;
    try {
      const loginUrl = `${publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/login`;
      const html = renderWelcomeEmail({
        name: fullName,
        email: emp.email,
        password: input.password,
        loginUrl,
      });
      await getResend().emails.send({
        from: `${EMAIL_SENDER_BRAND} <${getFromEmail()}>`,
        to: emp.email,
        subject: "Dein Zugang zum MAW Mitarbeiter-HUB",
        html,
        text:
          `Hallo ${fullName},\n\nfür dich wurde ein Zugang zum MAW Mitarbeiter-HUB erstellt.\n` +
          `Kennung: ${emp.email}\nInitialpasswort: ${input.password}\n\nAnmelden: ${loginUrl}\n\n` +
          `Bitte ändere dein Passwort bei der ersten Anmeldung und richte 2FA ein.`,
      });
      mailSent = true;
    } catch (mailErr) {
      console.error("[employees.createPortalAccess] Willkommens-Mail:", mailErr);
    }

    await logAudit({
      action: "user.created",
      entityType: "profile",
      entityId: newUserId,
      metadata: { from_personio: input.personioId, email: emp.email, role: role.key, welcome_mail: mailSent },
    });

    revalidatePath("/employees");
    return {
      ok: true,
      message: mailSent
        ? `Zugang für ${emp.email} angelegt – Willkommens-Mail verschickt.`
        : `Zugang für ${emp.email} angelegt. Hinweis: Willkommens-Mail konnte nicht versendet werden (Zugangsdaten bitte manuell mitteilen).`,
    };
  } catch (err) {
    console.error("[employees.createPortalAccess]", err);
    return { ok: false, message: "Unerwarteter Fehler." };
  }
}
