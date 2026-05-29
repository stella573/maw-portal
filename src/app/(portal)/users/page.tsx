import { PageHeader } from "@/components/layout/page-header";
import { getCurrentUser } from "@/services/auth/current-user";
import { can } from "@/lib/auth/permissions";
import {
  listUsers,
  listRoles,
  listLocations,
} from "@/services/admin/users";
import { UserAdmin } from "./user-admin";

/**
 * Benutzer- & Rollenverwaltung. Nur mit users.read sichtbar, Mutationen nur
 * mit users.manage. Server-seitige Absicherung zusätzlich zur Navigation.
 */
export default async function UsersPage() {
  const ctx = await getCurrentUser();

  // Hard-Guard: ohne Leserecht gar nicht rendern.
  if (!ctx || !can(ctx, "users.read")) {
    return (
      <div>
        <PageHeader title="Benutzer" />
        <p className="text-sm text-[var(--muted)]">
          Du hast keine Berechtigung, die Benutzerverwaltung zu sehen.
        </p>
      </div>
    );
  }

  const [users, roles, locations] = await Promise.all([
    listUsers(),
    listRoles(),
    listLocations(),
  ]);

  return (
    <div>
      <PageHeader
        title="Benutzer & Rollen"
        description="Mitarbeiter anlegen und Rollen verwalten."
      />
      <UserAdmin
        users={users}
        roles={roles}
        locations={locations}
        canManage={can(ctx, "users.manage")}
      />
    </div>
  );
}
