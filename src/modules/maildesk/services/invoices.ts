import { createClient } from "@/lib/supabase/server";
import { mapAnalysisRow } from "@/services/attachments/invoice-analysis";
import type { Tables, InvoiceClassification } from "@/types/database";
import type { AttachmentAnalysis } from "@/lib/ai/invoice-types";

/**
 * Datenquelle für das Rechnungs-Dashboard: alle KI-analysierten Anhänge, die
 * der eingeloggte User sehen darf (RLS), inkl. Ticket-Kontext und Kennzahlen.
 */

export interface AnalyzedAttachmentItem {
  analysis: AttachmentAnalysis;
  fileName: string;
  contentType: string | null;
  ticketId: string | null;
  ticketReference: string | null;
  ticketSubject: string | null;
}

export interface InvoiceDashboardStats {
  total: number;
  invoices: number;
  notInvoices: number;
  unclear: number;
  unsupported: number;
  errors: number;
  processing: number;
  /** Summe der erkannten Rechnungsbeträge je Währung. */
  totalsByCurrency: { currency: string; amount: number; count: number }[];
}

export interface InvoiceDashboardData {
  items: AnalyzedAttachmentItem[];
  stats: InvoiceDashboardStats;
}

type AnalysisRow = Tables<"attachment_ai_analysis">;

/** Lädt alle sichtbaren Analysen samt Ticket-Kontext (neueste zuerst). */
export async function getInvoiceDashboard(
  limit = 200,
): Promise<InvoiceDashboardData> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("attachment_ai_analysis")
    .select(
      `id, attachment_id, status, is_invoice, confidence, classification, reason,
       extracted_invoice_number, extracted_invoice_date, extracted_vendor_name,
       extracted_total_amount, extracted_currency, raw_ai_response,
       created_at, updated_at,
       attachments!inner ( file_name, content_type, ticket_id,
         tickets ( id, reference, subject ) )`,
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  const items: AnalyzedAttachmentItem[] = (data ?? []).map((row) => {
    const r = row as unknown as AnalysisRow & {
      attachments: {
        file_name: string;
        content_type: string | null;
        ticket_id: string | null;
        tickets: { id: string; reference: string; subject: string } | null;
      } | null;
    };
    const att = r.attachments;
    const ticket = att?.tickets ?? null;
    return {
      analysis: mapAnalysisRow(r),
      fileName: att?.file_name ?? "Anhang",
      contentType: att?.content_type ?? null,
      ticketId: ticket?.id ?? att?.ticket_id ?? null,
      ticketReference: ticket?.reference ?? null,
      ticketSubject: ticket?.subject ?? null,
    };
  });

  return { items, stats: computeStats(items) };
}

function computeStats(items: AnalyzedAttachmentItem[]): InvoiceDashboardStats {
  const counts: Record<InvoiceClassification, number> = {
    invoice: 0,
    not_invoice: 0,
    unclear: 0,
    unsupported_file_type: 0,
    error: 0,
  };
  let processing = 0;
  const totals = new Map<string, { amount: number; count: number }>();

  for (const item of items) {
    const a = item.analysis;
    if (a.status === "processing") {
      processing += 1;
      continue;
    }
    counts[a.classification] += 1;
    if (a.classification === "invoice" && a.totalAmount != null) {
      const cur = (a.currency || "—").toUpperCase();
      const prev = totals.get(cur) ?? { amount: 0, count: 0 };
      totals.set(cur, {
        amount: prev.amount + a.totalAmount,
        count: prev.count + 1,
      });
    }
  }

  return {
    total: items.length,
    invoices: counts.invoice,
    notInvoices: counts.not_invoice,
    unclear: counts.unclear,
    unsupported: counts.unsupported_file_type,
    errors: counts.error,
    processing,
    totalsByCurrency: Array.from(totals.entries())
      .map(([currency, v]) => ({ currency, ...v }))
      .sort((a, b) => b.amount - a.amount),
  };
}
