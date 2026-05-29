import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/services/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { suggestReply } from "@/lib/ai/claude";

/**
 * KI-Antwortvorschlag (Claude). Erzeugt NUR einen Entwurf, der dem Agenten im
 * Editor angeboten wird – kein automatischer Versand.
 *
 * Pipeline: Auth → Permission (tickets.reply) → Verlauf laden → Claude → Text.
 */
export const runtime = "nodejs";

const schema = z.object({ ticketId: z.string().uuid() });

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 422 });
  }

  const supabase = await createClient();

  const { data: ticket } = await supabase
    .from("tickets")
    .select("id, subject, location_id, customers(full_name), mailboxes(name)")
    .eq("id", parsed.data.ticketId)
    .single();

  if (!ticket) {
    return NextResponse.json({ error: "Ticket nicht gefunden" }, { status: 404 });
  }
  if (!can(user, "tickets.reply", ticket.location_id)) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }

  const { data: messages } = await supabase
    .from("messages")
    .select("direction, body_text, body_html")
    .eq("ticket_id", ticket.id)
    .eq("is_draft", false)
    .order("created_at", { ascending: true });

  const conversation = (messages ?? [])
    .map((m) => ({
      role: (m.direction === "inbound" ? "customer" : "agent") as
        | "customer"
        | "agent",
      text: (m.body_text && m.body_text.trim())
        ? m.body_text
        : stripHtml(m.body_html),
    }))
    .filter((m) => m.text.length > 0);

  if (conversation.length === 0) {
    return NextResponse.json(
      { error: "Kein Verlauf vorhanden, auf den geantwortet werden kann." },
      { status: 422 },
    );
  }

  const customer = ticket.customers as unknown as {
    full_name: string | null;
  } | null;
  const mailbox = ticket.mailboxes as unknown as { name: string } | null;

  try {
    const suggestion = await suggestReply({
      conversation,
      context: [
        `Betreff: ${ticket.subject}`,
        customer?.full_name ? `Kundenname: ${customer.full_name}` : null,
        mailbox?.name ? `Postfach/Bereich: ${mailbox.name}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    });
    return NextResponse.json({ ok: true, suggestion });
  } catch (err) {
    console.error("[mail/suggest]", err);
    return NextResponse.json(
      { error: "KI-Vorschlag fehlgeschlagen (ANTHROPIC_API_KEY gesetzt?)." },
      { status: 502 },
    );
  }
}

function stripHtml(html: string | null): string {
  if (!html) return "";
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|tr|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+\n/g, "\n")
    .trim();
}
