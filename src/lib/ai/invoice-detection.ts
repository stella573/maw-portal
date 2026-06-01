import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { isSupportedAttachment } from "@/lib/ai/invoice-types";

/**
 * KI-Rechnungserkennung für Anhänge (Claude, multimodal).
 *
 * Läuft AUSSCHLIESSLICH serverseitig (`server-only`): Der Anthropic-API-Key
 * darf niemals in den Browser gelangen. Die Funktion bekommt die rohen Bytes
 * eines Anhangs und liefert ein normalisiertes Ergebnis, ob es sich um eine
 * Rechnung handelt – inkl. extrahierter Eckdaten.
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

/**
 * Exakte Aufgabenstellung für die KI (vorgegeben). Wird unverändert als
 * Prompt verwendet – kurz gehalten, um Kosten/Latenz gering zu halten.
 */
const TASK_PROMPT = `Du analysierst einen hochgeladenen Anhang und entscheidest, ob es sich um eine Rechnung handelt.

Eine Rechnung enthält typischerweise mehrere der folgenden Merkmale:
- Rechnungsnummer
- Rechnungsdatum
- Lieferant oder Firma
- Empfänger/Kunde
- Leistungsbeschreibung oder Artikelpositionen
- Nettobetrag, Steuerbetrag, Bruttobetrag
- Zahlungsinformationen
- Begriffe wie Rechnung, Invoice, Tax Invoice, Zahlungsziel, USt, VAT

Antworte ausschließlich als valides JSON im folgenden Format:

{
  "is_invoice": true,
  "confidence": 0.0,
  "classification": "invoice",
  "reason": "Kurze Begründung auf Deutsch",
  "invoice_number": null,
  "invoice_date": null,
  "vendor_name": null,
  "total_amount": null,
  "currency": null
}

Regeln:
- \`is_invoice\` ist true, wenn es sehr wahrscheinlich eine Rechnung ist.
- \`confidence\` ist eine Zahl von 0 bis 1.
- \`classification\` ist einer von:
  - "invoice"
  - "not_invoice"
  - "unclear"
- Wenn du unsicher bist, nutze "unclear" und confidence unter 0.7.
- Gib kein Markdown zurück.
- Gib keine Erklärung außerhalb des JSON zurück.`;

/** Fehler, der ein nicht parsebares/ungültiges KI-Ergebnis kennzeichnet. */
export class InvalidAiResponseError extends Error {
  constructor(
    message: string,
    public readonly raw: string,
  ) {
    super(message);
    this.name = "InvalidAiResponseError";
  }
}

export interface DetectionInput {
  fileName: string;
  contentType: string | null;
  bytes: Uint8Array;
}

export interface DetectionResult {
  isInvoice: boolean;
  confidence: number;
  classification: "invoice" | "not_invoice" | "unclear";
  reason: string;
  invoiceNumber: string | null;
  invoiceDate: string | null; // normalisiert auf YYYY-MM-DD (oder null)
  vendorName: string | null;
  totalAmount: number | null;
  currency: string | null;
  /** Geparste Roh-JSON-Antwort der KI (zur Speicherung/Diagnose). */
  raw: unknown;
}

/** Lenientes Schema der erwarteten KI-JSON-Antwort. */
const aiSchema = z.object({
  is_invoice: z.coerce.boolean().optional(),
  confidence: z.coerce.number().optional(),
  classification: z.string().optional(),
  reason: z.string().optional(),
  invoice_number: z.union([z.string(), z.number()]).nullish(),
  invoice_date: z.union([z.string(), z.number()]).nullish(),
  vendor_name: z.union([z.string(), z.number()]).nullish(),
  total_amount: z.union([z.string(), z.number()]).nullish(),
  currency: z.union([z.string(), z.number()]).nullish(),
});

/** MIME-Typ für die Anthropic-Bild-/Dokument-Quelle bestimmen. */
function resolveMedia(
  fileName: string,
  contentType: string | null,
): { kind: "image" | "pdf"; mediaType: string } | null {
  const mime = (contentType ?? "").toLowerCase().split(";")[0]?.trim() ?? "";
  const ext = fileName.toLowerCase().split(".").pop() ?? "";

  if (mime === "application/pdf" || ext === "pdf") {
    return { kind: "pdf", mediaType: "application/pdf" };
  }
  if (mime === "image/png" || ext === "png") {
    return { kind: "image", mediaType: "image/png" };
  }
  if (mime === "image/webp" || ext === "webp") {
    return { kind: "image", mediaType: "image/webp" };
  }
  if (
    mime === "image/jpeg" ||
    mime === "image/jpg" ||
    ext === "jpg" ||
    ext === "jpeg"
  ) {
    return { kind: "image", mediaType: "image/jpeg" };
  }
  return null;
}

