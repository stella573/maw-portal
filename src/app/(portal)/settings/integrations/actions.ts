"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/services/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/audit/log";
import {
  saveRollerConnection,
  verifyRollerConnection,
  deleteRollerConnection,
} from "@/services/admin/roller";

export interface ActionResult {
  ok: boolean;
  message: string;
}

async function guard(): Promise<boolean> {
  const ctx = await getCurrentUser();
  return !!ctx && can(ctx, "integrations.manage");
}

const saveSchema = z.object({
  locationId: z.string().uuid(),
  clientId: z.string().trim().min(1, "Client-ID ist erforderlich."),
  // Beim Bearbeiten optional: leer = bestehendes Secret behalten.
  clientSecret: z.string().optional(),
  baseUrl: z.string().trim().optional(),
});

export async function saveRollerCredentials(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    if (!(await guard())) return { ok: false, message: "Keine Berechtigung." };
    const parsed = saveSchema.safeParse({
      locationId: formData.get("locationId"),
      clientId: formData.get("clientId"),
      clientSecret: formData.get("clientSecret") ?? "",
      baseUrl: formData.get("baseUrl") ?? "",
    });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
    }
    const { locationId, clientId, baseUrl } = parsed.data;
    let secret = parsed.data.clientSecret?.trim() ?? "";

    // Kein neues Secret eingegeben → bestehendes beibehalten.
    if (!secret) {
      const admin = createAdminClient();
      const { data } = await admin
        .from("roller_connections")
        .select("client_secret")
        .eq("location_id", locationId)
        .maybeSingle();
      if (!data?.client_secret) {
        return { ok: false, message: "Client-Secret ist erforderlich." };
      }
      secret = data.client_secret;
    }

    await saveRollerConnection(locationId, { clientId, clientSecret: secret, baseUrl });
    await logAudit({
      action: "user.updated",
      entityType: "roller_connection",
      entityId: locationId,
      metadata: { client_id: clientId },
    });

    // Direkt verifizieren, damit der Status sofort stimmt.
    const v = await verifyRollerConnection(locationId);
    revalidatePath("/settings/integrations");
    return v.ok
      ? { ok: true, message: `Gespeichert & verbunden${v.venueName ? ` (${v.venueName})` : ""}.` }
      : { ok: true, message: `Gespeichert. Verbindungstest fehlgeschlagen: ${v.error ?? ""}` };
  } catch (err) {
    console.error("[integrations.saveRollerCredentials]", err);
    return { ok: false, message: "Unerwarteter Fehler." };
  }
}

export async function testRollerConnection(locationId: string): Promise<ActionResult> {
  try {
    if (!(await guard())) return { ok: false, message: "Keine Berechtigung." };
    const v = await verifyRollerConnection(locationId);
    revalidatePath("/settings/integrations");
    return v.ok
      ? { ok: true, message: `Verbindung OK${v.venueName ? ` – ${v.venueName}` : ""}.` }
      : { ok: false, message: v.error ?? "Verbindung fehlgeschlagen." };
  } catch (err) {
    console.error("[integrations.testRollerConnection]", err);
    return { ok: false, message: "Unerwarteter Fehler." };
  }
}

export async function removeRollerConnection(locationId: string): Promise<ActionResult> {
  try {
    if (!(await guard())) return { ok: false, message: "Keine Berechtigung." };
    await deleteRollerConnection(locationId);
    await logAudit({
      action: "user.updated",
      entityType: "roller_connection",
      entityId: locationId,
      metadata: { removed: true },
    });
    revalidatePath("/settings/integrations");
    return { ok: true, message: "Verbindung entfernt." };
  } catch (err) {
    console.error("[integrations.removeRollerConnection]", err);
    return { ok: false, message: "Unerwarteter Fehler." };
  }
}
