import { redirect } from "next/navigation";
import { PortalShell } from "@/components/layout/portal-shell";
import { getCurrentUser } from "@/services/auth/current-user";

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

  return (
    <PortalShell userEmail={user.email} userName={user.fullName}>
      {children}
    </PortalShell>
  );
}
