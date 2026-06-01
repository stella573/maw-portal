import type { GoogleDriveStorageCategory } from "@/types/database";

/**
 * Bestimmt Ablage-Kategorie, Ordnerpfad und sprechenden Dateinamen für die
 * Google-Drive-Ablage. Reine Funktionen (kein Secret, server- & testbar).
 */

const MONTHS_DE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

export interface DrivePathAttachment {
  fileName: string;
  createdAt: string; // Upload-Zeitpunkt (ISO)
}

export interface DrivePathInvoiceData {
  invoiceDate: string | null;
  vendorName: string | null;
  invoiceNumber: string | null;
  grossAmount: number | null;
  currency: string | null;
}

export interface DrivePathJob {
  status: string;
  classification: string;
  isInvoice: boolean;
  matchedSupplierName: string | null;
}

export interface DriveStoragePath {
  category: GoogleDriveStorageCategory;
  folderPath: string[];
  filename: string;
}

/** Datum (ISO) → YYYY-MM-DD; ungültig → null. */
function isoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Jahr + Monatslabel ("MM - Monatsname") aus einem ISO-Datum. */
function yearMonth(dateIso: string): { year: string; month: string } {
  const d = new Date(dateIso);
  const y = String(d.getUTCFullYear());
  const mIdx = d.getUTCMonth();
  const mm = String(mIdx + 1).padStart(2, "0");
  return { year: y, month: `${mm} - ${MONTHS_DE[mIdx]}` };
}

/** Dateiendung inkl. Punkt (z. B. ".pdf") aus einem Namen. */
function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  if (i <= 0 || i === name.length - 1) return "";
  return name.slice(i).toLowerCase();
}

const PROBLEM_CHARS = /[/\\:*?"<>|]/g;

/** Bereinigt einen Ordnernamen (Drive-tauglich, max. 80 Zeichen). */
export function sanitizeFolderName(name: string, max = 80): string {
  const cleaned = name
    .replace(PROBLEM_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "Unbenannt").slice(0, max).trim();
}

/** Bereinigt einen Dateinamen (max. 160 Zeichen, Endung bleibt erhalten). */
export function sanitizeFileName(name: string, max = 160): string {
  const ext = extensionOf(name);
  const base = (ext ? name.slice(0, name.length - ext.length) : name)
    .replace(PROBLEM_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim();
  const maxBase = Math.max(1, max - ext.length);
  return `${(base || "datei").slice(0, maxBase).trim()}${ext}`;
}

/** Betrag fürs Dateinamen-Format (Punkt als Dezimaltrenner, 2 Stellen). */
function amountForName(amount: number | null): string | null {
  if (amount == null || !Number.isFinite(amount)) return null;
  return amount.toFixed(2);
}

/** Ermittelt die Ablage-Kategorie aus dem Verarbeitungs-Job. */
export function determineCategory(job: DrivePathJob): GoogleDriveStorageCategory {
  if (job.status === "unsupported_file_type") return "unsupported_file_type";
  if (job.status === "error" || job.classification === "error") return "error";
  if (job.status === "skipped_receipt") return "invoice_supplier_unclear";
  if (job.isInvoice || job.classification === "invoice") {
    return job.matchedSupplierName ? "invoice" : "invoice_supplier_unclear";
  }
  if (job.classification === "not_invoice") return "not_invoice";
  return "unclear";
}

/**
 * Baut Kategorie, Ordnerpfad und Dateinamen für einen Anhang.
 */
export function buildGoogleDriveStoragePath(
  attachment: DrivePathAttachment,
  invoiceData: DrivePathInvoiceData | null,
  processingJob: DrivePathJob,
): DriveStoragePath {
  const category = determineCategory(processingJob);
  const uploadDate = isoDate(attachment.createdAt) ?? new Date().toISOString().slice(0, 10);
  const ext = extensionOf(attachment.fileName) || "";
  const originalName = attachment.fileName;

  const isInvoiceCategory =
    category === "invoice" || category === "invoice_supplier_unclear";

  // Datum für Pfad/Name: bei Rechnungen bevorzugt das Rechnungsdatum.
  const dateForFiling =
    (isInvoiceCategory ? isoDate(invoiceData?.invoiceDate ?? null) : null) ?? uploadDate;
  const { year, month } = yearMonth(dateForFiling);

  // Ordnerpfad je Kategorie.
  let folderPath: string[];
  switch (category) {
    case "invoice": {
      const supplier = sanitizeFolderName(
        invoiceData?.vendorName?.trim() || "_Lieferant unklar",
      );
      folderPath = ["Buchhaltung", "Rechnungen", year, month, supplier];
      break;
    }
    case "invoice_supplier_unclear":
      folderPath = ["Buchhaltung", "Rechnungen", year, month, "_Lieferant unklar"];
      break;
    case "not_invoice":
      folderPath = ["Buchhaltung", "Keine Rechnung", year, month];
      break;
    case "unsupported_file_type":
      folderPath = ["Buchhaltung", "Nicht unterstützte Dateien", year, month];
      break;
    case "error":
      folderPath = ["Buchhaltung", "Fehler", year, month];
      break;
    case "unclear":
    default:
      folderPath = ["Buchhaltung", "Unklar", year, month];
      break;
  }

  // Dateiname je Kategorie.
  let filename: string;
  const hasInvoiceData =
    invoiceData &&
    (invoiceData.vendorName || invoiceData.invoiceNumber || invoiceData.grossAmount != null);

  if (category === "invoice" || (category === "invoice_supplier_unclear" && hasInvoiceData)) {
    const datePart = isoDate(invoiceData?.invoiceDate ?? null) ?? uploadDate;
    const supplier = (invoiceData?.vendorName?.trim() || "lieferant-unbekannt");
    const number = invoiceData?.invoiceNumber?.trim() || "ohne-rechnungsnummer";
    const amount = amountForName(invoiceData?.grossAmount ?? null) ?? "betrag-unbekannt";
    const currency = invoiceData?.currency?.trim().toUpperCase();
    const parts = [datePart, supplier, number, amount];
    if (currency) parts.push(currency);
    filename = `${parts.join("_")}${ext}`;
  } else if (category === "not_invoice" || category === "unsupported_file_type") {
    filename = `${uploadDate}_${originalName}`;
  } else if (category === "error") {
    filename = `${uploadDate}_fehler_${originalName}`;
  } else if (category === "invoice_supplier_unclear") {
    // Rechnung erkannt, aber keine Daten (z. B. übersprungener Beleg).
    filename = `${uploadDate}_${originalName}`;
  } else {
    filename = `${uploadDate}_unklar_${originalName}`;
  }

  return { category, folderPath, filename: sanitizeFileName(filename) };
}
