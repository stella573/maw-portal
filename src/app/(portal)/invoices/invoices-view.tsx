"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Paperclip, RefreshCw, ExternalLink, ReceiptText } from "lucide-react";
import { AttachmentAiBadge } from "@/components/attachments/attachment-ai-badge";
import {
  CLASSIFICATION_LABELS,
  formatAmount,
  type InvoiceClassification,
} from "@/lib/ai/invoice-types";
import type { InvoiceDashboardData } from "@/modules/maildesk/services/invoices";

type Filter = "all" | InvoiceClassification;

const FILTER_ORDER: Filter[] = [
  "all",
  "invoice",
  "not_invoice",
  "unclear",
  "unsupported_file_type",
  "error",
];

export function InvoicesView({ data }: { data: InvoiceDashboardData }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const { items, stats } = data;

  const filtered = useMemo(
    () =>
      filter === "all"
        ? items
        : items.filter((i) => i.analysis.classification === filter),
    [items, filter],
  );

  return (
    <div className="space-y-6">
      {/* Kennzahlen */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Analysiert" value={stats.total} />
        <StatCard label="Rechnungen" value={stats.invoices} accent="emerald" />
        <StatCard label="Keine Rechnung" value={stats.notInvoices} />
        <StatCard label="Unklar" value={stats.unclear} accent="amber" />
        <StatCard label="Fehler" value={stats.errors} accent="red" />
        <StatCard label="In Prüfung" value={stats.processing} accent="brand" />
      </div>

      {/* Summen je Währung (nur erkannte Rechnungen) */}
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

      {/* Filter + Aktualisieren */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTER_ORDER.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                filter === f
                  ? "border-brand-500 bg-brand-600/10 font-medium text-brand-700 dark:text-brand-200"
                  : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--background)]"
              }`}
            >
              {f === "all" ? "Alle" : CLASSIFICATION_LABELS[f]}
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

      {/* Liste */}
      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--muted)]">
          {items.length === 0
            ? "Noch keine analysierten Anhänge. Sobald Anhänge hochgeladen oder per E-Mail empfangen werden, erscheinen sie hier."
            : "Keine Einträge für diesen Filter."}
        </p>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((item) => (
            <div
              key={item.analysis.id}
              className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <a
                  href={`/api/mail/attachment/${item.analysis.attachmentId}`}
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
                  {item.ticketSubject && (
                    <span className="truncate">· {item.ticketSubject}</span>
                  )}
                  <span>· {formatDate(item.analysis.createdAt)}</span>
                </div>
              </div>

              <div className="sm:w-[320px] sm:shrink-0">
                <AttachmentAiBadge
                  attachmentId={item.analysis.attachmentId}
                  initial={item.analysis}
                  // Noch nicht abgeschlossene (z. B. per Webhook vorgemerkte)
                  // Analysen beim Anzeigen automatisch abschließen.
                  autostart={item.analysis.status === "processing"}
                />
              </div>
            </div>
          ))}
        </div>
      )}
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
  accent?: "emerald" | "amber" | "red" | "brand";
}) {
  const accentText =
    accent === "emerald"
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
