import { PageHeader } from "@/components/layout/page-header";
import { getCurrentUser } from "@/services/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { listDirectory } from "@/services/admin/personio";
import {
  listRoles,
  listLocations,
  type RoleOption,
  type LocationOption,
} from "@/services/admin/users";
import { EmployeesView } from "./employees-view";

/**
 * Mitarbeiter-Verzeichnis (aus Personio synchronisiert). Übersicht für alle mit
 * employees.read; Sync & Zugänge nur mit employees.manage / users.manage.
 */
export default async function EmployeesPage() {
  const ctx = await getCurrentUser();
  if (!ctx || !can(ctx, "employees.read")) {
    return (
      <div>
        <PageHeader title="Mitarbeiter" description="Verzeichnis aus Personio." />
        <p className="text-sm text-[var(--muted)]">
          Du hast keine Berechtigung, das Mitarbeiter-Verzeichnis zu sehen.
        </p>
      </div>
    );
  }

  const canManage = can(ctx, "employees.manage");
  const canCreateAccess = can(ctx, "users.manage");

  const [employees, roles, locations] = await Promise.all([
    listDirectory(),
    canCreateAccess ? listRoles() : Promise.resolve([] as RoleOption[]),
    canCreateAccess ? listLocations() : Promise.resolve([] as LocationOption[]),
  ]);

  return (
    <div>
      <PageHeader
        title="Mitarbeiter"
        description="Aktuelles Verzeichnis – synchronisiert aus Personio."
      />
      <EmployeesView
        employees={employees}
        roles={roles}
        locations={locations}
        canManage={canManage}
        canCreateAccess={canCreateAccess}
      />
    </div>
  );
}
