import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/services/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { getResend, getFromEmail } from "@/lib/resend/client";
import { logAudit } from "@/lib/audit/log";

/**
 * Ausgehende Antwort über Resend.
 *
 * Sicherheits-Pipeline: Auth → Validierung → Permission (tickets.reply am
 * Ticket-Standort) → Versand → Nachricht speichern → Audit.
 *
 * KI-Vorschläge werden NIE automatisch versendet – dieser Endpunkt wird nur
 * durch eine bewusste Nutzeraktion ausgelöst.
 */

export const runtime = "nodejs";

const bodySchema = z.object({
  ticketId: z.string().uuid(),
  to: z.string().email(),
  subject: z.string().min(1),
  bodyText: z.string().min(1),
  bodyHtml: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 422 });
  }
  const input = parsed.data;

  const supabase = await createClient();

  // Ticket inkl. Standort laden (RLS schützt – nur sichtbare Tickets)
  const { data: ticket, error: ticketErr } = await supabase
    .from("tickets")
    .select("id, location_id")
    .eq("id", input.ticketId)
    .single();

  if (ticketErr || !ticket) {
    return NextResponse.json({ error: "Ticket nicht gefunden" }, { status: 404 });
  }

  // Permission-Prüfung am Standort des Tickets
  if (!can(user, "tickets.reply", ticket.location_id)) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }

  // Versand
  let providerId: string | null = null;
  try {
    const resend = getResend();
    const { data, error } = await resend.emails.send({
      from: getFromEmail(),
      to: input.to,
      subject: input.subject,
      text: input.bodyText,
      html: input.bodyHtml,
    });
    if (error) throw new Error(error.message);
    providerId = data?.id ?? null;
  } catch (err) {
    console.error("[mail/send] Versand fehlgeschlagen:", err);
    return NextResponse.json({ error: "Versand fehlgeschlagen" }, { status: 502 });
  }

  // Ausgehende Nachricht speichern
  const { error: msgErr } = await supabase.from("messages").insert({
    ticket_id: ticket.id,
    direction: "outbound",
    channel: "email",
    author_id: user.profileId,
    to_email: input.to,
    subject: input.subject,
    body_text: input.bodyText,
    body_html: input.bodyHtml ?? null,
    provider_id: providerId,
    is_draft: false,
  });
  if (msgErr) {
    console.error("[mail/send] message insert:", msgErr.message);
    return NextResponse.json({ error: "Nachricht konnte nicht gespeichert werden" }, { status: 500 });
  }

  await logAudit({
    action: "message.reply_sent",
    entityType: "ticket",
    entityId: ticket.id,
    locationId: ticket.location_id,
    metadata: { to: input.to, provider_id: providerId },
  });

  return NextResponse.json({ ok: true, provider_id: providerId });
}
