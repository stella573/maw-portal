import { getCurrentUser } from "@/services/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { getRolesMatrix } from "@/services/admin/roles";
import { RolesMatrixEditor } from "./roles-matrix";

/**
 * Editierbare Rechteübersicht. Die DB (role_permissions) ist die Quelle der
 * Wahrheit – RLS-Policies und das UI-Gating (can()) lesen dieselbe Tabelle.
 * Die Owner-Rolle ist serverseitig vor Änderungen geschützt.
 */
export default async function RolesPage() {
  const ctx = await getCurrentUser();
  if (!ctx || !can(ctx, "roles.manage")) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Du hast keine Berechtigung, die Rechteübersicht zu sehen.
      </p>
    );
  }

  const matrix = await getRolesMatrix();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Rechteübersicht</h2>
        <p className="text-sm text-[var(--muted)]">
          Rechte pro Rolle an- und abschalten. Rollen werden Benutzern unter
          „Benutzer &amp; Rollen“ zugewiesen.
        </p>
      </div>
      <RolesMatrixEditor matrix={matrix} />
    </div>
  );
}