/** Normalisiert ein KI-Datum (diverse Formate) auf YYYY-MM-DD oder null. */
function coerceDate(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  // Bereits ISO (YYYY-MM-DD…)?
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // Deutsches Format DD.MM.YYYY
  const de = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (de) {
    const d = de[1]!.padStart(2, "0");
    const m = de[2]!.padStart(2, "0");
    return `${de[3]}-${m}-${d}`;
  }
  // Fallback: vom Date-Parser interpretieren lassen.
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

/** Coerced einen Betrag (Zahl oder String mit Tausender-/Dezimaltrennern). */
function coerceAmount(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let s = String(value).trim();
  if (!s) return null;
  // Währungssymbole/Buchstaben entfernen, Trennzeichen normalisieren.
  s = s.replace(/[^\d.,-]/g, "");
  if (s.includes(",") && s.includes(".")) {
    // Letztes Trennzeichen ist das Dezimaltrennzeichen.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function nonEmptyString(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

/**
 * Analysiert einen Anhang und entscheidet, ob es sich um eine Rechnung handelt.
 *
 * Wirft `InvalidAiResponseError`, wenn die KI keine valide JSON-Antwort liefert
 * (→ vom Aufrufer als Fehler zu speichern). Liefert sonst ein normalisiertes
 * Ergebnis. Nicht unterstützte Dateitypen sollten vom Aufrufer vorab über
 * `isSupportedAttachment()` abgefangen werden; defensiv wird hier zusätzlich
 * geprüft.
 */
export async function detectInvoice(
  input: DetectionInput,
): Promise<DetectionResult> {
  if (!isSupportedAttachment(input.fileName, input.contentType)) {
    throw new Error("UNSUPPORTED_FILE_TYPE");
  }
  const media = resolveMedia(input.fileName, input.contentType);
  if (!media) {
    throw new Error("UNSUPPORTED_FILE_TYPE");
  }

  const client = getClient();
  const data = Buffer.from(input.bytes).toString("base64");

  const fileBlock: Anthropic.ContentBlockParam =
    media.kind === "pdf"
      ? {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data },
        }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type: media.mediaType as "image/jpeg" | "image/png" | "image/webp",
            data,
          },
        };

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    // Optimierung: Bei PDFs reichen die ersten Seiten – Hinweis im System-Prompt.
    system:
      "Du bist ein präziser Dokument-Klassifikator. Bei mehrseitigen PDFs " +
      "genügt es, die ersten 1–3 Seiten zu betrachten, da Rechnungen dort " +
      "erkennbar sind. Antworte ausschließlich mit dem geforderten JSON.",
    messages: [
      {
        role: "user",
        content: [
          fileBlock,
          { type: "text", text: TASK_PROMPT },
        ],
      },
    ],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  const parsed = parseJson(text);
  const result = aiSchema.safeParse(parsed);
  if (!result.success) {
    throw new InvalidAiResponseError(
      "KI-Antwort entspricht nicht dem erwarteten Schema.",
      text,
    );
  }

  const d = result.data;
  const allowed = ["invoice", "not_invoice", "unclear"] as const;
  const classification = (allowed as readonly string[]).includes(
    d.classification ?? "",
  )
    ? (d.classification as DetectionResult["classification"])
    : "unclear";

  let confidence = typeof d.confidence === "number" ? d.confidence : 0;
  if (!Number.isFinite(confidence)) confidence = 0;
  confidence = Math.min(1, Math.max(0, confidence));

  return {
    isInvoice: d.is_invoice === true && classification === "invoice",
    confidence,
    classification,
    reason: nonEmptyString(d.reason) ?? "",
    invoiceNumber: nonEmptyString(d.invoice_number),
    invoiceDate: coerceDate(d.invoice_date),
    vendorName: nonEmptyString(d.vendor_name),
    totalAmount: coerceAmount(d.total_amount),
    currency: nonEmptyString(d.currency)?.toUpperCase().slice(0, 8) ?? null,
    raw: parsed,
  };
}

/** Extrahiert JSON aus der Antwort (toleriert versehentliche Code-Fences). */
function parseJson(text: string): unknown {
  const cleaned = text
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Fallback: erstes {...}-Objekt herausschneiden.
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        throw new InvalidAiResponseError("Antwort ist kein valides JSON.", text);
      }
    }
    throw new InvalidAiResponseError("Antwort ist kein valides JSON.", text);
  }
}
