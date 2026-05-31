import { getCurrentUser } from "@/services/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { listRollerConnections } from "@/services/admin/roller";
import { IntegrationsAdmin } from "./integrations-admin";

/**
 * Integrationen / API-Zugänge. Aktuell: ROLLER je Standort (Dorsten/Hamm).
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

  const connections = await listRollerConnections();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Integrationen</h2>
        <p className="text-sm text-[var(--muted)]">
          ROLLER-API je Standort anbinden. Diese Verbindung wird später für
          Buchungen, Dienstplanung u. v. m. genutzt.
        </p>
      </div>
      <IntegrationsAdmin connections={connections} />
    </div>
  );
}
