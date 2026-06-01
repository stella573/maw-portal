import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { resolveMedia, buildFileBlock } from "@/lib/ai/attachment-media";
import type { InvoiceClassification } from "@/lib/ai/invoice-types";

/**
 * KI-Rechnungsverarbeitung mit Claude (multimodal, Tool-Use für zuverlässiges,
 * striktes JSON). Läuft ausschließlich serverseitig (`server-only`) – der
 * Anthropic-API-Key gelangt nie in den Browser.
 *
 * Zweistufige Modellstrategie (Kostenoptimierung):
 *   Stufe 1: Haiku (oder ANTHROPIC_MODEL-Override) – Rechnung ja/nein + Basisdaten.
 *   Stufe 2: Sonnet – nur bei Unsicherheit (confidence < 0.85) oder erzwungen.
 */

const HAIKU = "claude-haiku-4-5";
const SONNET = "claude-sonnet-4-6";
const ESCALATE_BELOW = 0.85;

let cached: Anthropic | null = null;
function getClient(): Anthropic {
  const { ANTHROPIC_API_KEY } = getServerEnv();
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY ist nicht gesetzt.");
  if (!cached) cached = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  return cached;
}

/** Stufe-1-Modell (Env-Override möglich), Stufe-2 ist immer Sonnet. */
function stage1Model(): string {
  const { ANTHROPIC_MODEL } = getServerEnv();
  return ANTHROPIC_MODEL?.trim() || HAIKU;
}

const SYSTEM_PROMPT = `Du bist ein spezialisierter Assistent für Rechnungsverarbeitung, Buchhaltungsautomatisierung und Lieferantenerkennung.

Deine Aufgabe:
Analysiere hochgeladene Anhänge wie PDFs oder Bilder. Entscheide, ob es sich um eine Rechnung handelt. Wenn ja, extrahiere die Rechnungsdaten so vollständig und exakt wie möglich.

Arbeite streng datenorientiert.
Erfinde keine Informationen.
Wenn ein Wert nicht eindeutig im Dokument steht, gib null zurück.
Wenn du unsicher bist, nutze eine niedrigere Confidence.
Antworte ausschließlich als valides JSON.
Gib kein Markdown zurück.
Gib keine Erklärung außerhalb des JSON zurück.`;

const USER_PROMPT = `Analysiere diesen Anhang und entscheide, ob es sich um eine Rechnung handelt.

Eine Rechnung enthält typischerweise mehrere der folgenden Merkmale:
- Rechnungsnummer
- Rechnungsdatum
- Lieferant oder Firma
- Empfänger oder Kunde
- Leistungsbeschreibung oder Artikelpositionen
- Nettobetrag
- Steuerbetrag
- Bruttobetrag
- Zahlungsinformationen
- Begriffe wie Rechnung, Invoice, Tax Invoice, Zahlungsziel, VAT, USt, MwSt

Extrahiere alle erkennbaren Daten.

Regeln:
- is_invoice ist true, wenn es sehr wahrscheinlich eine Rechnung ist.
- confidence ist eine Zahl zwischen 0 und 1.
- classification ist einer von: "invoice", "not_invoice", "unclear".
- Wenn du unsicher bist, nutze "unclear" und confidence unter 0.7.
- Datumswerte im Format YYYY-MM-DD zurückgeben.
- Beträge als Zahlen zurückgeben, nicht als formatierte Strings.
- Währung als ISO-Code zurückgeben, zum Beispiel EUR, USD, GBP.
- Wenn ein Wert nicht eindeutig erkennbar ist, nutze null.
- Erfinde keine Daten.

Gib das Ergebnis ausschließlich über das Tool "record_invoice_analysis" zurück.`;

/** Tool-Schema (strenges JSON) – erzwingt zuverlässig parsebare Ausgaben. */
const nullableString = { type: ["string", "null"] as const };
const nullableNumber = { type: ["number", "null"] as const };

