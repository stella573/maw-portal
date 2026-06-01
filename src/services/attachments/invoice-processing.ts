import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env";
import { getGmiCreds } from "@/services/admin/getmyinvoices";
import {
  extractInvoice,
  InvalidAiResponseError,
  type ExtractionResult,
} from "@/lib/ai/invoice-extraction";
import { fileHash } from "@/lib/ai/attachment-media";
import {
  listCompanies,
  uploadDocument,
  type GmiCompany,
} from "@/lib/getmyinvoices/documents";
import {
  matchSupplier,
  rankSuppliers,
  type ExtractedVendor,
} from "@/lib/getmyinvoices/supplier-match";
import {
  isSupportedAttachment,
  type InvoiceJob,
  type ExtractedInvoice,
  type InvoiceLineItem,
  type SupplierCandidate,
} from "@/lib/ai/invoice-types";
import type { Database, Tables, Json } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Orchestriert die vollständige Rechnungsverarbeitung eines Anhangs:
 * Hash/Dedup → KI-Erkennung+Extraktion (Claude) → Lieferanten-Matching (GMI)
 * → optionaler Auto-Upload zu GetMyInvoices.
 *
 * Ausschließlich serverseitig (Service-Role). Robuste Fehlerbehandlung: jeder
 * Schritt speichert seinen Status; Fehler brechen die App nicht ab.
 */

type JobRow = Tables<"invoice_processing_jobs">;
type ExtractedRow = Tables<"extracted_invoice_data">;
type Admin = SupabaseClient<Database>;

const BUCKET = "mail-attachments";
const MAX_BYTES = 20 * 1024 * 1024;

export class AttachmentNotFoundError extends Error {
  constructor() {
    super("Anhang nicht gefunden.");
    this.name = "AttachmentNotFoundError";
  }
}

/** Auto-Upload zu GMI – standardmäßig AN (Spec), per Env deaktivierbar. */
function autoUploadEnabled(): boolean {
  const { GETMYINVOICES_AUTO_UPLOAD } = getServerEnv();
  const v = (GETMYINVOICES_AUTO_UPLOAD ?? "").trim().toLowerCase();
  return !["false", "0", "off", "no"].includes(v);
}

// ── Mapping DB → UI ────────────────────────────────────────────────────────

function mapExtracted(row: ExtractedRow | null): ExtractedInvoice | null {
  if (!row) return null;
  const items: InvoiceLineItem[] = Array.isArray(row.line_items)
    ? (row.line_items as unknown as InvoiceLineItem[])
    : [];
  return {
    vendorName: row.vendor_name,
    vendorAddress: row.vendor_address,
    vendorVatId: row.vendor_vat_id,
    vendorTaxNumber: row.vendor_tax_number,
    vendorIban: row.vendor_iban,
    vendorEmail: row.vendor_email,
    vendorWebsite: row.vendor_website,
    vendorCountry: row.vendor_country,
    invoiceNumber: row.invoice_number,
    invoiceDate: row.invoice_date,
    serviceDate: row.service_date,
    dueDate: row.due_date,
    netAmount: row.net_amount == null ? null : Number(row.net_amount),
    taxAmount: row.tax_amount == null ? null : Number(row.tax_amount),
    grossAmount: row.gross_amount == null ? null : Number(row.gross_amount),
    currency: row.currency,
    customerNumber: row.customer_number,
    orderReference: row.order_reference,
    description: row.description,
    paymentStatus: row.payment_status,
    documentLanguage: row.document_language,
    lineItems: items,
  };
}

export function mapJob(row: JobRow, extracted: ExtractedRow | null): InvoiceJob {
  return {
    id: row.id,
    attachmentId: row.attachment_id,
    status: row.status,
    isInvoice: row.is_invoice,
    confidence: Number(row.invoice_confidence ?? 0),
    classification: row.classification,
    supplierMatchScore: Number(row.supplier_match_score ?? 0),
    matchedSupplierId: row.matched_supplier_id,
    matchedSupplierName: row.matched_supplier_name,
    supplierMatchReason: row.supplier_match_reason,
    manualSupplierConfirmed: row.manual_supplier_confirmed,
    getmyinvoicesDocumentId: row.getmyinvoices_document_id,
    modelUsed: row.model_used,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    extracted: mapExtracted(extracted),
  };
}

// ── Lesen (RLS-gebunden, für UI/Server-Pages) ──────────────────────────────

