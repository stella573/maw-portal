import type {
  InvoiceClassification,
  AttachmentAnalysisStatus,
} from "@/types/database";

export type { InvoiceClassification, AttachmentAnalysisStatus };

/**
 * Client-sichere Typen, Labels und Helfer rund um die KI-Rechnungserkennung.
 * Bewusst OHNE Server-Imports (kein Anthropic/Storage/env), damit dieses Modul
 * sowohl in Server- als auch in Client-Komponenten verwendet werden kann.
 */

/** Aufbereitete Analyse eines Anhangs für die UI (camelCase). */
export interface AttachmentAnalysis {
  id: string;
  attachmentId: string;
  status: AttachmentAnalysisStatus;
  isInvoice: boolean;
  confidence: number;
  classification: InvoiceClassification;
  reason: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  vendorName: string | null;
  totalAmount: number | null;
  currency: string | null;
  createdAt: string;
  updatedAt: string;
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

/** Kurzer, verständlicher Statustext je Klassifizierung (für Badges). */
export const CLASSIFICATION_LABELS: Record<InvoiceClassification, string> = {
  invoice: "Rechnung erkannt",
  not_invoice: "Keine Rechnung",
  unclear: "Unklar",
  unsupported_file_type: "Dateityp nicht unterstützt",
  error: "Fehler bei Prüfung",
};

/** Tailwind-Klassen je Klassifizierung (Badge-Farben, light/dark). */
export const CLASSIFICATION_BADGE_CLASSES: Record<InvoiceClassification, string> = {
  invoice:
    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  not_invoice:
    "bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/30",
  unclear:
    "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  unsupported_file_type:
    "bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/20",
  error: "bg-red-500/15 text-red-600 dark:text-red-300 border-red-500/30",
};

/** Statustext, solange die Analyse noch läuft. */
export const ANALYSIS_PENDING_LABEL = "Wird geprüft …";

/** Liefert den anzuzeigenden Statustext (berücksichtigt processing). */
export function analysisLabel(a: AttachmentAnalysis | null): string {
  if (!a) return ANALYSIS_PENDING_LABEL;
  if (a.status === "processing") return ANALYSIS_PENDING_LABEL;
  return CLASSIFICATION_LABELS[a.classification];
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
    // Unbekannter Währungscode → ohne Währungssymbol formatieren.
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
