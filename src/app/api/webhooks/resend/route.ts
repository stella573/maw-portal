import { NextResponse, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env";
import type { Json } from "@/types/database";

/**
 * Resend Inbound-Webhook: eingehende E-Mails → customer/ticket/message.
 *
 * Läuft mit Service-Role (kein User-Kontext), daher:
 *  - eigene Signaturprüfung gegen RESEND_WEBHOOK_SECRET
 *  - strikte Schema-Validierung
 *  - klar abgegrenzte Operationen
 *
 * Hinweis: Resend signiert Webhooks im Svix-Format. Für die Produktion sollte
 * die offizielle `svix`-Verifikation ergänzt werden; hier eine robuste
 * HMAC-Basisprüfung als Fundament (siehe ROADMAP 1.4).
 */

export const runtime = "nodejs";

const inboundSchema = z.object({
  from: z.string().email(),
  to: z.union([z.string(), z.array(z.string())]).optional(),
  subject: z.string().default("(kein Betreff)"),
  text: z.string().optional(),
  html: z.string().optional(),
  // Resend kann je nach Konfiguration unterschiedliche Felder liefern – tolerant.
  message_id: z.string().optional(),
  from_name: z.string().optional(),
});

function verifySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const env = getServerEnv();
  if (!env.RESEND_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Webhook nicht konfiguriert" }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature =
    request.headers.get("x-maw-signature") ?? request.headers.get("svix-signature");

  if (!verifySignature(rawBody, signature, env.RESEND_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Ungültige Signatur" }, { status: 401 });
  }

  let payload: unknown;
  try {
    const parsed = JSON.parse(rawBody);
    // Resend kapselt Events teils unter { type, data }
    payload = parsed?.data ?? parsed;
  } catch {
    return NextResponse.json({ error: "Ungültiges JSON" }, { status: 400 });
  }

  const result = inboundSchema.safeParse(payload);
  if (!result.success) {
    return NextResponse.json({ error: "Validierung fehlgeschlagen" }, { status: 422 });
  }
  const mail = result.data;

  const supabase = createAdminClient();

  // 1) Kunde upserten (über E-Mail dedupliziert)
  const { data: customer, error: customerErr } = await supabase
    .from("customers")
    .upsert(
      { email: mail.from, full_name: mail.from_name ?? null },
      { onConflict: "email", ignoreDuplicates: false },
    )
    .select("id")
    .single();

  if (customerErr || !customer) {
    console.error("[resend-webhook] customer upsert:", customerErr?.message);
    return NextResponse.json({ error: "Kunde konnte nicht angelegt werden" }, { status: 500 });
  }

  // 2) Offenes Ticket des Kunden finden, sonst neu anlegen
  const { data: existing } = await supabase
    .from("tickets")
    .select("id")
    .eq("customer_id", customer.id)
    .in("status", ["open", "pending"])
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let ticketId = existing?.id;
  if (!ticketId) {
    const { data: ticket, error: ticketErr } = await supabase
      .from("tickets")
      .insert({ subject: mail.subject, customer_id: customer.id, status: "open" })
      .select("id")
      .single();
    if (ticketErr || !ticket) {
      console.error("[resend-webhook] ticket insert:", ticketErr?.message);
      return NextResponse.json({ error: "Ticket konnte nicht angelegt werden" }, { status: 500 });
    }
    ticketId = ticket.id;
  }

  // 3) Eingehende Nachricht anhängen (Trigger pflegt last_message_at)
  const { error: msgErr } = await supabase.from("messages").insert({
    ticket_id: ticketId,
    direction: "inbound",
    channel: "email",
    from_email: mail.from,
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

  // 4) Audit (Actor = System/NULL)
  await supabase.rpc("log_audit", {
    p_action: "message.inbound_received",
    p_entity_type: "ticket",
    p_entity_id: ticketId,
    p_metadata: { from: mail.from },
  });

  return NextResponse.json({ ok: true, ticket_id: ticketId });
}