export async function getJobsForAttachments(
  supabase: Admin,
  attachmentIds: string[],
): Promise<Map<string, InvoiceJob>> {
  const map = new Map<string, InvoiceJob>();
  if (attachmentIds.length === 0) return map;

  const [{ data: jobs }, { data: extracted }] = await Promise.all([
    supabase.from("invoice_processing_jobs").select("*").in("attachment_id", attachmentIds),
    supabase.from("extracted_invoice_data").select("*").in("attachment_id", attachmentIds),
  ]);

  const extractedByAtt = new Map<string, ExtractedRow>();
  for (const e of (extracted ?? []) as ExtractedRow[]) {
    extractedByAtt.set(e.attachment_id, e);
  }
  for (const j of (jobs ?? []) as JobRow[]) {
    map.set(j.attachment_id, mapJob(j, extractedByAtt.get(j.attachment_id) ?? null));
  }
  return map;
}

// ── Persistenz-Helfer (Service-Role) ───────────────────────────────────────

async function loadAttachment(admin: Admin, attachmentId: string) {
  const { data } = await admin
    .from("attachments")
    .select("id, storage_path, file_name, content_type")
    .eq("id", attachmentId)
    .maybeSingle();
  return data;
}

async function patchJob(
  admin: Admin,
  attachmentId: string,
  patch: Database["public"]["Tables"]["invoice_processing_jobs"]["Update"],
): Promise<JobRow> {
  const { data, error } = await admin
    .from("invoice_processing_jobs")
    .update(patch)
    .eq("attachment_id", attachmentId)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`Job-Update fehlgeschlagen: ${error?.message ?? "unbekannt"}`);
  }
  return data as JobRow;
}

async function ensureJob(admin: Admin, attachmentId: string): Promise<void> {
  await admin
    .from("invoice_processing_jobs")
    .upsert({ attachment_id: attachmentId }, { onConflict: "attachment_id" });
}

async function getJobRow(admin: Admin, attachmentId: string): Promise<JobRow | null> {
  const { data } = await admin
    .from("invoice_processing_jobs")
    .select("*")
    .eq("attachment_id", attachmentId)
    .maybeSingle();
  return (data as JobRow) ?? null;
}

async function getExtractedRow(admin: Admin, attachmentId: string): Promise<ExtractedRow | null> {
  const { data } = await admin
    .from("extracted_invoice_data")
    .select("*")
    .eq("attachment_id", attachmentId)
    .maybeSingle();
  return (data as ExtractedRow) ?? null;
}

async function saveExtracted(
  admin: Admin,
  attachmentId: string,
  jobId: string,
  ex: ExtractionResult,
): Promise<void> {
  const payload: Database["public"]["Tables"]["extracted_invoice_data"]["Insert"] = {
    attachment_id: attachmentId,
    invoice_processing_job_id: jobId,
    vendor_name: ex.vendor.name,
    vendor_address: ex.vendor.address,
    vendor_vat_id: ex.vendor.vatId,
    vendor_tax_number: ex.vendor.taxNumber,
    vendor_iban: ex.vendor.iban,
    vendor_email: ex.vendor.email,
    vendor_website: ex.vendor.website,
    vendor_country: ex.vendor.country,
    invoice_number: ex.invoice.invoiceNumber,
    invoice_date: ex.invoice.invoiceDate,
    service_date: ex.invoice.serviceDate,
    due_date: ex.invoice.dueDate,
    net_amount: ex.invoice.netAmount,
    tax_amount: ex.invoice.taxAmount,
    gross_amount: ex.invoice.grossAmount,
    currency: ex.invoice.currency,
    customer_number: ex.invoice.customerNumber,
    order_reference: ex.invoice.orderReference,
    description: ex.invoice.description,
    payment_status: ex.invoice.paymentStatus,
    document_language: ex.invoice.language,
    line_items: ex.lineItems as unknown as Json,
  };
  await admin
    .from("extracted_invoice_data")
    .upsert(payload, { onConflict: "invoice_processing_job_id" });
}

async function result(admin: Admin, attachmentId: string): Promise<InvoiceJob> {
  const [job, extracted] = await Promise.all([
    getJobRow(admin, attachmentId),
    getExtractedRow(admin, attachmentId),
  ]);
  if (!job) throw new AttachmentNotFoundError();
  return mapJob(job, extracted);
}

// ── Hauptpipeline ──────────────────────────────────────────────────────────

const CACHED_STATUSES = new Set([
  "not_invoice",
  "unsupported_file_type",
  "extraction_completed",
  "supplier_matched",
  "supplier_match_unclear",
  "needs_manual_supplier_review",
  "getmyinvoices_upload_completed",
]);

