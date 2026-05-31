"use client";

import { useActionState, useState, useTransition } from "react";
import { RefreshCw, UserPlus, CheckCircle2, XCircle, Users } from "lucide-react";
import { runPersonioSync, createPortalAccess, type ActionResult } from "./actions";
import type { DirectoryEmployee } from "@/services/admin/personio";
import type { RoleOption, LocationOption } from "@/services/admin/users";

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  inactive: "bg-red-500/15 text-red-500",
  onboarding: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  leave: "bg-slate-500/15 text-slate-500",
};

const STATUS_LABELS: Record<string, string> = {
  active: "aktiv",
  inactive: "inaktiv",
  onboarding: "Onboarding",
  leave: "abwesend",
};

interface Props {
  employees: DirectoryEmployee[];
  roles: RoleOption[];
  locations: LocationOption[];
  canManage: boolean;
  canCreateAccess: boolean;
}

export function EmployeesView({
  employees,
  roles,
  locations,
  canManage,
  canCreateAccess,
}: Props) {
  const [syncing, startSync] = useTransition();
  const [syncMsg, setSyncMsg] = useState<ActionResult | null>(null);

  function sync() {
    setSyncMsg(null);
    startSync(async () => setSyncMsg(await runPersonioSync()));
  }

  return (
    <div className="space-y-4">
      {/* Kopf: Anzahl + Sync */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-[var(--muted)]">
          {employees.length} Mitarbeiter im Verzeichnis
        </span>
        {canManage && (
          <button
            onClick={sync}
            disabled={syncing}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Synchronisiere…" : "Aus Personio synchronisieren"}
          </button>
        )}
      </div>
      {syncMsg && (
        <p className={`text-sm ${syncMsg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
          {syncMsg.message}
        </p>
      )}

      {employees.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-10 text-center">
          <Users className="mx-auto h-8 w-8 text-[var(--muted)]" />
          <p className="mt-3 text-sm text-[var(--muted)]">
            Noch keine Mitarbeiter im Verzeichnis.
            {canManage
              ? " Klicke oben auf „Aus Personio synchronisieren“."
              : " Ein Administrator muss zuerst aus Personio synchronisieren."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted)]">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Position</th>
                <th className="px-4 py-3 font-medium">Abteilung</th>
                <th className="px-4 py-3 font-medium">Standort</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Zugang</th>
                {canCreateAccess && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {employees.map((e) => (
                <EmployeeRow
                  key={e.personioId}
                  emp={e}
                  roles={roles}
                  locations={locations}
                  canCreateAccess={canCreateAccess}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EmployeeRow({
  emp,
  roles,
  locations,
  canCreateAccess,
}: {
  emp: DirectoryEmployee;
  roles: RoleOption[];
  locations: LocationOption[];
  canCreateAccess: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [result, action, pending] = useActionState(
    async (prev: ActionResult | null, fd: FormData) => {
      const r = await createPortalAccess(prev, fd);
      if (r.ok) setOpen(false);
      return r;
    },
    null,
  );

  const canOffer = canCreateAccess && emp.status === "active" && !emp.hasAccess && !!emp.email;

  return (
    <>
      <tr className="align-top">
        <td className="px-4 py-3">
          <div className="font-medium">{emp.fullName}</div>
          {emp.email && <div className="text-xs text-[var(--muted)]">{emp.email}</div>}
        </td>
        <td className="px-4 py-3">{emp.position ?? "—"}</td>
        <td className="px-4 py-3">{emp.department ?? "—"}</td>
        <td className="px-4 py-3">{emp.office ?? "—"}</td>
        <td className="px-4 py-3">
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[emp.status] ?? "bg-slate-500/15 text-slate-500"}`}
          >
            {STATUS_LABELS[emp.status] ?? emp.status}
          </span>
        </td>
        <td className="px-4 py-3">
          {emp.hasAccess ? (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Zugang
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-[var(--muted)]">
              <XCircle className="h-3.5 w-3.5" /> kein Zugang
            </span>
          )}
        </td>
        {canCreateAccess && (
          <td className="px-4 py-3 text-right">
            {canOffer && (
              <button
                onClick={() => setOpen((o) => !o)}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs transition hover:bg-[var(--background)]"
              >
                <UserPlus className="h-3.5 w-3.5" /> Zugang anlegen
              </button>
            )}
          </td>
        )}
      </tr>
      {open && canOffer && (
        <tr>
          <td colSpan={canCreateAccess ? 7 : 6} className="px-4 pb-4">
            <form
              action={action}
              className="flex flex-wrap items-end gap-3 rounded-lg bg-[var(--background)] p-3"
            >
              <input type="hidden" name="personioId" value={emp.personioId} />
              <div className="min-w-[10rem]">
                <label className="block text-xs text-[var(--muted)]">Initialpasswort</label>
                <input
                  name="password"
                  type="text"
                  required
                  minLength={10}
                  placeholder="mind. 10 Zeichen"
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--muted)]">Rolle</label>
                <select
                  name="roleId"
                  required
                  className="mt-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[var(--muted)]">Standort</label>
                <select
                  name="locationId"
                  className="mt-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm"
                >
                  <option value="">global</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
              >
                {pending ? "Lege an…" : "Zugang anlegen"}
              </button>
              {result && !result.ok && (
                <p className="w-full text-sm text-red-500">{result.message}</p>
              )}
            </form>
          </td>
        </tr>
      )}
    </>
  );
}
