"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/services/auth/current-user";
import { can } from "@/lib/auth/permissions";

export interface ActionResult {
  ok: boolean;
  message: string;
}

async function guard() {
  const ctx = await getCurrentUser();
  if (!ctx || !can(ctx, "templates.manage")) throw new Error("FORBIDDEN");
  return ctx;
}

function forbidden(err: unknown): ActionResult | null {
  if (err instanceof Error && err.message === "FORBIDDEN") {
    return { ok: false, message: "Keine Berechtigung." };
  }
  return null;
}

const schema = z.object({
  name: z.string().trim().min(1, "Name ist erforderlich.").max(80, "Name zu lang."),
  body: z.string().trim().min(1, "Inhalt darf nicht leer sein.").max(10000, "Inhalt zu lang."),
});

export async function createTemplate(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const ctx = await guard();
    const parsed = schema.safeParse({
      name: formData.get("name"),
      body: formData.get("body"),
    });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
    }
    const supabase = await createClient();
    const { error } = await supabase.from("templates").insert({
      name: parsed.data.name,
      body: parsed.data.body,
      created_by: ctx.profileId,
    });
    if (error) return { ok: false, message: error.message };
    revalidatePath("/settings/templates");
    return { ok: true, message: `Vorlage „${parsed.data.name}“ angelegt.` };
  } catch (err) {
    return forbidden(err) ?? { ok: false, message: "Unerwarteter Fehler." };
  }
}

export async function updateTemplate(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await guard();
    const id = z.string().uuid().safeParse(formData.get("templateId"));
    const parsed = schema.safeParse({
      name: formData.get("name"),
      body: formData.get("body"),
    });
    if (!id.success || !parsed.success) {
      return { ok: false, message: parsed.success ? "Ungültige Eingabe." : parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
    }
    const supabase = await createClient();
    const { error } = await supabase
      .from("templates")
      .update({ name: parsed.data.name, body: parsed.data.body })
      .eq("id", id.data);
    if (error) return { ok: false, message: error.message };
    revalidatePath("/settings/templates");
    return { ok: true, message: "Vorlage aktualisiert." };
  } catch (err) {
    return forbidden(err) ?? { ok: false, message: "Unerwarteter Fehler." };
  }
}

export async function deleteTemplate(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await guard();
    const id = z.string().uuid().safeParse(formData.get("templateId"));
    if (!id.success) return { ok: false, message: "Ungültige Eingabe." };
    const supabase = await createClient();
    const { error } = await supabase.from("templates").delete().eq("id", id.data);
    if (error) return { ok: false, message: error.message };
    revalidatePath("/settings/templates");
    return { ok: true, message: "Vorlage gelöscht." };
  } catch (err) {
    return forbidden(err) ?? { ok: false, message: "Unerwarteter Fehler." };
  }
}
