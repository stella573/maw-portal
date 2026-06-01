import { PageHeader } from "@/components/layout/page-header";
import { getCurrentUser } from "@/services/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { getInvoiceDashboard } from "@/modules/maildesk/services/invoices";
import { InvoicesView } from "./invoices-view";

/**
 * Rechnungs-Dashboard: Übersicht aller per KI analysierten Anhänge mit
 * Klassifizierung (Rechnung / keine Rechnung / unklar / Fehler), Kennzahlen
 * und Filtern. Sichtbar mit tickets.read; RLS begrenzt zusätzlich auf die für
 * den User sichtbaren Anhänge.
 */
export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "tickets.read")) {
    return (
      <div>
        <PageHeader
          title="Rechnungen"
          description="KI-gestützte Rechnungserkennung für E-Mail-Anhänge."
        />
        <p className="text-sm text-[var(--muted)]">
          Du hast keine Berechtigung, dieses Modul zu sehen.
        </p>
      </div>
    );
  }

  const data = await getInvoiceDashboard();

  return (
    <div>
      <PageHeader
        title="Rechnungen"
        description="Automatisch erkannte Rechnungen aus E-Mail-Anhängen – per KI klassifiziert und mit extrahierten Eckdaten."
      />
      <InvoicesView data={data} />
    </div>
  );
}