const TOOL: Anthropic.Tool = {
  name: "record_invoice_analysis",
  description:
    "Erfasst das Ergebnis der Rechnungsanalyse als strukturierte Daten.",
  input_schema: {
    type: "object",
    properties: {
      is_invoice: { type: "boolean" },
      confidence: { type: "number" },
      classification: { type: "string", enum: ["invoice", "not_invoice", "unclear"] },
      reason: { type: "string" },
      vendor: {
        type: "object",
        properties: {
          name: nullableString,
          address: nullableString,
          vat_id: nullableString,
          tax_number: nullableString,
          iban: nullableString,
          email: nullableString,
          website: nullableString,
          country: nullableString,
        },
      },
      invoice: {
        type: "object",
        properties: {
          invoice_number: nullableString,
          invoice_date: nullableString,
          service_date: nullableString,
          due_date: nullableString,
          currency: nullableString,
          net_amount: nullableNumber,
          tax_amount: nullableNumber,
          gross_amount: nullableNumber,
          customer_number: nullableString,
          order_reference: nullableString,
          description: nullableString,
          payment_status: nullableString,
          language: nullableString,
        },
      },
      line_items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: nullableString,
            quantity: nullableNumber,
            unit_price: nullableNumber,
            net_amount: nullableNumber,
            tax_rate: nullableNumber,
            gross_amount: nullableNumber,
          },
        },
      },
    },
    required: ["is_invoice", "confidence", "classification"],
  } as Anthropic.Tool.InputSchema,
};

export class InvalidAiResponseError extends Error {
  constructor(message: string, public readonly raw: unknown) {
    super(message);
    this.name = "InvalidAiResponseError";
  }
}

export interface ExtractionResult {
  isInvoice: boolean;
  confidence: number;
  classification: InvoiceClassification; // hier nur invoice|not_invoice|unclear
  reason: string;
  vendor: {
    name: string | null;
    address: string | null;
    vatId: string | null;
    taxNumber: string | null;
    iban: string | null;
    email: string | null;
    website: string | null;
    country: string | null;
  };
  invoice: {
    invoiceNumber: string | null;
    invoiceDate: string | null;
    serviceDate: string | null;
    dueDate: string | null;
    currency: string | null;
    netAmount: number | null;
    taxAmount: number | null;
    grossAmount: number | null;
    customerNumber: string | null;
    orderReference: string | null;
    description: string | null;
    paymentStatus: string | null;
    language: string | null;
  };
  lineItems: {
    description: string | null;
    quantity: number | null;
    unit_price: number | null;
    net_amount: number | null;
    tax_rate: number | null;
    gross_amount: number | null;
  }[];
  modelUsed: string;
  raw: unknown;
}

export interface ExtractionInput {
  fileName: string;
  contentType: string | null;
  bytes: Uint8Array;
  /** Erzwingt Stufe 2 (Sonnet) – z. B. bei manueller Nachprüfung. */
  forceHighQuality?: boolean;
}

const toolInputSchema = z.object({
  is_invoice: z.coerce.boolean().optional(),
  confidence: z.coerce.number().optional(),
  classification: z.string().optional(),
  reason: z.string().optional(),
  vendor: z.record(z.string(), z.unknown()).optional(),
  invoice: z.record(z.string(), z.unknown()).optional(),
  line_items: z.array(z.record(z.string(), z.unknown())).optional(),
});

/**
 * Führt die (zweistufige) KI-Extraktion aus. Wirft `InvalidAiResponseError`,
 * wenn keine verwertbare Tool-Antwort kommt.
 */
export async function extractInvoice(
  input: ExtractionInput,
): Promise<ExtractionResult> {
  const media = resolveMedia(input.fileName, input.contentType);
  if (!media) throw new Error("UNSUPPORTED_FILE_TYPE");

  const fileBlock = buildFileBlock(media, input.bytes);

  // Stufe 1 (oder direkt Sonnet bei forceHighQuality).
  const firstModel = input.forceHighQuality ? SONNET : stage1Model();
  let result = await callClaude(firstModel, fileBlock);

  // Stufe 2: bei Unsicherheit auf Sonnet hochstufen (sofern nicht schon Sonnet).
  if (
    !input.forceHighQuality &&
    firstModel !== SONNET &&
    result.isInvoice &&
    result.confidence < ESCALATE_BELOW
  ) {
    try {
      result = await callClaude(SONNET, fileBlock);
    } catch {
      // Eskalation fehlgeschlagen → Stufe-1-Ergebnis behalten.
    }
  }

  return result;
}

