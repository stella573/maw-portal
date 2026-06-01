import { getCurrentUser } from "@/services/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { listRollerConnections } from "@/services/admin/roller";
import { getGmiConnectionStatus } from "@/services/admin/getmyinvoices";
import { IntegrationsAdmin } from "./integrations-admin";
import { GetMyInvoicesAdmin } from "./getmyinvoices-admin";

/**
 * Integrationen / API-Zugänge:
 *  - ROLLER je Standort (Dorsten/Hamm)
 *  - GetMyInvoices global (account-basiert)
 * Nur mit integrations.manage.
 */
export default async function IntegrationsPage() {
  const ctx = await getCurrentUser();
  if (!ctx || !can(ctx, "integrations.manage")) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Du hast keine Berechtigung, Integrationen zu verwalten.
      </p>
    );
  }

  const [connections, gmiStatus] = await Promise.all([
    listRollerConnections(),
    getGmiConnectionStatus(),
  ]);

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">ROLLER</h2>
          <p className="text-sm text-[var(--muted)]">
            ROLLER-API je Standort anbinden. Diese Verbindung wird für Buchungen,
            Analytics u. v. m. genutzt.
          </p>
        </div>
        <IntegrationsAdmin connections={connections} />
      </div>

      <div className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">GetMyInvoices</h2>
          <p className="text-sm text-[var(--muted)]">
            Zentrale Rechnungsverwaltung – global angebunden, um Rechnungen aus den
            HUB-E-Mails nach GetMyInvoices zu übertragen.
          </p>
        </div>
        <GetMyInvoicesAdmin status={gmiStatus} />
      </div>
    </div>
  );
}
