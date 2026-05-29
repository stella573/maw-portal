import { PageHeader } from "@/components/layout/page-header";
import { getCurrentUser } from "@/services/auth/current-user";

export default async function SettingsPage() {
  const user = await getCurrentUser();

  return (
    <div>
      <PageHeader title="Einstellungen" description="Konto & Portal-Konfiguration." />

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

        <p className="text-sm text-[var(--muted)]">
          Benutzer- und Rollenverwaltung folgen in Phase&nbsp;1.2.
        </p>
      </div>
    </div>
  );
}
