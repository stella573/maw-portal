import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env";
import {
  verifyResendSignature,
  extractEmail,
  extractTicketReference,
} from "@/lib/resend/inbound";
import type { Json } from "@/types/database";

/**
 * Resend Inbound-Webhook: eingehende E-Mails → Postfach/Kunde/Ticket/Nachricht.
 *
 * Läuft mit Service-Role (kein User-Kontext), daher:
 *  - Svix-Signaturprüfung gegen RESEND_WEBHOOK_SECRET (Replay-Schutz inkl.)
 *  - strikte Schema-Validierung
 *  - klar abgegrenzte Operationen
 *
 * Zuordnung:
 *  1. Empfänger-Adresse (to) → Postfach mit gleicher email
 *  2. Ticket-Referenz im Betreff (Re: … MAW-XXXX) → bestehendes Ticket
 *  3. sonst offenes Ticket desselben Kunden im selben Postfach
 *  4. sonst neues Ticket
 */

export const runtime = "nodejs";

const inboundSchema = z.object({
  from: z.string(),
  to: z.union([z.string(), z.array(z.string())]).optional(),
  subject: z.string().default("(kein Betreff)"),
  text: z.string().optional(),
  html: z.string().optional(),
  message_id: z.string().optional(),
  from_name: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const env = getServerEnv();
  if (!env.RESEND_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Webhook nicht konfiguriert" }, { status: 503 });
  }

  const rawBody = await request.text();

  // Svix-Signatur prüfen (Resend-Standard).
  const valid = verifyResendSignature({
    rawBody,
    svixId: request.headers.get("svix-id"),
    svixTimestamp: request.headers.get("svix-timestamp"),
    svixSignature: request.headers.get("svix-signature"),
    secret: env.RESEND_WEBHOOK_SECRET,
  });
  if (!valid) {
    return NextResponse.json({ error: "Ungültige Signatur" }, { status: 401 });
  }

  let payload: unknown;
  try {
    const parsed = JSON.parse(rawBody);
    payload = parsed?.data ?? parsed;
  } catch {
    return NextResponse.json({ error: "Ungültiges JSON" }, { status: 400 });
  }

  const result = inboundSchema.safeParse(payload);
  if (!result.success) {
    return NextResponse.json({ error: "Validierung fehlgeschlagen" }, { status: 422 });
  }
  const mail = result.data;

  const fromEmail = extractEmail(mail.from);
  const toEmail = extractEmail(mail.to);
  if (!fromEmail) {
    return NextResponse.json({ error: "Absender fehlt" }, { status: 422 });
  }

  const supabase = createAdminClient();

  // 0) Postfach über Empfänger-Adresse bestimmen.
  let mailboxId: string | null = null;
  let mailboxLocationId: string | null = null;
  if (toEmail) {
    const { data: mailbox } = await supabase
      .from("mailboxes")
      .select("id, location_id, is_active")
      .eq("email", toEmail)
      .maybeSingle();
    if (mailbox && mailbox.is_active) {
      mailboxId = mailbox.id;
      mailboxLocationId = mailbox.location_id;
    }
  }
  // Kein passendes (aktives) Postfach → bewusst 202 (akzeptiert, ignoriert),
  // damit Resend nicht endlos retried. Wird zur Diagnose geloggt.
  if (!mailboxId) {
    console.warn(`[resend-webhook] kein Postfach für Empfänger '${toEmail}'`);
    return NextResponse.json(
      { ok: true, ignored: true, reason: "no_matching_mailbox" },
      { status: 202 },
    );
  }

  // 1) Kunde upserten (über E-Mail dedupliziert).
  const { data: customer, error: customerErr } = await supabase
    .from("customers")
    .upsert(
      { email: fromEmail, full_name: mail.from_name ?? null },
      { onConflict: "email", ignoreDuplicates: false },
    )
    .select("id")
    .single();

  if (customerErr || !customer) {
    console.error("[resend-webhook] customer upsert:", customerErr?.message);
    return NextResponse.json({ error: "Kunde konnte nicht angelegt werden" }, { status: 500 });
  }

  // 2) Threading: Ticket-Referenz im Betreff?
  let ticketId: string | undefined;
  const reference = extractTicketReference(mail.subject);
  if (reference) {
    const { data: byRef } = await supabase
      .from("tickets")
      .select("id")
      .eq("reference", reference)
      .eq("mailbox_id", mailboxId)
      .maybeSingle();
    if (byRef) ticketId = byRef.id;
  }

  // 3) sonst offenes Ticket desselben Kunden im selben Postfach.
  if (!ticketId) {
    const { data: existing } = await supabase
      .from("tickets")
      .select("id")
      .eq("customer_id", customer.id)
      .eq("mailbox_id", mailboxId)
      .in("status", ["open", "pending"])
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) ticketId = existing.id;
  }

  // 4) sonst neues Ticket.
  if (!ticketId) {
    const { data: ticket, error: ticketErr } = await supabase
      .from("tickets")
      .insert({
        subject: mail.subject,
        customer_id: customer.id,
        mailbox_id: mailboxId,
        location_id: mailboxLocationId,
        status: "open",
      })
      .select("id")
      .single();
    if (ticketErr || !ticket) {
      console.error("[resend-webhook] ticket insert:", ticketErr?.message);
      return NextResponse.json({ error: "Ticket konnte nicht angelegt werden" }, { status: 500 });
    }
    ticketId = ticket.id;
  } else {
    // Wiedereröffnen, falls die Antwort zu einem erledigten Ticket kam.
    await supabase.from("tickets").update({ status: "open" }).eq("id", ticketId).eq("status", "resolved");
  }

  // 5) Eingehende Nachricht anhängen (Trigger pflegt last_message_at).
  const { error: msgErr } = await supabase.from("messages").insert({
    ticket_id: ticketId,
    direction: "inbound",
    channel: "email",
    from_email: fromEmail,
    to_email: toEmail,
    subject: mail.subject,
    body_text: mail.text ?? null,
    body_html: mail.html ?? null,
    provider_id: mail.message_id ?? null,
    raw: result.data as unknown as Json,
  });

  if (msgErr) {
    console.error("[resend-webhook] message insert:", msgErr.message);
    return NextResponse.json({ error: "Nachricht konnte nicht gespeichert werden" }, { status: 500 });
  }

  // 6) Audit (Actor = System/NULL).
  await supabase.rpc("log_audit", {
    p_action: "message.inbound_received",
    p_entity_type: "ticket",
    p_entity_id: ticketId,
    p_location_id: mailboxLocationId,
    p_metadata: { from: fromEmail, to: toEmail },
  });

  return NextResponse.json({ ok: true, ticket_id: ticketId });
}
