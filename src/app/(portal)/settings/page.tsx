import { getCurrentUser } from "@/services/auth/current-user";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const user = await getCurrentUser();

  // 2FA-Status der aktuellen Session: verifizierte TOTP-Faktoren zählen.
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verifiedTotp = (factors?.all ?? []).filter(
    (f) => f.factor_type === "totp" && f.status === "verified",
  );

  return (
    <div>
      <div className="max-w-xl space-y-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-sm font-medium">Konto</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-[var(--muted)]">Name</dt>
              <dd>{user?.fullName ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--muted)]">E-Mail</dt>
              <dd>{user?.email}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--muted)]">Rollen</dt>
              <dd>
                {user && user.assignments.length > 0
                  ? user.assignments.map((a) => a.roleKey).join(", ")
                  : "—"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-sm font-medium">Sicherheit</h2>
          <div className="mt-3 flex items-center justify-between text-sm">
            <div>
              <div className="font-medium">Zwei-Faktor-Authentifizierung</div>
              <div className="text-[var(--muted)]">
                Authenticator-App (TOTP) · für alle verpflichtend
              </div>
            </div>
            {verifiedTotp.length > 0 ? (
              <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                Aktiv
              </span>
            ) : (
              <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                Nicht eingerichtet
              </span>
            )}
          </div>
          <p className="mt-3 text-xs text-[var(--muted)]">
            Geräteverwaltung (weiteres Gerät hinzufügen, zurücksetzen) folgt.
            Ein Zurücksetzen ist über einen Owner/Admin möglich.
          </p>
        </div>

        <p className="text-sm text-[var(--muted)]">
          Benutzer-, Postfach- und Rechteverwaltung findest du in der
          Seitennavigation links.
        </p>
      </div>
    </div>
  );
}
