"use client";

import { useActionState, useState, useTransition } from "react";
import { Plug, CheckCircle2, AlertCircle, Trash2 } from "lucide-react";
import {
  saveRollerCredentials,
  testRollerConnection,
  removeRollerConnection,
  type ActionResult,
} from "./actions";
import type { RollerConnectionStatus } from "@/services/admin/roller";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function IntegrationsAdmin({
  connections,
}: {
  connections: RollerConnectionStatus[];
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
        <span className="font-medium text-[var(--foreground)]">ROLLER</span> –
        pro Standort eine eigene API-Anbindung (OAuth Client-Credentials). Die
        Zugangsdaten findest du in ROLLER unter <em>Settings → API</em>.
      </div>

      {connections.length === 0 && (
        <p className="text-sm text-[var(--muted)]">
          Keine Standorte vorhanden. Lege zuerst unter Einstellungen Standorte an.
        </p>
      )}

      {connections.map((c) => (
        <RollerCard key={c.locationId} conn={c} />
      ))}
    </div>
  );
}

function RollerCard({ conn }: { conn: RollerConnectionStatus }) {
  const [result, action, pending] = useActionState(saveRollerCredentials, null);
  const [testResult, setTestResult] = useState<ActionResult | null>(null);
  const [testing, startTest] = useTransition();
  const [removing, startRemove] = useTransition();

  function test() {
    setTestResult(null);
    startTest(async () => setTestResult(await testRollerConnection(conn.locationId)));
  }
  function remove() {
    if (!confirm(`ROLLER-Verbindung für ${conn.locationName} wirklich entfernen?`)) return;
    startRemove(async () => {
      await removeRollerConnection(conn.locationId);
    });
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-medium">
          <Plug className="h-4 w-4 text-[var(--muted)]" />
          {conn.locationName}
        </h3>
        {conn.configured ? (
          conn.lastVerifiedAt ? (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Verbunden{conn.venueName ? ` · ${conn.venueName}` : ""}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-3.5 w-3.5" /> Konfiguriert, ungetestet
            </span>
          )
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-[var(--muted)]">
            <AlertCircle className="h-3.5 w-3.5" /> Nicht angebunden
          </span>
        )}
      </div>

      {conn.configured && (
        <p className="mt-2 text-xs text-[var(--muted)]">
          Client-ID: <span className="font-mono">{conn.clientId}</span> · Zuletzt
          getestet: {fmtDate(conn.lastVerifiedAt)}
        </p>
      )}

      <form action={action} className="mt-3 grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="locationId" value={conn.locationId} />
        <div>
          <label className="block text-xs font-medium text-[var(--muted)]">Client-ID</label>
          <input
            name="clientId"
            required
            defaultValue={conn.clientId ?? ""}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand-500"
            placeholder="ROLLER Client ID"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--muted)]">
            Client-Secret {conn.configured && <span className="text-[var(--muted)]">(leer = unverändert)</span>}
          </label>
          <input
            name="clientSecret"
            type="password"
            autoComplete="new-password"
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand-500"
            placeholder={conn.configured ? "••••••••" : "ROLLER Client Secret"}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {pending ? "Speichere…" : "Speichern & verbinden"}
          </button>
          {conn.configured && (
            <>
              <button
                type="button"
                onClick={test}
                disabled={testing}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm transition hover:bg-[var(--background)] disabled:opacity-60"
              >
                {testing ? "Teste…" : "Verbindung testen"}
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={removing}
                className="ml-auto inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-red-500 transition hover:bg-red-500/10 disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" /> Entfernen
              </button>
            </>
          )}
        </div>
      </form>

      {result && (
        <p className={`mt-2 text-sm ${result.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
          {result.message}
        </p>
      )}
      {testResult && (
        <p className={`mt-1 text-sm ${testResult.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
          {testResult.message}
        </p>
      )}
    </div>
  );
}
