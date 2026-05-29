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
      <p className="text-sm text-[var(--muted)]">
        Du hast keine Berechtigung, die Benutzerverwaltung zu sehen.
      </p>
    );
  }

  const [users, roles, locations] = await Promise.all([
    listUsers(),
    listRoles(),
    listLocations(),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Benutzer & Rollen</h2>
        <p className="text-sm text-[var(--muted)]">
          Mitarbeiter anlegen und Rollen verwalten.
        </p>
      </div>
      <UserAdmin
        users={users}
        roles={roles}
        locations={locations}
        canManage={can(ctx, "users.manage")}
      />
    </div>
  );
}
