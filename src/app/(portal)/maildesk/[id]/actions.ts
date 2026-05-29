"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/services/auth/current-user";
import { logAudit } from "@/lib/audit/log";
import type { TicketStatus, TicketPriority } from "@/types/database";

export interface ActionResult {
  ok: boolean;
  message: string;
}

// ----------------------------------------------------------------------------
// Status / Priorität ändern
// ----------------------------------------------------------------------------
const updateSchema = z.object({
  ticketId: z.string().uuid(),
  status: z.enum(["open", "pending", "resolved"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
});

export async function updateTicket(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const ctx = await getCurrentUser();
    if (!ctx) return { ok: false, message: "Nicht authentifiziert." };

    const parsed = updateSchema.safeParse({
      ticketId: formData.get("ticketId"),
      status: formData.get("status") || undefined,
      priority: formData.get("priority") || undefined,
    });
    if (!parsed.success) return { ok: false, message: "Ungültige Eingabe." };

    const patch: { status?: TicketStatus; priority?: TicketPriority } = {};
    if (parsed.data.status) patch.status = parsed.data.status;
    if (parsed.data.priority) patch.priority = parsed.data.priority;
    if (Object.keys(patch).length === 0) return { ok: true, message: "" };

    const supabase = await createClient();
    const { error } = await supabase
      .from("tickets")
      .update(patch)
      .eq("id", parsed.data.ticketId);
    if (error) {
      return {
        ok: false,
        message: /policy|permission|row-level/i.test(error.message)
          ? "Keine Berechtigung."
          : error.message,
      };
    }

    // Statuswechsel wird zusätzlich per DB-Trigger auditiert; hier nur
    // explizite Prioritätsänderung protokollieren.
    if (parsed.data.priority && !parsed.data.status) {
      await logAudit({
        action: "ticket.updated",
        entityType: "ticket",
        entityId: parsed.data.ticketId,
        metadata: { priority: parsed.data.priority },
      });
    }

    revalidatePath(`/maildesk/${parsed.data.ticketId}`);
    revalidatePath("/maildesk");
    return { ok: true, message: "Aktualisiert." };
  } catch (err) {
    console.error("[ticket.updateTicket]", err);
    return { ok: false, message: "Unerwarteter Fehler." };
  }
}

// ----------------------------------------------------------------------------
// Interne Notiz hinzufügen
// ----------------------------------------------------------------------------
const noteSchema = z.object({
  ticketId: z.string().uuid(),
  body: z.string().trim().min(1, "Notiz darf nicht leer sein."),
});

export async function addNote(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const ctx = await getCurrentUser();
    if (!ctx) return { ok: false, message: "Nicht authentifiziert." };

    const parsed = noteSchema.safeParse({
      ticketId: formData.get("ticketId"),
      body: formData.get("body"),
    });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
    }

    const supabase = await createClient();
    const { error } = await supabase.from("notes").insert({
      ticket_id: parsed.data.ticketId,
      author_id: ctx.profileId,
      body: parsed.data.body,
    });
    if (error) {
      return {
        ok: false,
        message: /policy|permission|row-level/i.test(error.message)
          ? "Keine Berechtigung."
          : error.message,
      };
    }

    await logAudit({
      action: "note.created",
      entityType: "ticket",
      entityId: parsed.data.ticketId,
    });

    revalidatePath(`/maildesk/${parsed.data.ticketId}`);
    return { ok: true, message: "Notiz gespeichert." };
  } catch (err) {
    console.error("[ticket.addNote]", err);
    return { ok: false, message: "Unerwarteter Fehler." };
  }
}
