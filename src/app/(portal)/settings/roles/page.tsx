import { getCurrentUser } from "@/services/auth/current-user";
import { can } from "@/lib/auth/permissions";
import {
  ROLE_KEYS,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  type RoleKey,
} from "@/lib/auth/roles";
import { Check } from "lucide-react";

const ROLE_LABELS: Record<RoleKey, string> = {
  owner: "Owner",
  admin: "Admin",
  location_manager: "Standortleitung",
  employee: "Mitarbeiter",
};

const PERMISSION_LABELS: Record<string, string> = {
  "tickets.read": "Tickets lesen",
  "tickets.create": "Tickets erstellen",
  "tickets.update": "Tickets bearbeiten",
  "tickets.reply": "Tickets beantworten",
  "tickets.assign": "Tickets zuweisen",
  "tickets.delete": "Tickets löschen",
  "customers.read": "Kunden lesen",
  "customers.manage": "Kunden verwalten",
  "notes.create": "Notizen erstellen",
  "tags.manage": "Tags verwalten",
  "templates.read": "Vorlagen lesen",
  "templates.manage": "Vorlagen verwalten",
  "audit.read": "Audit-Log lesen",
  "users.read": "Benutzer lesen",
  "users.manage": "Benutzer verwalten",
  "roles.manage": "Rollen & Rechte verwalten",
  "locations.manage": "Standorte verwalten",
  "mailboxes.manage": "Postfächer verwalten",
};

/**
 * Rechteübersicht: zeigt die Rollen-→-Rechte-Matrix (read-only). Spiegelt das
 * DB-Seed. Eine editierbare Rechtevergabe könnte später ergänzt werden; aktuell
 * ist die Matrix bewusst fix (sicher & nachvollziehbar).
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

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Rechteübersicht</h2>
        <p className="text-sm text-[var(--muted)]">
          Welche Rolle welche Rechte besitzt. Rollen werden Benutzern unter
          „Benutzer &amp; Rollen“ zugewiesen.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="px-4 py-3 text-left font-medium">Recht</th>
              {ROLE_KEYS.map((r) => (
                <th key={r} className="px-3 py-3 text-center font-medium">
                  {ROLE_LABELS[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSIONS.map((perm) => (
              <tr
                key={perm}
                className="border-b border-[var(--border)] last:border-0"
              >
                <td className="px-4 py-2.5">
                  <div>{PERMISSION_LABELS[perm] ?? perm}</div>
                  <div className="text-[10px] text-[var(--muted)]">{perm}</div>
                </td>
                {ROLE_KEYS.map((r) => {
                  const granted = ROLE_PERMISSIONS[r].includes(perm);
                  return (
                    <td key={r} className="px-3 py-2.5 text-center">
                      {granted ? (
                        <Check className="mx-auto h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <span className="text-[var(--muted)]">–</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-[var(--muted)]">
        Hinweis: Die Matrix ist die verbindliche Quelle (gespiegelt in DB-RLS).
        Standortgebundene Rollen (Standortleitung, Mitarbeiter) wirken nur auf
        ihre zugewiesenen Standorte bzw. Postfächer.
      </p>
    </div>
  );
}
