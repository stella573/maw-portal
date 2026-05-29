import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { getCurrentUser } from "@/services/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { getDashboardStats } from "@/modules/maildesk/services/dashboard";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const showMaildesk = can(user, "tickets.read");

  const stats = showMaildesk && user
    ? await getDashboardStats(user.profileId)
    : null;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Überblick über den Mining Adventure World Mitarbeiter HUB."
      />

      {stats ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Offene Tickets" value={stats.open} href="/maildesk?status=open" />
            <StatCard label="Wartend" value={stats.pending} href="/maildesk?status=pending" />
            <StatCard label="Heute erledigt" value={stats.resolvedToday} />
            <StatCard label="Unzugewiesen (offen)" value={stats.unassignedOpen} />
            <StatCard label="Mir zugewiesen" value={stats.assignedToMe} />
          </div>

          {stats.perMailbox.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-3 text-sm font-medium">Offene Tickets je Postfach</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {stats.perMailbox.map((mb) => (
                  <div
                    key={mb.name}
                    className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
                  >
                    <span className="truncate text-sm">{mb.name}</span>
                    <span className="text-lg font-semibold">{mb.open}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-[var(--muted)]">
          Willkommen im MAW Mitarbeiter HUB. Für dich sind aktuell keine
          MailDesk-Kennzahlen freigeschaltet.
        </p>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href?: string;
}) {
  const inner = (
    <>
      <div className="text-sm text-[var(--muted)]">{label}</div>
      <div className="mt-2 text-3xl font-semibold">{value}</div>
    </>
  );
  const className =
    "block rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 transition";
  return href ? (
    <Link href={href as never} className={`${className} hover:bg-[var(--background)]`}>
      {inner}
    </Link>
  ) : (
    <div className={className}>{inner}</div>
  );
}
