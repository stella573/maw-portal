"use client";

import { useActionState, useState, useTransition } from "react";
import { FileText, CheckCircle2, AlertCircle, Trash2 } from "lucide-react";
import {
  saveGmiCredentials,
  testGmiConnection,
  removeGmiConnection,
  type ActionResult,
} from "./actions";
import type { GmiConnectionStatus } from "@/services/admin/getmyinvoices";

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

export function GetMyInvoicesAdmin({ status }: { status: GmiConnectionStatus }) {
  const [result, action, pending] = useActionState(saveGmiCredentials, null);
  const [testResult, setTestResult] = useState<ActionResult | null>(null);
  const [testing, startTest] = useTransition();
  const [removing, startRemove] = useTransition();

  function test() {
    setTestResult(null);
    startTest(async () => setTestResult(await testGmiConnection()));
  }
  function remove() {
    if (!confirm("GetMyInvoices-Verbindung wirklich entfernen?")) return;
    startRemove(async () => {
      await removeGmiConnection();
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
        <span className="font-medium text-[var(--foreground)]">GetMyInvoices</span> –
        eine globale Anbindung fürs ganze Unternehmen (account-basiert). Dient als
        Ziel, um später Rechnungen aus den HUB-E-Mails nach GMI zu übertragen. Den
        API-Key findest du in GetMyInvoices oben rechts unter{" "}
        <em>Account → API-Zugang</em>.
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 font-medium">
            <FileText className="h-4 w-4 text-[var(--muted)]" />
            GetMyInvoices
          </h3>
          {status.configured ? (
            status.lastVerifiedAt ? (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" /> Verbunden
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

        {status.configured && (
          <p className="mt-2 text-xs text-[var(--muted)]">
            Zuletzt getestet: {fmtDate(status.lastVerifiedAt)}
          </p>
        )}

        <form action={action} className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-[var(--muted)]">
              API-Key {status.configured && <span>(leer = unverändert)</span>}
            </label>
            <input
              name="apiKey"
              type="password"
              autoComplete="new-password"
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand-500"
              placeholder={status.configured ? "••••••••" : "GetMyInvoices API-Key"}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-[var(--muted)]">API Base-URL</label>
            <input
              name="baseUrl"
              defaultValue={status.baseUrl}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 font-mono text-xs outline-none focus:border-brand-500"
              placeholder="https://api.getmyinvoices.com/accounts/v3"
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
            {status.configured && (
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
    </div>
  );
}