export async function runInvoiceProcessing(
  attachmentId: string,
  opts: { force?: boolean; forceHighQuality?: boolean } = {},
): Promise<InvoiceJob> {
  const admin = createAdminClient();

  const attachment = await loadAttachment(admin, attachmentId);
  if (!attachment) throw new AttachmentNotFoundError();

  await ensureJob(admin, attachmentId);

  // Cache: bereits verarbeitet und kein force → zurückgeben.
  if (!opts.force) {
    const existing = await getJobRow(admin, attachmentId);
    if (existing && CACHED_STATUSES.has(existing.status)) {
      return result(admin, attachmentId);
    }
  }

  await patchJob(admin, attachmentId, { status: "ai_check_started", error_message: null });

  // Nicht unterstützte Dateitypen überspringen.
  if (!isSupportedAttachment(attachment.file_name, attachment.content_type)) {
    await patchJob(admin, attachmentId, {
      status: "unsupported_file_type",
      classification: "unsupported_file_type",
      is_invoice: false,
    });
    return result(admin, attachmentId);
  }

  // Datei laden + Hash.
  const { data: blob, error: dlErr } = await admin.storage
    .from(BUCKET)
    .download(attachment.storage_path);
  if (dlErr || !blob) {
    await patchJob(admin, attachmentId, errorPatch("Datei konnte nicht geladen werden."));
    return result(admin, attachmentId);
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) {
    await patchJob(admin, attachmentId, errorPatch("Datei zu groß für die KI-Analyse."));
    return result(admin, attachmentId);
  }
  const hash = fileHash(bytes);
  await patchJob(admin, attachmentId, { file_hash: hash });

  // Duplikaterkennung: identische Datei bereits verarbeitet → Ergebnis kopieren.
  if (!opts.force) {
    const copied = await tryReuseByHash(admin, attachmentId, hash);
    if (copied) return result(admin, attachmentId);
  }

  // KI-Extraktion (zweistufig).
  let ex: ExtractionResult;
  try {
    ex = await extractInvoice({
      fileName: attachment.file_name,
      contentType: attachment.content_type,
      bytes,
      forceHighQuality: opts.forceHighQuality,
    });
  } catch (err) {
    if (err instanceof InvalidAiResponseError) {
      await patchJob(admin, attachmentId, {
        ...errorPatch("Die KI lieferte keine gültige JSON-Antwort."),
        raw_claude_response: { error: "invalid_response", raw: err.raw } as Json,
      });
    } else {
      console.error("[invoice-processing] KI-Fehler:", err);
      await patchJob(admin, attachmentId, errorPatch("KI-Analyse fehlgeschlagen (KI nicht erreichbar?)."));
    }
    return result(admin, attachmentId);
  }

  await patchJob(admin, attachmentId, {
    is_invoice: ex.isInvoice,
    invoice_confidence: ex.confidence,
    classification: ex.classification,
    model_used: ex.modelUsed,
    raw_claude_response: (ex.raw ?? null) as Json,
  });

  if (!ex.isInvoice) {
    await patchJob(admin, attachmentId, { status: "not_invoice" });
    return result(admin, attachmentId);
  }

  // Rechnung erkannt → Daten speichern.
  const job = await patchJob(admin, attachmentId, { status: "invoice_detected" });
  await saveExtracted(admin, attachmentId, job.id, ex);
  await patchJob(admin, attachmentId, { status: "extraction_completed" });

  // Lieferanten-Matching.
  await runSupplierMatching(admin, attachmentId, ex);

  // Auto-Upload, wenn sicher zugeordnet.
  const afterMatch = await getJobRow(admin, attachmentId);
  if (afterMatch?.status === "supplier_matched" && autoUploadEnabled()) {
    await doUpload(admin, attachmentId, attachment, bytes);
  }

  return result(admin, attachmentId);
}

function errorPatch(message: string): Database["public"]["Tables"]["invoice_processing_jobs"]["Update"] {
  return { status: "error", classification: "error", is_invoice: false, error_message: message };
}

