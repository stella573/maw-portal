import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/services/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { getResend, getFromEmail } from "@/lib/resend/client";
import { renderEmailHtml } from "@/lib/resend/email-template";
import { logAudit } from "@/lib/audit/log";

/**
 * Ausgehende Antwort über Resend.
 *
 * Sicherheits-Pipeline: Auth → Validierung → Permission (tickets.reply am
 * Ticket-Standort) → Versand → Nachricht speichern → Audit.
 *
 * Absenderadresse = Adresse des Postfachs (pro Postfach), Fallback auf die
 * globale RESEND_FROM_EMAIL. Die Ticket-Referenz wird in den Betreff gesetzt,
 * damit eingehende Antworten dem Ticket zugeordnet werden (Threading).
 *
 * KI-Vorschläge werden NIE automatisch versendet – dieser Endpunkt wird nur
 * durch eine bewusste Nutzeraktion ausgelöst.
 */

export const runtime = "nodejs";

const bodySchema = z.object({
  ticketId: z.string().uuid(),
  bodyText: z.string().min(1),
  attachmentIds: z.array(z.string().uuid()).max(10).optional(),
});

/** Stellt sicher, dass die Ticket-Referenz im Betreff steht (Threading). */
function subjectWithReference(subject: string, reference: string): string {
  if (subject.includes(reference)) return subject;
  const base = subject.replace(/^(re:\s*)+/i, "").trim();
  return `Re: ${base} [${reference}]`;
}

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

  // Ticket inkl. Standort, Postfach und Kunde laden (RLS schützt).
  const { data: ticket, error: ticketErr } = await supabase
    .from("tickets")
    .select(
      "id, reference, subject, location_id, customers(email), mailboxes(name, email)",
    )
    .eq("id", input.ticketId)
    .single();

  if (ticketErr || !ticket) {
    return NextResponse.json({ error: "Ticket nicht gefunden" }, { status: 404 });
  }

  // Permission-Prüfung am Standort des Tickets
  if (!can(user, "tickets.reply", ticket.location_id)) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }

  const customer = ticket.customers as unknown as { email: string } | null;
  const mailbox = ticket.mailboxes as unknown as {
    name: string;
    email: string;
  } | null;

  const to = customer?.email;
  if (!to) {
    return NextResponse.json(
      { error: "Kein Empfänger (Kunde ohne E-Mail)" },
      { status: 422 },
    );
  }

  // Absender = Postfach-Adresse (mit Anzeigename), sonst globaler Fallback.
  let from: string;
  try {
    from = mailbox?.email
      ? `${mailbox.name} <${mailbox.email}>`
      : getFromEmail();
  } catch {
    return NextResponse.json(
      { error: "Keine Absenderadresse konfiguriert (Postfach oder RESEND_FROM_EMAIL)" },
      { status: 503 },
    );
  }

  // Persönliche Signatur der/des Absendenden (für den Mailversand).
  const { data: senderProfile } = await supabase
    .from("profiles")
    .select("signature_html")
    .eq("id", user.profileId)
    .maybeSingle();
  const signatureHtml = senderProfile?.signature_html ?? null;

  const subject = subjectWithReference(ticket.subject, ticket.reference);
  // Schlichtes HTML für die In-App-Ansicht (Verlauf), volles MAW-Template für
  // den tatsächlichen Mailversand. Die Signatur wird unter den Text gesetzt.
  const bodyHtml = `<div style="white-space:pre-wrap">${escapeHtml(input.bodyText)}</div>`;
  const emailHtml = renderEmailHtml(input.bodyText, signatureHtml);

  // Vorab hochgeladene Anhänge laden (nur solche dieses Tickets, noch ohne
  // message_id). Inhalt aus Storage holen, um ihn an die Mail zu hängen.
  const attachmentRows: { id: string; storage_path: string; file_name: string }[] = [];
  const resendAttachments: { filename: string; content: Buffer }[] = [];
  if (input.attachmentIds && input.attachmentIds.length > 0) {
    const { data: atts } = await supabase
      .from("attachments")
      .select("id, storage_path, file_name")
      .in("id", input.attachmentIds)
      .eq("ticket_id", ticket.id)
      .is("message_id", null);
    for (const a of atts ?? []) {
      const { data: blob, error: dlErr } = await supabase.storage
        .from("mail-attachments")
        .download(a.storage_path);
      if (dlErr || !blob) {
        console.error("[mail/send] attachment download:", dlErr?.message);
        continue;
      }
      const buf = Buffer.from(await blob.arrayBuffer());
      resendAttachments.push({ filename: a.file_name, content: buf });
      attachmentRows.push(a);
    }
  }

  // Versand
  let providerId: string | null = null;
  try {
    const resend = getResend();
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      text: input.bodyText,
      html: emailHtml,
      ...(mailbox?.email ? { replyTo: mailbox.email } : {}),
      ...(resendAttachments.length > 0 ? { attachments: resendAttachments } : {}),
    });
    if (error) throw new Error(error.message);
    providerId = data?.id ?? null;
  } catch (err) {
    console.error("[mail/send] Versand fehlgeschlagen:", err);
    return NextResponse.json({ error: "Versand fehlgeschlagen" }, { status: 502 });
  }

  // Ausgehende Nachricht speichern
  const { data: outMsg, error: msgErr } = await supabase
    .from("messages")
    .insert({
      ticket_id: ticket.id,
      direction: "outbound",
      channel: "email",
      author_id: user.profileId,
      from_email: mailbox?.email ?? null,
      to_email: to,
      subject,
      body_text: input.bodyText,
      body_html: bodyHtml,
      provider_id: providerId,
      is_draft: false,
    })
    .select("id")
    .single();
  if (msgErr || !outMsg) {
    console.error("[mail/send] message insert:", msgErr?.message);
    return NextResponse.json({ error: "Nachricht konnte nicht gespeichert werden" }, { status: 500 });
  }

  // Gesendete Anhänge der neuen Nachricht zuordnen.
  if (attachmentRows.length > 0) {
    await supabase
      .from("attachments")
      .update({ message_id: outMsg.id })
      .in(
        "id",
        attachmentRows.map((a) => a.id),
      );
  }

  // Ticket auf "wartend" setzen (Antwort raus → wir warten auf Kunde).
  await supabase.from("tickets").update({ status: "pending" }).eq("id", ticket.id);

  await logAudit({
    action: "message.reply_sent",
    entityType: "ticket",
    entityId: ticket.id,
    locationId: ticket.location_id,
    metadata: { to, provider_id: providerId },
  });

  return NextResponse.json({ ok: true, provider_id: providerId });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
