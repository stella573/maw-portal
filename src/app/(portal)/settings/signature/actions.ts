"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/services/auth/current-user";

export interface ActionResult {
  ok: boolean;
  message: string;
}

// Großzügiges Limit – HTML-Signaturen mit Tabelle/Bild brauchen Platz.
const schema = z.object({
  signatureHtml: z.string().max(20000, "Signatur ist zu lang (max. 20.000 Zeichen)."),
});

/**
 * Speichert die persönliche HTML-Signatur der/des eingeloggten Mitarbeitenden.
 * Self-Service: schreibt ausschließlich das eigene Profil (RLS:
 * profiles_update_self). Leereingabe = Signatur entfernen.
 */
export async function updateSignature(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const ctx = await getCurrentUser();
    if (!ctx) return { ok: false, message: "Nicht authentifiziert." };

    const parsed = schema.safeParse({
      signatureHtml: formData.get("signatureHtml") ?? "",
    });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
    }

    const value = parsed.data.signatureHtml.trim();

    const supabase = await createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ signature_html: value ? value : null })
      .eq("id", ctx.profileId);
    if (error) {
      return {
        ok: false,
        message: /policy|permission|row-level/i.test(error.message)
          ? "Keine Berechtigung."
          : error.message,
      };
    }

    revalidatePath("/settings/signature");
    return {
      ok: true,
      message: value ? "Signatur gespeichert." : "Signatur entfernt.",
    };
  } catch (err) {
    console.error("[settings.updateSignature]", err);
    return { ok: false, message: "Unerwarteter Fehler." };
  }
}
