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

async function guard() {
  const ctx = await getCurrentUser();
  if (!ctx || !can(ctx, "mailboxes.manage")) {
    throw new Error("FORBIDDEN");
  }
  return ctx;
}

function forbidden(err: unknown): ActionResult | null {
  if (err instanceof Error && err.message === "FORBIDDEN") {
    return { ok: false, message: "Keine Berechtigung." };
  }
  return null;
}

// ----------------------------------------------------------------------------
// Postfach anlegen
// ----------------------------------------------------------------------------
const createSchema = z.object({
  name: z.string().trim().min(1, "Name ist erforderlich."),
  email: z.string().email("Ungültige E-Mail-Adresse."),
  locationId: z.string().uuid().optional().or(z.literal("")),
});

export async function createMailbox(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await guard();
    const parsed = createSchema.safeParse({
      name: formData.get("name"),
      email: formData.get("email"),
      locationId: formData.get("locationId") ?? "",
    });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
    }
    const input = parsed.data;

    const supabase = await createClient();
    const { data: box, error } = await supabase
      .from("mailboxes")
      .insert({
        name: input.name,
        email: input.email,
        location_id: input.locationId ? input.locationId : null,
      })
      .select("id")
      .single();

    if (error) {
      return {
        ok: false,
        message: /duplicate|unique/i.test(error.message)
          ? "Diese Postfach-Adresse existiert bereits."
          : error.message,
      };
    }

    await logAudit({
      action: "mailbox.created",
      entityType: "mailbox",
      entityId: box.id,
      locationId: input.locationId ? input.locationId : null,
      metadata: { name: input.name, email: input.email },
    });

    revalidatePath("/settings/mailboxes");
    return { ok: true, message: `Postfach „${input.name}“ wurde angelegt.` };
  } catch (err) {
    return forbidden(err) ?? { ok: false, message: "Unerwarteter Fehler." };
  }
}

// ----------------------------------------------------------------------------
// Postfach aktivieren / deaktivieren
// ----------------------------------------------------------------------------
export async function setMailboxActive(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await guard();
    const id = z.string().uuid().safeParse(formData.get("mailboxId"));
    const active = formData.get("active") === "true";
    if (!id.success) return { ok: false, message: "Ungültige Eingabe." };

    const supabase = await createClient();
    const { error } = await supabase
      .from("mailboxes")
      .update({ is_active: active })
      .eq("id", id.data);
    if (error) return { ok: false, message: error.message };

    await logAudit({
      action: "mailbox.updated",
      entityType: "mailbox",
      entityId: id.data,
      metadata: { is_active: active },
    });

    revalidatePath("/settings/mailboxes");
    return { ok: true, message: active ? "Postfach aktiviert." : "Postfach deaktiviert." };
  } catch (err) {
    return forbidden(err) ?? { ok: false, message: "Unerwarteter Fehler." };
  }
}

// ----------------------------------------------------------------------------
// Mitglied hinzufügen
// ----------------------------------------------------------------------------
const memberSchema = z.object({
  mailboxId: z.string().uuid(),
  profileId: z.string().uuid(),
});

export async function addMember(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await guard();
    const parsed = memberSchema.safeParse({
      mailboxId: formData.get("mailboxId"),
      profileId: formData.get("profileId"),
    });
    if (!parsed.success) return { ok: false, message: "Ungültige Eingabe." };

    const supabase = await createClient();
    const { error } = await supabase.from("mailbox_members").insert({
      mailbox_id: parsed.data.mailboxId,
      profile_id: parsed.data.profileId,
    });
    if (error) {
      return {
        ok: false,
        message: /duplicate|unique/i.test(error.message)
          ? "Dieser Mitarbeiter ist bereits Mitglied."
          : error.message,
      };
    }

    await logAudit({
      action: "mailbox.member_added",
      entityType: "mailbox",
      entityId: parsed.data.mailboxId,
      metadata: { profile_id: parsed.data.profileId },
    });

    revalidatePath("/settings/mailboxes");
    return { ok: true, message: "Mitglied hinzugefügt." };
  } catch (err) {
    return forbidden(err) ?? { ok: false, message: "Unerwarteter Fehler." };
  }
}

// ----------------------------------------------------------------------------
// Mitglied entfernen
// ----------------------------------------------------------------------------
export async function removeMember(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await guard();
    const parsed = memberSchema.safeParse({
      mailboxId: formData.get("mailboxId"),
      profileId: formData.get("profileId"),
    });
    if (!parsed.success) return { ok: false, message: "Ungültige Eingabe." };

    const supabase = await createClient();
    const { error } = await supabase
      .from("mailbox_members")
      .delete()
      .eq("mailbox_id", parsed.data.mailboxId)
      .eq("profile_id", parsed.data.profileId);
    if (error) return { ok: false, message: error.message };

    await logAudit({
      action: "mailbox.member_removed",
      entityType: "mailbox",
      entityId: parsed.data.mailboxId,
      metadata: { profile_id: parsed.data.profileId },
    });

    revalidatePath("/settings/mailboxes");
    return { ok: true, message: "Mitglied entfernt." };
  } catch (err) {
    return forbidden(err) ?? { ok: false, message: "Unerwarteter Fehler." };
  }
}