async function callClaude(
  model: string,
  fileBlock: Anthropic.ContentBlockParam,
): Promise<ExtractionResult> {
  const client = getClient();
  const message = await client.messages.create({
    model,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [{ role: "user", content: [fileBlock, { type: "text", text: USER_PROMPT }] }],
  });

  const toolUse = message.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === TOOL.name,
  );
  if (!toolUse) {
    throw new InvalidAiResponseError("Keine Tool-Antwort der KI erhalten.", message.content);
  }

  const parsed = toolInputSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new InvalidAiResponseError("Tool-Antwort entspricht nicht dem Schema.", toolUse.input);
  }
  return normalize(parsed.data, model, toolUse.input);
}

function normalize(
  d: z.infer<typeof toolInputSchema>,
  model: string,
  raw: unknown,
): ExtractionResult {
  const allowed = ["invoice", "not_invoice", "unclear"] as const;
  const classification = (allowed as readonly string[]).includes(d.classification ?? "")
    ? (d.classification as ExtractionResult["classification"])
    : "unclear";

  let confidence = typeof d.confidence === "number" ? d.confidence : 0;
  if (!Number.isFinite(confidence)) confidence = 0;
  confidence = Math.min(1, Math.max(0, confidence));

  const v = (d.vendor ?? {}) as Record<string, unknown>;
  const inv = (d.invoice ?? {}) as Record<string, unknown>;
  const items = Array.isArray(d.line_items) ? d.line_items : [];

  return {
    isInvoice: d.is_invoice === true && classification === "invoice",
    confidence,
    classification,
    reason: str(d.reason) ?? "",
    vendor: {
      name: str(v.name),
      address: str(v.address),
      vatId: normalizeId(str(v.vat_id)),
      taxNumber: normalizeId(str(v.tax_number)),
      iban: normalizeId(str(v.iban)),
      email: str(v.email)?.toLowerCase() ?? null,
      website: str(v.website),
      country: str(v.country),
    },
    invoice: {
      invoiceNumber: str(inv.invoice_number),
      invoiceDate: date(inv.invoice_date),
      serviceDate: date(inv.service_date),
      dueDate: date(inv.due_date),
      currency: str(inv.currency)?.toUpperCase().slice(0, 8) ?? null,
      netAmount: num(inv.net_amount),
      taxAmount: num(inv.tax_amount),
      grossAmount: num(inv.gross_amount),
      customerNumber: str(inv.customer_number),
      orderReference: str(inv.order_reference),
      description: str(inv.description),
      paymentStatus: str(inv.payment_status),
      language: str(inv.language),
    },
    lineItems: items.map((it) => {
      const o = it as Record<string, unknown>;
      return {
        description: str(o.description),
        quantity: num(o.quantity),
        unit_price: num(o.unit_price),
        net_amount: num(o.net_amount),
        tax_rate: num(o.tax_rate),
        gross_amount: num(o.gross_amount),
      };
    }),
    modelUsed: model,
    raw,
  };
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 && s.toLowerCase() !== "null" ? s : null;
}

/** Entfernt Leerzeichen aus IDs (USt-ID, Steuernr., IBAN) für sauberen Vergleich. */
function normalizeId(v: string | null): string | null {
  if (!v) return null;
  return v.replace(/\s+/g, "").toUpperCase();
}

function num(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  if (!s) return null;
  s = s.replace(/[^\d.,-]/g, "");
  if (s.includes(",") && s.includes(".")) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function date(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const de = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (de) return `${de[3]}-${de[2]!.padStart(2, "0")}-${de[1]!.padStart(2, "0")}`;
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}
