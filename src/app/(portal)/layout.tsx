import { redirect } from "next/navigation";
import { PortalShell } from "@/components/layout/portal-shell";
import { getCurrentUser } from "@/services/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/auth/permissions";
import { NAVIGATION } from "@/config/navigation";

/**
 * Geschützte Shell für den gesamten Portalbereich.
 * Middleware leitet bereits unauthentifizierte Requests um; hier zusätzlich
 * der serverseitige Kontext für die (Client-)Shell.
 */
export default async function PortalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Avatar für Topbar + Online-Präsenz nachladen.
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", user.profileId)
    .maybeSingle();

  // Navigation serverseitig nach Permission filtern (UI-Gating). Items ohne
  // benötigtes Recht erscheinen gar nicht erst.
  const allowedNavKeys = NAVIGATION.filter(
    (item) => !item.permission || can(user, item.permission),
  ).map((item) => item.key);

  return (
    <PortalShell
      userEmail={user.email}
      userName={user.fullName}
      profileId={user.profileId}
      avatarUrl={profile?.avatar_url ?? null}
      allowedNavKeys={allowedNavKeys}
    >
      {children}
    </PortalShell>
  );
}
