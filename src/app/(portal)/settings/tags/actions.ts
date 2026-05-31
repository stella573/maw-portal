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
  if (!ctx || !can(ctx, "tags.manage")) throw new Error("FORBIDDEN");
  return ctx;
}

function forbidden(err: unknown): ActionResult | null {
  if (err instanceof Error && err.message === "FORBIDDEN") {
    return { ok: false, message: "Keine Berechtigung." };
  }
  return null;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const tagSchema = z.object({
  name: z.string().trim().min(1, "Name ist erforderlich.").max(40, "Name zu lang."),
  color: z.string().regex(HEX, "Farbe muss ein Hex-Wert sein (z. B. #E8920B).").default("#64748b"),
});

export async function createTag(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await guard();
    const parsed = tagSchema.safeParse({
      name: formData.get("name"),
      color: formData.get("color") || "#64748b",
    });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
    }
    const supabase = await createClient();
    const { error } = await supabase
      .from("tags")
      .insert({ name: parsed.data.name, color: parsed.data.color });
    if (error) {
      return {
        ok: false,
        message: /duplicate|unique/i.test(error.message)
          ? "Es gibt bereits einen Tag mit diesem Namen."
          : error.message,
      };
    }
    revalidatePath("/settings/tags");
    return { ok: true, message: `Tag „${parsed.data.name}“ angelegt.` };
  } catch (err) {
    return forbidden(err) ?? { ok: false, message: "Unerwarteter Fehler." };
  }
}

export async function updateTag(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await guard();
    const id = z.string().uuid().safeParse(formData.get("tagId"));
    const parsed = tagSchema.safeParse({
      name: formData.get("name"),
      color: formData.get("color") || "#64748b",
    });
    if (!id.success || !parsed.success) {
      return { ok: false, message: parsed.success ? "Ungültige Eingabe." : parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
    }
    const supabase = await createClient();
    const { error } = await supabase
      .from("tags")
      .update({ name: parsed.data.name, color: parsed.data.color })
      .eq("id", id.data);
    if (error) {
      return {
        ok: false,
        message: /duplicate|unique/i.test(error.message)
          ? "Es gibt bereits einen Tag mit diesem Namen."
          : error.message,
      };
    }
    revalidatePath("/settings/tags");
    return { ok: true, message: "Tag aktualisiert." };
  } catch (err) {
    return forbidden(err) ?? { ok: false, message: "Unerwarteter Fehler." };
  }
}

export async function deleteTag(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await guard();
    const id = z.string().uuid().safeParse(formData.get("tagId"));
    if (!id.success) return { ok: false, message: "Ungültige Eingabe." };
    const supabase = await createClient();
    // ticket_tags hängt per ON DELETE CASCADE am Tag → Verknüpfungen gehen mit.
    const { error } = await supabase.from("tags").delete().eq("id", id.data);
    if (error) return { ok: false, message: error.message };
    revalidatePath("/settings/tags");
    return { ok: true, message: "Tag gelöscht." };
  } catch (err) {
    return forbidden(err) ?? { ok: false, message: "Unerwarteter Fehler." };
  }
}
