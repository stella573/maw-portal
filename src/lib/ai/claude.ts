import Anthropic from "@anthropic-ai/sdk";
import { getServerEnv } from "@/lib/env";

/**
 * Claude-Client für KI-Antwortvorschläge im MailDesk.
 *
 * WICHTIG: Claude erzeugt ausschließlich VORSCHLÄGE (Entwürfe). Es findet
 * NIEMALS ein automatischer Versand statt – ein Mensch muss jeden Entwurf
 * prüfen und manuell senden.
 */
const MODEL = "claude-sonnet-4-6";

let cached: Anthropic | null = null;

function getClient(): Anthropic {
  const { ANTHROPIC_API_KEY } = getServerEnv();
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY ist nicht gesetzt.");
  }
  if (!cached) cached = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  return cached;
}

export interface SuggestReplyInput {
  /** Bisheriger Mailverlauf (chronologisch). */
  conversation: { role: "customer" | "agent"; text: string }[];
  /** Optionaler Kontext (Kundenname, Standort, Tonalität). */
  context?: string;
}

/**
 * Erzeugt einen Antwortvorschlag. Gibt reinen Text zurück – Versand erfolgt
 * NICHT hier, sondern erst nach menschlicher Freigabe über Resend.
 */
export async function suggestReply(input: SuggestReplyInput): Promise<string> {
  const client = getClient();

  const transcript = input.conversation
    .map((m) => `${m.role === "customer" ? "Kunde" : "Support"}: ${m.text}`)
    .join("\n\n");

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system:
      "Du bist ein Support-Assistent der Mining Adventure World (Freizeit-/Erlebnisunternehmen). " +
      "Formuliere höfliche, professionelle, hilfreiche Antwortvorschläge auf Deutsch. " +
      "Erfinde keine Fakten. Wenn Informationen fehlen, weise darauf hin. " +
      "Gib NUR den Antworttext aus, ohne Vorbemerkungen." +
      (input.context ? `\n\nKontext: ${input.context}` : ""),
    messages: [
      {
        role: "user",
        content: `Hier ist der bisherige Verlauf:\n\n${transcript}\n\nErstelle einen Antwortvorschlag an den Kunden.`,
      },
    ],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return text;
}
