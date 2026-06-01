import type {
  InvoiceClassification,
  InvoiceJobStatus,
} from "@/types/database";

export type { InvoiceClassification, InvoiceJobStatus };

/**
 * Client-sichere Typen, Labels und Helfer rund um die Rechnungsverarbeitung.
 * Bewusst OHNE Server-Imports (kein Anthropic/Storage/env), damit dieses Modul
 * sowohl in Server- als auch in Client-Komponenten verwendet werden kann.
 */

/** Eine extrahierte Rechnungsposition. */
export interface InvoiceLineItem {
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  net_amount: number | null;
  tax_rate: number | null;
  gross_amount: number | null;
}

/** Aufbereitete Extraktion (camelCase) für die UI. */
export interface ExtractedInvoice {
  vendorName: string | null;
  vendorAddress: string | null;
  vendorVatId: string | null;
  vendorTaxNumber: string | null;
  vendorIban: string | null;
  vendorEmail: string | null;
  vendorWebsite: string | null;
  vendorCountry: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  serviceDate: string | null;
  dueDate: string | null;
  netAmount: number | null;
  taxAmount: number | null;
  grossAmount: number | null;
  currency: string | null;
  customerNumber: string | null;
  orderReference: string | null;
  description: string | null;
  paymentStatus: string | null;
  documentLanguage: string | null;
  lineItems: InvoiceLineItem[];
}

/** Aufbereiteter Verarbeitungs-Job (camelCase) für die UI. */
export interface InvoiceJob {
  id: string;
  attachmentId: string;
  status: InvoiceJobStatus;
  isInvoice: boolean;
  confidence: number;
  classification: InvoiceClassification;
  supplierMatchScore: number;
  matchedSupplierId: string | null;
  matchedSupplierName: string | null;
  supplierMatchReason: string | null;
  manualSupplierConfirmed: boolean;
  getmyinvoicesDocumentId: string | null;
  modelUsed: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  /** Extrahierte Rechnungsdaten (falls vorhanden). */
  extracted: ExtractedInvoice | null;
}

/** Ein Lieferant aus GetMyInvoices (für die manuelle Auswahl). */
export interface SupplierCandidate {
  id: string;
  name: string;
  score?: number;
  matchReason?: string;
}

/** Dateiendungen/MIME-Typen, die die KI-Analyse unterstützt. */
export const SUPPORTED_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "webp"] as const;
export const SUPPORTED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
] as const;

/** Verständlicher Statustext je Job-Status (für die UI). */
export const STATUS_LABELS: Record<InvoiceJobStatus, string> = {
  uploaded: "Wird geprüft …",
  ai_check_started: "Wird geprüft …",
  unsupported_file_type: "Nicht unterstützter Dateityp",
  not_invoice: "Keine Rechnung",
  invoice_detected: "Rechnung erkannt",
  extraction_started: "Daten werden ausgelesen …",
  extraction_completed: "Daten ausgelesen",
  supplier_matching_started: "Lieferant wird gesucht …",
  supplier_matched: "Lieferant gefunden",
  supplier_match_unclear: "Lieferant unklar",
  needs_manual_supplier_review: "Manuelle Prüfung erforderlich",
  getmyinvoices_upload_started: "Wird zu GetMyInvoices hochgeladen …",
  getmyinvoices_upload_completed: "An GetMyInvoices übertragen",
  getmyinvoices_upload_failed: "Übertragung fehlgeschlagen",
  error: "Fehler bei Prüfung",
};

/** Anzeigetext für einen Job (berücksichtigt die „Unklar"-Nuance). */
export function jobLabel(job: {
  status: InvoiceJobStatus;
  classification: InvoiceClassification;
}): string {
  if (job.status === "not_invoice" && job.classification === "unclear") {
    return "Unklar";
  }
  return STATUS_LABELS[job.status];
}

/** Farbtöne (Tailwind) je Status-Gruppe für Badges. */
export function statusBadgeClasses(status: InvoiceJobStatus): string {
  switch (status) {
    case "getmyinvoices_upload_completed":
    case "supplier_matched":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
    case "invoice_detected":
    case "extraction_completed":
      return "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30";
    case "supplier_match_unclear":
    case "needs_manual_supplier_review":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
    case "not_invoice":
    case "unsupported_file_type":
      return "bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/25";
    case "getmyinvoices_upload_failed":
    case "error":
      return "bg-red-500/15 text-red-600 dark:text-red-300 border-red-500/30";
    default:
      // laufende Zwischenschritte
      return "bg-brand-500/10 text-brand-600 dark:text-brand-300 border-brand-500/30";
  }
}

/** Laufende (Zwischen-)Status, bei denen ein Spinner sinnvoll ist. */
export const IN_PROGRESS_STATUSES: InvoiceJobStatus[] = [
  "uploaded",
  "ai_check_started",
  "extraction_started",
  "supplier_matching_started",
  "getmyinvoices_upload_started",
];

export function isInProgress(status: InvoiceJobStatus): boolean {
  return IN_PROGRESS_STATUSES.includes(status);
}

/** Status, in denen eine manuelle Lieferantenauswahl sinnvoll ist. */
export function needsSupplierReview(status: InvoiceJobStatus): boolean {
  return (
    status === "supplier_match_unclear" ||
    status === "needs_manual_supplier_review" ||
    status === "getmyinvoices_upload_failed"
  );
}

/** Job-Status, in denen ein GMI-Upload manuell ausgelöst werden kann. */
export function canUploadToGmi(job: {
  status: InvoiceJobStatus;
  isInvoice: boolean;
}): boolean {
  if (!job.isInvoice) return false;
  return (
    job.status === "supplier_matched" ||
    job.status === "supplier_match_unclear" ||
    job.status === "needs_manual_supplier_review" ||
    job.status === "extraction_completed" ||
    job.status === "getmyinvoices_upload_failed"
  );
}

/** Prüft anhand Dateiname/MIME-Typ, ob die Analyse den Typ unterstützt. */
export function isSupportedAttachment(
  fileName: string | null,
  contentType: string | null,
): boolean {
  const mime = (contentType ?? "").toLowerCase().split(";")[0]?.trim() ?? "";
  if (SUPPORTED_MIME_TYPES.includes(mime as (typeof SUPPORTED_MIME_TYPES)[number])) {
    return true;
  }
  const ext = (fileName ?? "").toLowerCase().split(".").pop() ?? "";
  return SUPPORTED_EXTENSIONS.includes(ext as (typeof SUPPORTED_EXTENSIONS)[number]);
}

/** Formatiert einen Betrag samt Währung für die Anzeige. */
export function formatAmount(
  amount: number | null,
  currency: string | null,
): string | null {
  if (amount == null) return null;
  const cur = currency?.trim().toUpperCase();
  try {
    return new Intl.NumberFormat("de-DE", {
      style: cur ? "currency" : "decimal",
      currency: cur || undefined,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    const num = new Intl.NumberFormat("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
    return cur ? `${num} ${cur}` : num;
  }
}

/** Formatiert ein ISO-Datum (YYYY-MM-DD) als deutsches Datum. */
export function formatInvoiceDate(date: string | null): string | null {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