/** Kopiert das Ergebnis eines früheren Jobs mit identischem Datei-Hash. */
async function tryReuseByHash(
  admin: Admin,
  attachmentId: string,
  hash: string,
): Promise<boolean> {
  const { data: prior } = await admin
    .from("invoice_processing_jobs")
    .select("*")
    .eq("file_hash", hash)
    .neq("attachment_id", attachmentId)
    .in("status", [
      "not_invoice",
      "extraction_completed",
      "supplier_matched",
      "supplier_match_unclear",
      "needs_manual_supplier_review",
      "getmyinvoices_upload_completed",
    ])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!prior) return false;

  const priorRow = prior as JobRow;
  await patchJob(admin, attachmentId, {
    status: priorRow.status,
    is_invoice: priorRow.is_invoice,
    invoice_confidence: priorRow.invoice_confidence,
    classification: priorRow.classification,
    supplier_match_score: priorRow.supplier_match_score,
    matched_supplier_id: priorRow.matched_supplier_id,
    matched_supplier_name: priorRow.matched_supplier_name,
    supplier_match_reason: priorRow.supplier_match_reason
      ? `${priorRow.supplier_match_reason} (übernommen von identischer Datei)`
      : "Übernommen von identischer Datei",
    getmyinvoices_document_id: priorRow.getmyinvoices_document_id,
    model_used: priorRow.model_used,
    raw_claude_response: priorRow.raw_claude_response,
  });

  // Extrahierte Daten der Vorgänger-Datei kopieren.
  const priorExtracted = await getExtractedRow(admin, priorRow.attachment_id);
  if (priorExtracted) {
    const thisJob = await getJobRow(admin, attachmentId);
    if (thisJob) {
      const rest = { ...priorExtracted } as Partial<ExtractedRow>;
      delete rest.id;
      delete rest.created_at;
      delete rest.updated_at;
      await admin.from("extracted_invoice_data").upsert(
        { ...rest, attachment_id: attachmentId, invoice_processing_job_id: thisJob.id },
        { onConflict: "invoice_processing_job_id" },
      );
    }
  }
  return true;
}

async function runSupplierMatching(
  admin: Admin,
  attachmentId: string,
  ex: ExtractionResult,
): Promise<void> {
  await patchJob(admin, attachmentId, { status: "supplier_matching_started" });

  const creds = await getGmiCreds();
  if (!creds) {
    await patchJob(admin, attachmentId, {
      status: "needs_manual_supplier_review",
      supplier_match_reason: "GetMyInvoices ist nicht verbunden (Einstellungen → Integrationen).",
    });
    return;
  }

  let companies: GmiCompany[] = [];
  try {
    companies = await listCompanies(creds);
  } catch (err) {
    console.error("[invoice-processing] GMI companies:", err);
    await patchJob(admin, attachmentId, {
      status: "needs_manual_supplier_review",
      supplier_match_reason: "Lieferantenliste konnte nicht geladen werden.",
    });
    return;
  }

  const match = matchSupplier(toVendor(ex), companies);
  await patchJob(admin, attachmentId, {
    supplier_match_score: match.score,
    matched_supplier_id: match.supplier_id,
    matched_supplier_name: match.supplier_name,
    supplier_match_reason: match.match_reason,
  });

  // Zuordnungslogik nach Score/Exakt-ID.
  if (match.exact_id_match || match.score >= 0.85) {
    await patchJob(admin, attachmentId, { status: "supplier_matched" });
  } else if (match.score >= 0.65) {
    await patchJob(admin, attachmentId, { status: "supplier_match_unclear" });
  } else {
    await patchJob(admin, attachmentId, { status: "needs_manual_supplier_review" });
  }
}

function toVendor(ex: ExtractionResult): ExtractedVendor {
  return {
    name: ex.vendor.name,
    address: ex.vendor.address,
    vatId: ex.vendor.vatId,
    taxNumber: ex.vendor.taxNumber,
    iban: ex.vendor.iban,
    email: ex.vendor.email,
    website: ex.vendor.website,
    country: ex.vendor.country,
  };
}

// ── GetMyInvoices-Upload ────────────────────────────────────────────────────

async function doUpload(
  admin: Admin,
  attachmentId: string,
  attachment: { storage_path: string; file_name: string; content_type: string | null },
  bytesMaybe?: Uint8Array,
): Promise<void> {
  const creds = await getGmiCreds();
  if (!creds) {
    await patchJob(admin, attachmentId, {
      status: "getmyinvoices_upload_failed",
      error_message: "GetMyInvoices ist nicht verbunden.",
    });
    return;
  }

  const job = await getJobRow(admin, attachmentId);
  const extracted = await getExtractedRow(admin, attachmentId);
  if (!job) return;

  await patchJob(admin, attachmentId, {
    status: "getmyinvoices_upload_started",
    error_message: null,
  });

  // Datei (erneut) laden, falls nicht übergeben.
  let bytes = bytesMaybe;
  if (!bytes) {
    const { data: blob, error } = await admin.storage
      .from(BUCKET)
      .download(attachment.storage_path);
    if (error || !blob) {
      await patchJob(admin, attachmentId, {
        status: "getmyinvoices_upload_failed",
        error_message: "Datei für Upload konnte nicht geladen werden.",
      });
      return;
    }
    bytes = new Uint8Array(await blob.arrayBuffer());
  }

  try {
    const res = await uploadDocument(creds, {
      fileName: attachment.file_name,
      fileBase64: Buffer.from(bytes).toString("base64"),
      companyId: job.matched_supplier_id,
      documentNumber: extracted?.invoice_number ?? null,
      documentDate: extracted?.invoice_date ?? null,
      dueDate: extracted?.due_date ?? null,
      netAmount: extracted?.net_amount == null ? null : Number(extracted.net_amount),
      grossAmount: extracted?.gross_amount == null ? null : Number(extracted.gross_amount),
      vat: extracted?.tax_amount == null ? null : Number(extracted.tax_amount),
      currency: extracted?.currency ?? null,
      paymentStatus: extracted?.payment_status ?? null,
      comment: buildComment(extracted),
    });
    await patchJob(admin, attachmentId, {
      status: "getmyinvoices_upload_completed",
      getmyinvoices_document_id: res.documentId,
      raw_getmyinvoices_response: (res.raw ?? null) as Json,
      error_message: null,
    });
  } catch (err) {
    console.error("[invoice-processing] GMI upload:", err);
    await patchJob(admin, attachmentId, {
      status: "getmyinvoices_upload_failed",
      error_message: err instanceof Error ? err.message.slice(0, 500) : "Upload fehlgeschlagen.",
    });
  }
}

