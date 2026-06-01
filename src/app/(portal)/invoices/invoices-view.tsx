"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Paperclip, RefreshCw, ExternalLink, ReceiptText } from "lucide-react";
import { InvoicePanel } from "@/components/attachments/invoice-panel";
import { formatAmount, isInProgress, type InvoiceJobStatus } from "@/lib/ai/invoice-types";
import type { InvoiceDashboardData, InvoiceJobItem } from "@/modules/maildesk/services/invoices";

type Filter = "all" | "invoice" | "needs_review" | "uploaded" | "not_invoice" | "failed";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Alle" },
  { key: "invoice", label: "Rechnungen" },
  { key: "needs_review", label: "Prüfung nötig" },
  { key: "uploaded", label: "An GetMyInvoices" },
  { key: "not_invoice", label: "Keine Rechnung" },
  { key: "failed", label: "Fehler" },
];

function matchesFilter(status: InvoiceJobStatus, isInvoice: boolean, f: Filter): boolean {
  switch (f) {
    case "all":
      return true;
    case "invoice":
      return isInvoice;
    case "needs_review":
      return status === "supplier_match_unclear" || status === "needs_manual_supplier_review";
    case "uploaded":
      return status === "getmyinvoices_upload_completed";
    case "not_invoice":
      return status === "not_invoice";
    case "failed":
      return status === "getmyinvoices_upload_failed" || status === "error";
  }
}

export function InvoicesView({ data }: { data: InvoiceDashboardData }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const { items, stats } = data;

  const filtered = useMemo(
    () => items.filter((i) => matchesFilter(i.job.status, i.job.isInvoice, filter)),
    [items, filter],
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Analysiert" value={stats.total} />
        <StatCard label="Rechnungen" value={stats.invoices} accent="sky" />
        <StatCard label="An GetMyInvoices" value={stats.uploaded} accent="emerald" />
        <StatCard label="Prüfung nötig" value={stats.needsReview} accent="amber" />
        <StatCard label="Fehler" value={stats.failed} accent="red" />
        <StatCard label="In Arbeit" value={stats.processing} accent="brand" />
      </div>

      {stats.totalsByCurrency.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {stats.totalsByCurrency.map((t) => (
            <div
              key={t.currency}
              className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5 text-sm"
            >
              <ReceiptText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-[var(--muted)]">
                Summe ({t.count} {t.count === 1 ? "Rechnung" : "Rechnungen"})
              </span>
              <span className="font-semibold">
                {formatAmount(t.amount, t.currency === "—" ? null : t.currency)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                filter === f.key
                  ? "border-brand-500 bg-brand-600/10 font-medium text-brand-700 dark:text-brand-200"
                  : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--background)]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs transition hover:bg-[var(--background)]"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Aktualisieren
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--muted)]">
          {items.length === 0
            ? "Noch keine verarbeiteten Anhänge. Sobald Anhänge hochgeladen oder per E-Mail empfangen werden, erscheinen sie hier."
            : "Keine Einträge für diesen Filter."}
        </p>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((item) => (
            <InvoiceRow key={item.job.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function InvoiceRow({ item }: { item: InvoiceJobItem }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 flex-1">
        <a
          href={`/api/mail/attachment/${item.job.attachmentId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex max-w-full items-center gap-1.5 text-sm font-medium transition hover:text-brand-600"
        >
          <Paperclip className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{item.fileName}</span>
        </a>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--muted)]">
          {item.ticketReference && item.ticketId && (
            <Link
              href={`/maildesk/${item.ticketId}` as never}
              className="inline-flex items-center gap-1 hover:text-brand-600"
            >
              {item.ticketReference}
              <ExternalLink className="h-3 w-3" />
            </Link>
          )}
          {item.ticketSubject && <span className="truncate">· {item.ticketSubject}</span>}
          <span>· {formatDate(item.job.createdAt)}</span>
        </div>
      </div>

      <div className="lg:w-[360px] lg:shrink-0">
        <InvoicePanel
          attachmentId={item.job.attachmentId}
          initial={item.job}
          initialDrive={item.drive}
          autostart={isInProgress(item.job.status)}
        />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "sky" | "emerald" | "amber" | "red" | "brand";
}) {
  const accentText =
    accent === "sky"
      ? "text-sky-600 dark:text-sky-400"
      : accent === "emerald"
        ? "text-emerald-600 dark:text-emerald-400"
        : accent === "amber"
          ? "text-amber-600 dark:text-amber-400"
          : accent === "red"
            ? "text-red-600 dark:text-red-400"
            : accent === "brand"
              ? "text-brand-600 dark:text-brand-300"
              : "";
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div className={`mt-1.5 text-2xl font-semibold ${accentText}`}>{value}</div>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
