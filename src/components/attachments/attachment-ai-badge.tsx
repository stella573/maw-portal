"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  FileCheck2,
  FileX2,
  HelpCircle,
  AlertTriangle,
  Ban,
  Loader2,
  RotateCcw,
} from "lucide-react";
import {
  analysisLabel,
  formatAmount,
  formatInvoiceDate,
  CLASSIFICATION_BADGE_CLASSES,
  type AttachmentAnalysis,
  type InvoiceClassification,
} from "@/lib/ai/invoice-types";

/**
 * Zeigt den KI-Status eines Anhangs ("Wird geprüft …" / "Rechnung erkannt" / …)
 * und – bei erkannter Rechnung – die extrahierten Eckdaten. Bietet einen
 * "Erneut prüfen"-Button, der die serverseitige Analyse neu anstößt.
 *
 * Die KI wird NIE direkt aufgerufen – ausschließlich über die geschützte
 * Server-Route /api/attachments/analyze.
 */
export function AttachmentAiBadge({
  attachmentId,
  initial = null,
  autostart = true,
  showDetails = true,
  className = "",
}: {
  attachmentId: string;
  initial?: AttachmentAnalysis | null;
  /** Wenn noch keine abgeschlossene Analyse vorliegt, automatisch starten. */
  autostart?: boolean;
  /** Bei erkannter Rechnung Eckdaten anzeigen. */
  showDetails?: boolean;
  className?: string;
}) {
  const [analysis, setAnalysis] = useState<AttachmentAnalysis | null>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  const analyze = useCallback(
    async (force: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/attachments/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ attachmentId, force }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Prüfung fehlgeschlagen.");
        } else if (data.analysis) {
          setAnalysis(data.analysis as AttachmentAnalysis);
        }
      } catch {
        setError("Prüfung fehlgeschlagen.");
      } finally {
        setLoading(false);
      }
    },
    [attachmentId],
  );

  // Auto-Start: einmal pro Mount, wenn noch keine abgeschlossene Analyse da ist.
  useEffect(() => {
    if (startedRef.current) return;
    const needsRun =
      !analysis || (analysis.status !== "completed" && analysis.status !== "error");
    if (autostart && needsRun) {
      startedRef.current = true;
      void analyze(false);
    }
  }, [autostart, analysis, analyze]);

  const isPending = loading || analysis?.status === "processing";
  const classification: InvoiceClassification | null = isPending
    ? null
    : (analysis?.classification ?? null);

  const label = isPending ? "Wird geprüft …" : analysisLabel(analysis);

  const badgeClasses = isPending
    ? "bg-brand-500/10 text-brand-600 dark:text-brand-300 border-brand-500/30"
    : classification
      ? CLASSIFICATION_BADGE_CLASSES[classification]
      : "bg-slate-500/10 text-slate-500 border-slate-500/20";

  const showAmount =
    analysis && analysis.classification === "invoice"
      ? formatAmount(analysis.totalAmount, analysis.currency)
      : null;
  const showDate =
    analysis && analysis.classification === "invoice"
      ? formatInvoiceDate(analysis.invoiceDate)
      : null;

  const canRecheck = !loading && analysis?.status !== "processing";

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${badgeClasses}`}
          title={analysis?.reason ?? undefined}
        >
          <StatusIcon pending={isPending} classification={classification} />
          {label}
          {!isPending &&
            analysis &&
            (analysis.classification === "invoice" ||
              analysis.classification === "not_invoice" ||
              analysis.classification === "unclear") && (
              <span className="opacity-70">
                · {Math.round((analysis.confidence ?? 0) * 100)}%
              </span>
            )}
        </span>

        <button
          type="button"
          onClick={() => analyze(true)}
          disabled={!canRecheck}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-1.5 py-0.5 text-[11px] text-[var(--muted)] transition hover:bg-[var(--background)] hover:text-[var(--foreground)] disabled:opacity-50"
          title="KI-Analyse erneut starten"
        >
          <RotateCcw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Erneut prüfen
        </button>
      </div>

      {showDetails &&
        analysis &&
        analysis.classification === "invoice" &&
        !isPending && (
          <dl className="grid grid-cols-1 gap-x-4 gap-y-0.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1.5 text-[11px] sm:grid-cols-2">
            <Detail label="Lieferant" value={analysis.vendorName} />
            <Detail label="Rechnungsnr." value={analysis.invoiceNumber} />
            <Detail label="Datum" value={showDate} />
            <Detail label="Betrag" value={showAmount} />
          </dl>
        )}

      {error && <p className="text-[11px] text-red-500">{error}</p>}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}

function StatusIcon({
  pending,
  classification,
}: {
  pending: boolean;
  classification: InvoiceClassification | null;
}) {
  if (pending) return <Loader2 className="h-3 w-3 animate-spin" />;
  switch (classification) {
    case "invoice":
      return <FileCheck2 className="h-3 w-3" />;
    case "not_invoice":
      return <FileX2 className="h-3 w-3" />;
    case "unclear":
      return <HelpCircle className="h-3 w-3" />;
    case "unsupported_file_type":
      return <Ban className="h-3 w-3" />;
    case "error":
      return <AlertTriangle className="h-3 w-3" />;
    default:
      return <Loader2 className="h-3 w-3 animate-spin" />;
  }
}
