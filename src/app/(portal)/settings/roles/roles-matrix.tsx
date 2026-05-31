"use client";

import { useState, useTransition } from "react";
import { Lock } from "lucide-react";
import { toggleRolePermission } from "./actions";
import type { RolesMatrix } from "@/services/admin/roles";

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
  "tickets.tag": "Tags am Ticket anwenden",
  "templates.read": "Vorlagen lesen",
  "templates.manage": "Vorlagen verwalten",
  "audit.read": "Audit-Log lesen",
  "users.read": "Benutzer lesen",
  "users.manage": "Benutzer verwalten",
  "roles.manage": "Rollen & Rechte verwalten",
  "locations.manage": "Standorte verwalten",
  "mailboxes.manage": "Postfächer verwalten",
  "mailboxes.send_as": "Aus anderem Postfach senden",
  "signatures.manage": "Signaturen anderer verwalten",
  "employees.read": "Mitarbeiter-Verzeichnis ansehen",
  "employees.manage": "Mitarbeiter aus Personio synchronisieren",
  "integrations.manage": "Integrationen/API-Zugänge verwalten",
};

export function RolesMatrixEditor({ matrix }: { matrix: RolesMatrix }) {
  const [granted, setGranted] = useState<Record<string, boolean>>(matrix.granted);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function onToggle(roleId: string, permissionId: string, next: boolean) {
    const key = `${roleId}:${permissionId}`;
    // optimistisch
    setGranted((g) => ({ ...g, [key]: next }));
    setError("");

    const fd = new FormData();
    fd.set("roleId", roleId);
    fd.set("permissionId", permissionId);
    fd.set("grant", next ? "true" : "false");

    startTransition(async () => {
      const res = await toggleRolePermission(null, fd);
      if (!res.ok) {
        // zurückrollen
        setGranted((g) => ({ ...g, [key]: !next }));
        setError(res.message);
      }
    });
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="px-4 py-3 text-left font-medium">Recht</th>
              {matrix.roles.map((r) => (
                <th key={r.id} className="px-3 py-3 text-center font-medium">
                  <div className="flex items-center justify-center gap-1">
                    {r.name}
                    {r.key === "owner" && (
                      <Lock className="h-3 w-3 text-[var(--muted)]" aria-label="geschützt" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.permissions.map((perm) => (
              <tr key={perm.id} className="border-b border-[var(--border)] last:border-0">
                <td className="px-4 py-2.5">
                  <div>{PERMISSION_LABELS[perm.key] ?? perm.key}</div>
                  <div className="text-[10px] text-[var(--muted)]">{perm.key}</div>
                </td>
                {matrix.roles.map((r) => {
                  const key = `${r.id}:${perm.id}`;
                  const checked = granted[key] ?? false;
                  const locked = r.key === "owner";
                  return (
                    <td key={r.id} className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={locked ? true : checked}
                        disabled={locked || pending}
                        onChange={(e) => onToggle(r.id, perm.id, e.target.checked)}
                        className="h-4 w-4 cursor-pointer accent-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label={`${perm.key} für ${r.name}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[var(--muted)]">
        Änderungen werden sofort gespeichert und gelten für alle Benutzer dieser
        Rolle. Die <strong>Owner</strong>-Rolle ist geschützt und behält immer
        alle Rechte. Standortgebundene Rollen wirken nur auf ihre zugewiesenen
        Standorte/Postfächer.
      </p>
    </div>
  );
}
