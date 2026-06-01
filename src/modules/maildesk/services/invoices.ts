import { createClient } from "@/lib/supabase/server";
import { mapJob } from "@/services/attachments/invoice-processing";
import { isInProgress, type InvoiceJob } from "@/lib/ai/invoice-types";
import type { Tables } from "@/types/database";

/**
 * Datenquelle für das Rechnungs-Dashboard: alle Verarbeitungs-Jobs, die der
 * eingeloggte User sehen darf (RLS), inkl. Ticket-Kontext und Kennzahlen.
 */

export interface InvoiceJobItem {
  job: InvoiceJob;
  fileName: string;
  contentType: string | null;
  ticketId: string | null;
  ticketReference: string | null;
  ticketSubject: string | null;
}

export interface InvoiceDashboardStats {
  total: number;
  invoices: number;
  uploaded: number;
  needsReview: number;
  notInvoices: number;
  failed: number;
  processing: number;
  totalsByCurrency: { currency: string; amount: number; count: number }[];
}

export interface InvoiceDashboardData {
  items: InvoiceJobItem[];
  stats: InvoiceDashboardStats;
}

type JobRow = Tables<"invoice_processing_jobs">;
type ExtractedRow = Tables<"extracted_invoice_data">;

export async function getInvoiceDashboard(limit = 200): Promise<InvoiceDashboardData> {
  const supabase = await createClient();

  const { data: jobs } = await supabase
    .from("invoice_processing_jobs")
    .select(
      `*, attachments!inner ( file_name, content_type, ticket_id,
         tickets ( id, reference, subject ) )`,
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  const rows = (jobs ?? []) as unknown as (JobRow & {
    attachments: {
      file_name: string;
      content_type: string | null;
      ticket_id: string | null;
      tickets: { id: string; reference: string; subject: string } | null;
    } | null;
  })[];

  // Extrahierte Daten für die enthaltenen Anhänge laden.
  const attachmentIds = rows.map((r) => r.attachment_id);
  const extractedByAtt = new Map<string, ExtractedRow>();
  if (attachmentIds.length > 0) {
    const { data: extracted } = await supabase
      .from("extracted_invoice_data")
      .select("*")
      .in("attachment_id", attachmentIds);
    for (const e of (extracted ?? []) as ExtractedRow[]) {
      extractedByAtt.set(e.attachment_id, e);
    }
  }

  const items: InvoiceJobItem[] = rows.map((r) => {
    const att = r.attachments;
    const ticket = att?.tickets ?? null;
    return {
      job: mapJob(r, extractedByAtt.get(r.attachment_id) ?? null),
      fileName: att?.file_name ?? "Anhang",
      contentType: att?.content_type ?? null,
      ticketId: ticket?.id ?? att?.ticket_id ?? null,
      ticketReference: ticket?.reference ?? null,
      ticketSubject: ticket?.subject ?? null,
    };
  });

  return { items, stats: computeStats(items) };
}

function computeStats(items: InvoiceJobItem[]): InvoiceDashboardStats {
  let invoices = 0;
  let uploaded = 0;
  let needsReview = 0;
  let notInvoices = 0;
  let failed = 0;
  let processing = 0;
  const totals = new Map<string, { amount: number; count: number }>();

  for (const { job } of items) {
    if (isInProgress(job.status)) processing += 1;
    if (job.status === "getmyinvoices_upload_completed") uploaded += 1;
    if (job.status === "supplier_match_unclear" || job.status === "needs_manual_supplier_review") {
      needsReview += 1;
    }
    if (job.status === "not_invoice") notInvoices += 1;
    if (job.status === "getmyinvoices_upload_failed" || job.status === "error") failed += 1;

    if (job.isInvoice) {
      invoices += 1;
      const gross = job.extracted?.grossAmount ?? null;
      if (gross != null) {
        const cur = (job.extracted?.currency || "—").toUpperCase();
        const prev = totals.get(cur) ?? { amount: 0, count: 0 };
        totals.set(cur, { amount: prev.amount + gross, count: prev.count + 1 });
      }
    }
  }

  return {
    total: items.length,
    invoices,
    uploaded,
    needsReview,
    notInvoices,
    failed,
    processing,
    totalsByCurrency: Array.from(totals.entries())
      .map(([currency, v]) => ({ currency, ...v }))
      .sort((a, b) => b.amount - a.amount),
  };
}
