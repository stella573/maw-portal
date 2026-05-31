import Link from "next/link";
import { getCurrentUser } from "@/services/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/permissions";
import { getDashboardStats } from "@/modules/maildesk/services/dashboard";
import { NAVIGATION } from "@/config/navigation";
import { ProfileCard } from "./profile-card";
import { OnlineColleagues } from "./online-colleagues";

/** Tageszeit-abhängige Begrüßung (Berliner Zeit). */
function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );
  if (hour < 5) return "Noch wach";
  if (hour < 11) return "Guten Morgen";
  if (hour < 17) return "Guten Tag";
  if (hour < 22) return "Guten Abend";
  return "Späte Schicht";
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const [{ data: profile }, { data: personio }, stats] = await Promise.all([
    supabase.from("profiles").select("avatar_url").eq("id", user.profileId).maybeSingle(),
    supabase
      .from("personio_employees")
      .select("position")
      .eq("profile_id", user.profileId)
      .maybeSingle(),
    getDashboardStats(user.profileId),
  ]);

  const firstName = (user.fullName ?? user.email).split(" ")[0];
  const hasTicketAccess = stats.perMailbox.length > 0 || stats.assignedToMe > 0;

  // Schnellzugriff auf freigeschaltete Module (ohne Dashboard selbst).
  const quickLinks = NAVIGATION.filter(
    (item) =>
      item.status === "active" &&
      item.key !== "dashboard" &&
      (!item.permission || can(user, item.permission)),
  );

  return (
    <div className="space-y-6">
      {/* Begrüßungs-Banner im MAW-Stil */}
      <div className="relative overflow-hidden rounded-2xl border border-brand-500/30 bg-gradient-to-br from-brand-600/15 via-[var(--surface)] to-[var(--surface)] p-6">
        <div className="relative z-10">
          <p className="text-sm font-medium text-brand-600 dark:text-brand-300">
            ⛏️ Glück auf!
          </p>
          <h1 className="mt-1 text-2xl font-bold">
            {greeting()}, {firstName}!
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Schön, dass du da bist. Hier ist dein Stollen-Überblick für heute.
          </p>
        </div>
      </div>

      {/* Profil + Online-Kolleg:innen */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ProfileCard
          name={user.fullName ?? user.email}
          email={user.email}
          position={personio?.position ?? null}
          initialAvatarUrl={profile?.avatar_url ?? null}
        />
        <div className="lg:col-span-2">
          <OnlineColleagues meId={user.profileId} />
        </div>
      </div>

      {/* Schnellzugriffe */}
      {quickLinks.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-medium text-[var(--muted)]">Schnellzugriff</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {quickLinks.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.key}
                  href={item.href as never}
                  className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition hover:border-brand-500/50 hover:bg-[var(--background)]"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600/10 text-brand-600 dark:text-brand-300">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="font-medium">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Ticket-Kennzahlen – nur wer Postfach-/Ticket-Zugang hat */}
      {hasTicketAccess && (
        <div>
          <h2 className="mb-3 text-sm font-medium text-[var(--muted)]">MailDesk</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Offene Tickets" value={stats.open} href="/maildesk?view=active" />
            <StatCard label="Wartend" value={stats.pending} href="/maildesk?view=active" />
            <StatCard label="Heute erledigt" value={stats.resolvedToday} />
            <StatCard label="Unzugewiesen (offen)" value={stats.unassignedOpen} />
            <StatCard label="Mir zugewiesen" value={stats.assignedToMe} />
          </div>

          {stats.perMailbox.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-xs font-medium text-[var(--muted)]">Offen je Postfach</h3>
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
        </div>
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