/** Zusätzliche Infos, die GMI ggf. nicht als eigene Felder kennt, als Notiz. */
function buildComment(extracted: ExtractedRow | null): string | null {
  if (!extracted) return null;
  const parts: string[] = [];
  if (extracted.customer_number) parts.push(`Kundennr.: ${extracted.customer_number}`);
  if (extracted.order_reference) parts.push(`Bestellnr./Ref.: ${extracted.order_reference}`);
  if (extracted.service_date) parts.push(`Leistungsdatum: ${extracted.service_date}`);
  if (extracted.description) parts.push(extracted.description);
  return parts.length ? parts.join(" · ").slice(0, 1000) : null;
}

// ── Manuelle Aktionen ───────────────────────────────────────────────────────

/** Manuelle Lieferantenauswahl + anschließender Upload. */
export async function assignSupplierManually(
  attachmentId: string,
  supplierId: string,
  supplierName: string,
): Promise<InvoiceJob> {
  const admin = createAdminClient();
  const attachment = await loadAttachment(admin, attachmentId);
  if (!attachment) throw new AttachmentNotFoundError();

  const job = await getJobRow(admin, attachmentId);
  if (!job || !job.is_invoice) {
    throw new Error("Für diesen Anhang liegt keine erkannte Rechnung vor.");
  }

  await patchJob(admin, attachmentId, {
    matched_supplier_id: supplierId,
    matched_supplier_name: supplierName,
    manual_supplier_confirmed: true,
    supplier_match_reason: "Manuell bestätigt",
    status: "supplier_matched",
  });

  await doUpload(admin, attachmentId, attachment);
  return result(admin, attachmentId);
}

/** Manueller (Re-)Upload zu GetMyInvoices des aktuellen Job-Stands. */
export async function uploadJobToGmi(attachmentId: string): Promise<InvoiceJob> {
  const admin = createAdminClient();
  const attachment = await loadAttachment(admin, attachmentId);
  if (!attachment) throw new AttachmentNotFoundError();

  const job = await getJobRow(admin, attachmentId);
  if (!job || !job.is_invoice) {
    throw new Error("Für diesen Anhang liegt keine erkannte Rechnung vor.");
  }
  await doUpload(admin, attachmentId, attachment);
  return result(admin, attachmentId);
}

/** Lieferantenkandidaten (mit Score) für die manuelle Auswahl. */
export async function listSupplierCandidates(
  attachmentId: string,
): Promise<{ configured: boolean; candidates: SupplierCandidate[] }> {
  const admin = createAdminClient();
  const creds = await getGmiCreds();
  if (!creds) return { configured: false, candidates: [] };

  const companies = await listCompanies(creds);
  const extracted = await getExtractedRow(admin, attachmentId);

  if (extracted) {
    const vendor: ExtractedVendor = {
      name: extracted.vendor_name,
      address: extracted.vendor_address,
      vatId: extracted.vendor_vat_id,
      taxNumber: extracted.vendor_tax_number,
      iban: extracted.vendor_iban,
      email: extracted.vendor_email,
      website: extracted.vendor_website,
      country: extracted.vendor_country,
    };
    return {
      configured: true,
      candidates: rankSuppliers(vendor, companies, 15),
    };
  }
  return {
    configured: true,
    candidates: companies
      .slice(0, 50)
      .map((c) => ({ id: c.id, name: c.name })),
  };
}
