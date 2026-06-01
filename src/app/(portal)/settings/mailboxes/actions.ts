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
// Postfach bearbeiten (Name / Adresse / Standort)
// ----------------------------------------------------------------------------
const editSchema = z.object({
  mailboxId: z.string().uuid(),
  name: z.string().trim().min(1, "Name ist erforderlich."),
  email: z.string().email("Ungültige E-Mail-Adresse."),
  locationId: z.string().uuid().optional().or(z.literal("")),
});

export async function updateMailbox(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await guard();
    const parsed = editSchema.safeParse({
      mailboxId: formData.get("mailboxId"),
      name: formData.get("name"),
      email: formData.get("email"),
      locationId: formData.get("locationId") ?? "",
    });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
    }
    const input = parsed.data;

    const supabase = await createClient();
    const { error } = await supabase
      .from("mailboxes")
      .update({
        name: input.name,
        email: input.email,
        location_id: input.locationId ? input.locationId : null,
      })
      .eq("id", input.mailboxId);
    if (error) {
      return {
        ok: false,
        message: /duplicate|unique/i.test(error.message)
          ? "Diese Postfach-Adresse ist bereits vergeben."
          : error.message,
      };
    }

    await logAudit({
      action: "mailbox.updated",
      entityType: "mailbox",
      entityId: input.mailboxId,
      metadata: { name: input.name, email: input.email },
    });

    revalidatePath("/settings/mailboxes");
    return { ok: true, message: "Postfach aktualisiert." };
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
// Alias hinzufügen (weitere Empfangsadresse → selbes Postfach)
// ----------------------------------------------------------------------------
const aliasSchema = z.object({
  mailboxId: z.string().uuid(),
  email: z.string().email("Ungültige E-Mail-Adresse."),
});

export async function addAlias(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await guard();
    const parsed = aliasSchema.safeParse({
      mailboxId: formData.get("mailboxId"),
      email: formData.get("email"),
    });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
    }
    const { mailboxId, email } = parsed.data;

    const supabase = await createClient();

    // Adresse darf nicht bereits eine primäre Postfach-Adresse sein.
    const { data: primary } = await supabase
      .from("mailboxes")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (primary) {
      return { ok: false, message: "Diese Adresse ist bereits eine Postfach-Adresse." };
    }

    const { error } = await supabase
      .from("mailbox_aliases")
      .insert({ mailbox_id: mailboxId, email });
    if (error) {
      return {
        ok: false,
        message: /duplicate|unique/i.test(error.message)
          ? "Diese Alias-Adresse wird bereits verwendet."
          : /policy|permission|row-level/i.test(error.message)
            ? "Keine Berechtigung."
            : error.message,
      };
    }

    await logAudit({
      action: "mailbox.updated",
      entityType: "mailbox",
      entityId: mailboxId,
      metadata: { alias_added: email },
    });

    revalidatePath("/settings/mailboxes");
    return { ok: true, message: `Alias „${email}“ hinzugefügt.` };
  } catch (err) {
    return forbidden(err) ?? { ok: false, message: "Unerwarteter Fehler." };
  }
}

// ----------------------------------------------------------------------------
// Alias entfernen
// ----------------------------------------------------------------------------
export async function removeAlias(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await guard();
    const id = z.string().uuid().safeParse(formData.get("aliasId"));
    if (!id.success) return { ok: false, message: "Ungültige Eingabe." };

    const supabase = await createClient();
    const { data: removed, error } = await supabase
      .from("mailbox_aliases")
      .delete()
      .eq("id", id.data)
      .select("mailbox_id, email")
      .maybeSingle();
    if (error) return { ok: false, message: error.message };

    await logAudit({
      action: "mailbox.updated",
      entityType: "mailbox",
      entityId: removed?.mailbox_id ?? null,
      metadata: { alias_removed: removed?.email ?? null },
    });

    revalidatePath("/settings/mailboxes");
    return { ok: true, message: "Alias entfernt." };
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
