"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/services/auth/current-user";
import { logAudit } from "@/lib/audit/log";
import type { TicketStatus } from "@/types/database";

export interface ActionResult {
  ok: boolean;
  message: string;
  ticketId?: string;
}

/**
 * Status eines Tickets mit einem Klick setzen (z. B. „Erledigt" direkt aus der
 * Inbox-Liste). Bewusst schlank gehalten – kein Formular, nur ticketId+status.
 * RLS sorgt dafür, dass nur berechtigte Bearbeiter ändern dürfen.
 */
const statusSchema = z.object({
  ticketId: z.string().uuid(),
  status: z.enum(["open", "pending", "resolved"]),
});

export async function setTicketStatus(
  ticketId: string,
  status: TicketStatus,
): Promise<ActionResult> {
  try {
    const ctx = await getCurrentUser();
    if (!ctx) return { ok: false, message: "Nicht authentifiziert." };

    const parsed = statusSchema.safeParse({ ticketId, status });
    if (!parsed.success) return { ok: false, message: "Ungültige Eingabe." };

    const supabase = await createClient();
    const { error } = await supabase
      .from("tickets")
      .update({ status: parsed.data.status })
      .eq("id", parsed.data.ticketId);
    if (error) {
      return {
        ok: false,
        message: /policy|permission|row-level/i.test(error.message)
          ? "Keine Berechtigung."
          : error.message,
      };
    }

    // Statuswechsel wird zusätzlich per DB-Trigger auditiert.
    revalidatePath("/maildesk");
    revalidatePath(`/maildesk/${parsed.data.ticketId}`);
    return { ok: true, message: "Status aktualisiert." };
  } catch (err) {
    console.error("[maildesk.setTicketStatus]", err);
    return { ok: false, message: "Unerwarteter Fehler." };
  }
}

/**
 * Manuelles Anlegen eines Tickets (interner Vorgang / Test, bevor Resend
 * eingehende Mails liefert). Optional mit Kunde (E-Mail) und Erstnachricht.
 * RLS stellt sicher, dass nur Postfach-Mitglieder im gewählten Postfach
 * anlegen können.
 */
const schema = z.object({
  mailboxId: z.string().uuid("Postfach wählen."),
  subject: z.string().trim().min(1, "Betreff ist erforderlich."),
  customerEmail: z.string().email("Ungültige E-Mail.").optional().or(z.literal("")),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  body: z.string().trim().optional(),
});

export async function createTicket(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const ctx = await getCurrentUser();
    if (!ctx) return { ok: false, message: "Nicht authentifiziert." };

    const parsed = schema.safeParse({
      mailboxId: formData.get("mailboxId"),
      subject: formData.get("subject"),
      customerEmail: formData.get("customerEmail") ?? "",
      priority: formData.get("priority") ?? "normal",
      body: formData.get("body") ?? "",
    });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
    }
    const input = parsed.data;

    const supabase = await createClient();

    // Postfach-Standort übernehmen (für location-bezogene Auswertungen).
    const { data: mailbox } = await supabase
      .from("mailboxes")
      .select("id, location_id")
      .eq("id", input.mailboxId)
      .single();
    if (!mailbox) return { ok: false, message: "Postfach nicht gefunden." };

    // Kunde optional anlegen/finden.
    let customerId: string | null = null;
    if (input.customerEmail) {
      const { data: customer } = await supabase
        .from("customers")
        .upsert({ email: input.customerEmail }, { onConflict: "email" })
        .select("id")
        .single();
      customerId = customer?.id ?? null;
    }

    const { data: ticket, error } = await supabase
      .from("tickets")
      .insert({
        subject: input.subject,
        priority: input.priority,
        status: "open",
        mailbox_id: input.mailboxId,
        location_id: mailbox.location_id,
        customer_id: customerId,
        created_by: ctx.profileId,
      })
      .select("id")
      .single();

    if (error || !ticket) {
      return {
        ok: false,
        message: /policy|permission|row-level/i.test(error?.message ?? "")
          ? "Keine Berechtigung für dieses Postfach."
          : error?.message ?? "Anlegen fehlgeschlagen.",
      };
    }

    // Optionale Erstnachricht (inbound, vom Kunden) anhängen.
    if (input.body) {
      await supabase.from("messages").insert({
        ticket_id: ticket.id,
        direction: "inbound",
        channel: "email",
        from_email: input.customerEmail || null,
        subject: input.subject,
        body_text: input.body,
      });
    }

    await logAudit({
      action: "ticket.created",
      entityType: "ticket",
      entityId: ticket.id,
      locationId: mailbox.location_id,
      metadata: { subject: input.subject, mailbox_id: input.mailboxId },
    });

    revalidatePath("/maildesk");
    return { ok: true, message: "Ticket angelegt.", ticketId: ticket.id };
  } catch (err) {
    console.error("[maildesk.createTicket]", err);
    return { ok: false, message: "Unerwarteter Fehler." };
  }
}
