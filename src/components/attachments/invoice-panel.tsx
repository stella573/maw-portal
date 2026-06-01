"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FileCheck2,
  FileX2,
  HelpCircle,
  AlertTriangle,
  Ban,
  Loader2,
  RotateCcw,
  UploadCloud,
  Users,
  RefreshCw,
  CheckCircle2,
  HardDrive,
  FolderInput,
  ExternalLink,
} from "lucide-react";
import {
  jobLabel,
  statusBadgeClasses,
  isInProgress,
  canUploadToGmi,
  formatAmount,
  formatInvoiceDate,
  DRIVE_STATUS_LABELS,
  driveBadgeClasses,
  driveInProgress,
  type InvoiceJob,
  type InvoiceJobStatus,
  type SupplierCandidate,
  type DriveRecord,
} from "@/lib/ai/invoice-types";

/**
 * Zeigt den Verarbeitungsstatus einer Rechnung an (Erkennung → Extraktion →
 * Lieferant → GetMyInvoices) inkl. extrahierter Daten und Aktionen
 * (Erneut prüfen, Lieferant manuell auswählen, Zu GMI hochladen, Status
 * aktualisieren). Alle KI-/GMI-Aufrufe laufen serverseitig über geschützte
 * API-Routen.
 */
export function InvoicePanel({
  attachmentId,
  initial = null,
  initialDrive = null,
  autostart = true,
}: {
  attachmentId: string;
  initial?: InvoiceJob | null;
  initialDrive?: DriveRecord | null;
  autostart?: boolean;
}) {
  const [job, setJob] = useState<InvoiceJob | null>(initial);
  const [busy, setBusy] = useState<null | "process" | "upload" | "assign" | "refresh" | "candidates">(null);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<SupplierCandidate[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const startedRef = useRef(false);

  // Google-Drive-Ablage (eigenständig, nicht-blockierend).
  const [drive, setDrive] = useState<DriveRecord | null>(initialDrive);
  const [driveBusy, setDriveBusy] = useState(false);
  const driveStartedRef = useRef(false);

  const callDrive = useCallback(
    async (url: string, body: Record<string, unknown>) => {
      setDriveBusy(true);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.record) setDrive(data.record as DriveRecord);
      } catch {
        /* Drive-Fehler blockieren die übrige Verarbeitung nicht */
      } finally {
        setDriveBusy(false);
      }
    },
    [],
  );

  const call = useCallback(
    async (
      url: string,
      body: Record<string, unknown> | null,
      method: "POST" | "GET" = "POST",
    ): Promise<InvoiceJob | null> => {
      const res = await fetch(url, {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Aktion fehlgeschlagen.");
        return null;
      }
      return (data.job as InvoiceJob) ?? null;
    },
    [],
  );

  const process = useCallback(
    async (force: boolean) => {
      setBusy("process");
      setError(null);
      const j = await call("/api/invoices/process", {
        attachmentId,
        force,
        forceHighQuality: force,
      });
      if (j) setJob(j);
      setBusy(null);
    },
    [attachmentId, call],
  );

  // Auto-Start: einmal pro Mount, wenn noch nicht verarbeitet.
  useEffect(() => {
    if (startedRef.current) return;
    const needsRun = !job || isInProgress(job.status);
    if (autostart && needsRun) {
      startedRef.current = true;
      void process(false);
    }
  }, [autostart, job, process]);

  // Drive-Ablage automatisch starten, sobald die Verarbeitung abgeschlossen ist
  // (damit Kategorie/Lieferant/Datum für die Sortierung feststehen).
  useEffect(() => {
    if (driveStartedRef.current) return;
    const jobReady = !!job && !isInProgress(job.status);
    const driveNeedsRun = !drive || drive.status === "pending";
    if (autostart && jobReady && driveNeedsRun) {
      driveStartedRef.current = true;
      void callDrive("/api/invoices/drive", { attachmentId });
    }
  }, [autostart, job, drive, attachmentId, callDrive]);

  async function uploadGmi() {
    setBusy("upload");
    setError(null);
    const j = await call("/api/invoices/upload", { attachmentId });
    if (j) setJob(j);
    setBusy(null);
  }

  async function refreshStatus() {
    setBusy("refresh");
    setError(null);
    const j = await call(`/api/invoices/job?attachmentId=${attachmentId}`, null, "GET");
    if (j) setJob(j);
    setBusy(null);
  }

  async function openPicker() {
    setBusy("candidates");
    setError(null);
    setPickerOpen(true);
    const res = await fetch(`/api/invoices/companies?attachmentId=${attachmentId}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Lieferanten konnten nicht geladen werden.");
      setCandidates([]);
    } else if (!data.configured) {
      setError("GetMyInvoices ist nicht verbunden (Einstellungen → Integrationen).");
      setCandidates([]);
    } else {
      setCandidates(data.candidates ?? []);
    }
    setBusy(null);
  }

  async function assign(c: SupplierCandidate) {
    setBusy("assign");
    setError(null);
    const j = await call("/api/invoices/assign-supplier", {
      attachmentId,
      supplierId: c.id,
      supplierName: c.name,
    });
    if (j) {
      setJob(j);
      setPickerOpen(false);
    }
    setBusy(null);
  }

  const status: InvoiceJobStatus = busy === "process" && (!job || isInProgress(job.status))
    ? "ai_check_started"
    : (job?.status ?? "uploaded");
  const pending = isInProgress(status) || busy === "process";
  const alreadyInGmi =
    job?.status === "getmyinvoices_upload_completed" && job.alreadyExistedInGmi;
  const label = !job
    ? "Wird geprüft …"
    : alreadyInGmi
      ? "Bereits in GMI vorhanden"
      : jobLabel({ status, classification: job.classification });

  const ex = job?.extracted ?? null;
  const showInvoiceDetails = job?.isInvoice && ex;

  return (
    <div className="flex flex-col gap-2">
      {/* Statuszeile + Aktionen */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
            pending
              ? "bg-brand-500/10 text-brand-600 dark:text-brand-300 border-brand-500/30"
              : statusBadgeClasses(status)
          }`}
          title={job?.supplierMatchReason ?? job?.errorMessage ?? undefined}
        >
          <StatusIcon status={status} pending={pending} />
          {label}
          {job &&
            (job.classification === "invoice" ||
              job.classification === "not_invoice" ||
              job.classification === "unclear") &&
            !pending && (
              <span className="opacity-70">· {Math.round(job.confidence * 100)}%</span>
            )}
        </span>

        <button
          type="button"
          onClick={() => process(true)}
          disabled={busy !== null}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-1.5 py-0.5 text-[11px] text-[var(--muted)] transition hover:bg-[var(--background)] hover:text-[var(--foreground)] disabled:opacity-50"
          title="Analyse erneut starten (genaueres Modell)"
        >
          <RotateCcw className={`h-3 w-3 ${busy === "process" ? "animate-spin" : ""}`} />
          Erneut prüfen
        </button>

        {job?.isInvoice && !pending && (
          <button
            type="button"
            onClick={openPicker}
            disabled={busy !== null}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-1.5 py-0.5 text-[11px] text-[var(--muted)] transition hover:bg-[var(--background)] hover:text-[var(--foreground)] disabled:opacity-50"
          >
            <Users className="h-3 w-3" /> Lieferant wählen
          </button>
        )}

        {job && canUploadToGmi(job) && !pending && (
          <button
            type="button"
            onClick={uploadGmi}
            disabled={busy !== null}
            className="inline-flex items-center gap-1 rounded-md border border-brand-500/40 bg-brand-600/10 px-1.5 py-0.5 text-[11px] text-brand-700 transition hover:bg-brand-600/20 disabled:opacity-50 dark:text-brand-200"
          >
            <UploadCloud className={`h-3 w-3 ${busy === "upload" ? "animate-spin" : ""}`} />
            Zu GetMyInvoices
          </button>
        )}

        {job?.getmyinvoicesDocumentId || job?.status === "getmyinvoices_upload_failed" ? (
          <button
            type="button"
            onClick={refreshStatus}
            disabled={busy !== null}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-1.5 py-0.5 text-[11px] text-[var(--muted)] transition hover:bg-[var(--background)] disabled:opacity-50"
            title="GetMyInvoices-Status aktualisieren"
          >
            <RefreshCw className={`h-3 w-3 ${busy === "refresh" ? "animate-spin" : ""}`} />
            Status
          </button>
        ) : null}
      </div>

      {/* Extrahierte Rechnungsdaten */}
      {showInvoiceDetails && (
        <dl className="grid grid-cols-1 gap-x-4 gap-y-0.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1.5 text-[11px] sm:grid-cols-2">
          <Detail label="Lieferant" value={ex!.vendorName} />
          <Detail label="Rechnungsnr." value={ex!.invoiceNumber} />
          <Detail label="Datum" value={formatInvoiceDate(ex!.invoiceDate)} />
          <Detail label="Fällig" value={formatInvoiceDate(ex!.dueDate)} />
          <Detail label="Brutto" value={formatAmount(ex!.grossAmount, ex!.currency)} />
          <Detail label="Netto" value={formatAmount(ex!.netAmount, ex!.currency)} />
        </dl>
      )}

      {/* Lieferant / GMI-Zeile */}
      {job?.isInvoice && !pending && (
        <div className="flex flex-col gap-0.5 text-[11px] text-[var(--muted)]">
          {job.matchedSupplierName && (
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              Lieferant: <span className="font-medium text-[var(--foreground)]">{job.matchedSupplierName}</span>
              {job.supplierMatchScore > 0 && <span>({Math.round(job.supplierMatchScore * 100)}%)</span>}
              {job.manualSupplierConfirmed && <span>· manuell bestätigt</span>}
            </div>
          )}
          {job.getmyinvoicesDocumentId && (
            <div>
              GetMyInvoices-Dokument:{" "}
              <span className="font-mono text-[var(--foreground)]">{job.getmyinvoicesDocumentId}</span>
            </div>
          )}
        </div>
      )}

      {/* Google-Drive-Ablage */}
      <DriveSection
        attachmentId={attachmentId}
        drive={drive}
        busy={driveBusy}
        onRetry={() => callDrive("/api/invoices/drive", { attachmentId, force: true })}
        onResort={() => callDrive("/api/invoices/drive/resort", { attachmentId })}
      />

      {/* Lieferanten-Auswahl */}
      {pickerOpen && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-2.5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-medium">Lieferant auswählen</span>
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="text-[11px] text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              Schließen
            </button>
          </div>
          {busy === "candidates" ? (
            <p className="text-[11px] text-[var(--muted)]">Lädt …</p>
          ) : candidates && candidates.length > 0 ? (
            <ul className="max-h-56 space-y-1 overflow-auto">
              {candidates.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 hover:bg-[var(--surface)]">
                  <span className="min-w-0">
                    <span className="block truncate text-xs">{c.name}</span>
                    {c.matchReason && (
                      <span className="block truncate text-[10px] text-[var(--muted)]">
                        {typeof c.score === "number" ? `${Math.round(c.score * 100)}% · ` : ""}
                        {c.matchReason}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => assign(c)}
                    disabled={busy !== null}
                    className="shrink-0 rounded-md border border-brand-500/40 bg-brand-600/10 px-2 py-0.5 text-[11px] text-brand-700 transition hover:bg-brand-600/20 disabled:opacity-50 dark:text-brand-200"
                  >
                    Auswählen
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-[var(--muted)]">Keine Lieferanten gefunden.</p>
          )}
        </div>
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

/** Google-Drive-Ablage: Status, Pfad und Aktionen. */
function DriveSection({
  drive,
  busy,
  onRetry,
  onResort,
}: {
  attachmentId: string;
  drive: DriveRecord | null;
  busy: boolean;
  onRetry: () => void;
  onResort: () => void;
}) {
  const status = drive?.status ?? "pending";
  const pending = busy || driveInProgress(status);
  const done = status === "uploaded" || status === "duplicate_skipped";

  return (
    <div className="flex flex-col gap-1 border-t border-[var(--border)] pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
            pending
              ? "bg-brand-500/10 text-brand-600 dark:text-brand-300 border-brand-500/30"
              : driveBadgeClasses(status)
          }`}
          title={drive?.errorMessage ?? undefined}
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <HardDrive className="h-3 w-3" />}
          {pending ? "Wird in Google Drive gespeichert" : DRIVE_STATUS_LABELS[status]}
        </span>

        {drive?.webViewLink && (
          <a
            href={drive.webViewLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-1.5 py-0.5 text-[11px] text-[var(--muted)] transition hover:bg-[var(--background)] hover:text-[var(--foreground)]"
          >
            <ExternalLink className="h-3 w-3" /> In Google Drive öffnen
          </a>
        )}

        {!pending && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-1.5 py-0.5 text-[11px] text-[var(--muted)] transition hover:bg-[var(--background)] hover:text-[var(--foreground)]"
            title="Drive-Ablage erneut versuchen"
          >
            <RotateCcw className="h-3 w-3" /> Drive erneut
          </button>
        )}

        {!pending && done && (
          <button
            type="button"
            onClick={onResort}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-1.5 py-0.5 text-[11px] text-[var(--muted)] transition hover:bg-[var(--background)] hover:text-[var(--foreground)]"
            title="Datei neu einsortieren"
          >
            <FolderInput className="h-3 w-3" /> Neu einsortieren
          </button>
        )}
      </div>

      {drive?.path && done && (
        <div className="truncate text-[10px] text-[var(--muted)]" title={drive.path}>
          {drive.path}
        </div>
      )}
      {drive?.errorMessage && status === "failed" && (
        <p className="text-[11px] text-red-500">{drive.errorMessage}</p>
      )}
    </div>
  );
}

function StatusIcon({ status, pending }: { status: InvoiceJobStatus; pending: boolean }) {
  if (pending) return <Loader2 className="h-3 w-3 animate-spin" />;
  switch (status) {
    case "getmyinvoices_upload_completed":
      return <CheckCircle2 className="h-3 w-3" />;
    case "invoice_detected":
    case "extraction_completed":
    case "supplier_matched":
      return <FileCheck2 className="h-3 w-3" />;
    case "not_invoice":
      return <FileX2 className="h-3 w-3" />;
    case "supplier_match_unclear":
    case "needs_manual_supplier_review":
      return <HelpCircle className="h-3 w-3" />;
    case "unsupported_file_type":
      return <Ban className="h-3 w-3" />;
    case "getmyinvoices_upload_failed":
    case "error":
      return <AlertTriangle className="h-3 w-3" />;
    default:
      return <Loader2 className="h-3 w-3 animate-spin" />;
  }
}
