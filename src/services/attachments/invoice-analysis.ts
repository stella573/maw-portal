import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  detectInvoice,
  InvalidAiResponseError,
} from "@/lib/ai/invoice-detection";
import { isSupportedAttachment, type AttachmentAnalysis } from "@/lib/ai/invoice-types";
import type { Tables, Json } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Orchestriert die KI-Analyse eines Anhangs und persistiert das Ergebnis.
 *
 * - Läuft ausschließlich serverseitig (Service-Role), nie aus dem Browser.
 * - Cached: pro Anhang existiert höchstens EINE Analyse (UNIQUE attachment_id).
 *   Ein bereits abgeschlossenes Ergebnis wird ohne erneuten KI-Aufruf
 *   zurückgegeben (außer `force`).
 * - Robust: Fehler (KI nicht erreichbar / ungültige Antwort) werden als
 *   `status='error'` / `classification='error'` gespeichert – die App läuft
 *   weiter.
 */

type AnalysisRow = Tables<"attachment_ai_analysis">;

const BUCKET = "mail-attachments";
// Sicherheitslimit fürs Senden an die KI (sehr große Dateien überspringen).
const MAX_ANALYZE_BYTES = 20 * 1024 * 1024; // 20 MB

export function mapAnalysisRow(row: AnalysisRow): AttachmentAnalysis {
  return {
    id: row.id,
    attachmentId: row.attachment_id,
    status: row.status,
    isInvoice: row.is_invoice,
    confidence: Number(row.confidence ?? 0),
    classification: row.classification,
    reason: row.reason,
    invoiceNumber: row.extracted_invoice_number,
    invoiceDate: row.extracted_invoice_date,
    vendorName: row.extracted_vendor_name,
    totalAmount:
      row.extracted_total_amount == null
        ? null
        : Number(row.extracted_total_amount),
    currency: row.extracted_currency,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class AttachmentNotFoundError extends Error {
  constructor() {
    super("Anhang nicht gefunden.");
    this.name = "AttachmentNotFoundError";
  }
}

/**
 * Führt (oder liest aus dem Cache) die KI-Analyse eines Anhangs aus und gibt
 * das gespeicherte Ergebnis zurück.
 */
export async function runAttachmentAnalysis(
  attachmentId: string,
  opts: { force?: boolean } = {},
): Promise<AttachmentAnalysis> {
  const admin = createAdminClient();

  const { data: attachment } = await admin
    .from("attachments")
    .select("id, storage_path, file_name, content_type")
    .eq("id", attachmentId)
    .maybeSingle();

  if (!attachment) {
    throw new AttachmentNotFoundError();
  }

  // Cache: bereits abgeschlossene Analyse ohne `force` direkt zurückgeben.
  if (!opts.force) {
    const { data: existing } = await admin
      .from("attachment_ai_analysis")
      .select("*")
      .eq("attachment_id", attachmentId)
      .maybeSingle();
    if (existing && existing.status === "completed") {
      return mapAnalysisRow(existing);
    }
  }

  // Status auf "processing" setzen (nur diese Spalte ändern, bisheriges
  // Ergebnis während einer Re-Analyse erhalten).
  await admin
    .from("attachment_ai_analysis")
    .upsert(
      { attachment_id: attachmentId, status: "processing" },
      { onConflict: "attachment_id" },
    );

  // Nicht unterstützte Dateitypen überspringen.
  if (!isSupportedAttachment(attachment.file_name, attachment.content_type)) {
    return finalize(admin, attachmentId, {
      status: "completed",
      is_invoice: false,
      confidence: 0,
      classification: "unsupported_file_type",
      reason: "Dateityp wird nicht unterstützt (nur PDF, JPG, JPEG, PNG, WEBP).",
      extracted_invoice_number: null,
      extracted_invoice_date: null,
      extracted_vendor_name: null,
      extracted_total_amount: null,
      extracted_currency: null,
      raw_ai_response: null,
    });
  }

  // Datei aus dem privaten Bucket laden (Service-Role).
  const { data: blob, error: dlErr } = await admin.storage
    .from(BUCKET)
    .download(attachment.storage_path);
  if (dlErr || !blob) {
    console.error("[invoice-analysis] download:", dlErr?.message);
    return finalize(admin, attachmentId, errorPayload("Datei konnte nicht geladen werden."));
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.byteLength > MAX_ANALYZE_BYTES) {
    return finalize(admin, attachmentId, errorPayload("Datei zu groß für die KI-Analyse."));
  }

  try {
    const result = await detectInvoice({
      fileName: attachment.file_name,
      contentType: attachment.content_type,
      bytes,
    });
    return finalize(admin, attachmentId, {
      status: "completed",
      is_invoice: result.isInvoice,
      confidence: result.confidence,
      classification: result.classification,
      reason: result.reason || null,
      extracted_invoice_number: result.invoiceNumber,
      extracted_invoice_date: result.invoiceDate,
      extracted_vendor_name: result.vendorName,
      extracted_total_amount: result.totalAmount,
      extracted_currency: result.currency,
      raw_ai_response: (result.raw ?? null) as Json,
    });
  } catch (err) {
    if (err instanceof InvalidAiResponseError) {
      console.error("[invoice-analysis] ungültige KI-Antwort:", err.message);
      return finalize(admin, attachmentId, {
        ...errorPayload("Die KI lieferte keine gültige JSON-Antwort."),
        raw_ai_response: { error: "invalid_json", raw_text: err.raw } as Json,
      });
    }
    console.error("[invoice-analysis] KI-Fehler:", err);
    return finalize(
      admin,
      attachmentId,
      errorPayload("KI-Analyse fehlgeschlagen (KI nicht erreichbar?)."),
    );
  }
}

type FinalizePayload = Omit<
  Database["public"]["Tables"]["attachment_ai_analysis"]["Update"],
  "attachment_id" | "id" | "created_at" | "updated_at"
>;

function errorPayload(reason: string): FinalizePayload {
  return {
    status: "error",
    is_invoice: false,
    confidence: 0,
    classification: "error",
    reason,
    extracted_invoice_number: null,
    extracted_invoice_date: null,
    extracted_vendor_name: null,
    extracted_total_amount: null,
    extracted_currency: null,
    raw_ai_response: null,
  };
}

async function finalize(
  admin: SupabaseClient<Database>,
  attachmentId: string,
  payload: FinalizePayload,
): Promise<AttachmentAnalysis> {
  const { data, error } = await admin
    .from("attachment_ai_analysis")
    .update(payload)
    .eq("attachment_id", attachmentId)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(
      `Analyse konnte nicht gespeichert werden: ${error?.message ?? "unbekannt"}`,
    );
  }
  return mapAnalysisRow(data);
}

/**
 * Lädt vorhandene Analysen für eine Menge Anhänge über den übergebenen
 * (RLS-gebundenen) Client. Liefert eine Map attachmentId → Analyse.
 */
export async function getAnalysesForAttachments(
  supabase: SupabaseClient<Database>,
  attachmentIds: string[],
): Promise<Map<string, AttachmentAnalysis>> {
  const map = new Map<string, AttachmentAnalysis>();
  if (attachmentIds.length === 0) return map;
  const { data } = await supabase
    .from("attachment_ai_analysis")
    .select("*")
    .in("attachment_id", attachmentIds);
  for (const row of data ?? []) {
    map.set(row.attachment_id, mapAnalysisRow(row as AnalysisRow));
  }
  return map;
}
