import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env";
import {
  verifyResendSignature,
  extractEmail,
  extractTicketReference,
  fetchReceivedEmail,
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

// Bewusst permissiv: Resend-Inbound-Payloads variieren je nach Setup in den
// Feldnamen. Wir validieren nur das Minimum und lesen Inhalt/Adressen tolerant
// über extractBody()/Adress-Helfer aus dem Roh-Objekt.
const inboundSchema = z
  .object({
    from: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
    to: z
      .union([
        z.string(),
        z.array(z.union([z.string(), z.record(z.string(), z.unknown())])),
        z.record(z.string(), z.unknown()),
      ])
      .optional(),
    subject: z.string().optional(),
    text: z.string().optional(),
    html: z.string().optional(),
    message_id: z.string().optional(),
    from_name: z.string().optional(),
  })
  .passthrough();

/** Liest eine Adresse aus String oder Objekt ({address|email|value}). */
function readAddress(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return readAddress(v[0]);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const cand = o.address ?? o.email ?? o.value ?? o.addr;
    if (typeof cand === "string") return cand;
  }
  return undefined;
}

/** Extrahiert den Mailtext aus diversen möglichen Feldern des Payloads. */
function extractBody(raw: Record<string, unknown>): {
  text: string | null;
  html: string | null;
} {
  const str = (x: unknown) => (typeof x === "string" && x.trim() ? x : null);
  // direkte Felder
  let text =
    str(raw.text) ??
    str(raw.plain) ??
    str(raw["text/plain"]) ??
    str((raw.body as Record<string, unknown> | undefined)?.text) ??
    null;
  const html =
    str(raw.html) ??
    str(raw["text/html"]) ??
    str((raw.body as Record<string, unknown> | undefined)?.html) ??
    null;
  // body als String
  if (!text && !html) {
    const b = str(raw.body) ?? str(raw.content) ?? str(raw.message);
    if (b) text = b;
  }
  return { text, html };
}

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
  const raw = mail as Record<string, unknown>;

  // Adressen/Betreff tolerant aus dem Webhook lesen.
  let fromEmail = extractEmail(readAddress(mail.from) ?? (raw.sender as string | undefined));
  let toEmail = extractEmail(
    readAddress(mail.to) ?? (raw.recipient as string | undefined) ?? (raw["to_email"] as string | undefined),
  );
  let subject = mail.subject ?? (raw.Subject as string | undefined) ?? "(kein Betreff)";

  // Resend-Inbound-Webhooks enthalten NUR Metadaten – der Body (text/html)
  // fehlt und muss über die email_id nachgeladen werden.
  let { text: bodyText, html: bodyHtml } = extractBody(raw);
  const emailId =
    (raw.email_id as string | undefined) ?? (raw.id as string | undefined) ?? mail.message_id;

  if (!bodyText && !bodyHtml && emailId && env.RESEND_API_KEY) {
    const full = await fetchReceivedEmail(emailId, env.RESEND_API_KEY);
    if (full) {
      bodyText = full.text ?? bodyText;
      bodyHtml = full.html ?? bodyHtml;
      if (!subject || subject === "(kein Betreff)") subject = full.subject ?? subject;
      fromEmail = fromEmail ?? extractEmail(full.from ?? undefined);
      toEmail = toEmail ?? extractEmail(full.to ?? undefined);
    }
  }

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
  const reference = extractTicketReference(subject);
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
        subject,
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
    subject,
    body_text: bodyText,
    body_html: bodyHtml,
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
