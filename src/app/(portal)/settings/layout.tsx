import { PageHeader } from "@/components/layout/page-header";
import { getCurrentUser } from "@/services/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { SETTINGS_NAV } from "@/config/settings-nav";
import { SettingsNav } from "./settings-nav";

/**
 * Rahmen des Einstellungsbereichs mit Unter-Navigation (Konto, Benutzer,
 * Postfächer, Rechte). Permission-Gating serverseitig.
 */
export default async function SettingsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const ctx = await getCurrentUser();

  const allowedKeys = SETTINGS_NAV.filter(
    (i) => !i.permission || can(ctx, i.permission),
  ).map((i) => i.key);

  return (
    <div>
      <PageHeader title="Einstellungen" description="Konto, Benutzer, Postfächer & Rechte." />
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <aside className="lg:border-r lg:border-[var(--border)] lg:pr-4">
          <SettingsNav allowedKeys={allowedKeys} />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
