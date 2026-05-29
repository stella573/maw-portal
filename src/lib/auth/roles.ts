/**
 * Rollen- & Rechte-Definitionen (App-Layer).
 *
 * Diese Konstanten spiegeln das DB-Seed (supabase/seed.sql). Sie dienen dem
 * UI-Gating und frühen Prüfungen. Die HARTE Sicherheitsgrenze sind die
 * RLS-Policies in der Datenbank – niemals allein auf diese Werte verlassen.
 */

export const ROLE_KEYS = ["owner", "admin", "location_manager", "employee"] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const PERMISSIONS = [
  "tickets.read",
  "tickets.create",
  "tickets.update",
  "tickets.reply",
  "tickets.assign",
  "tickets.delete",
  "customers.read",
  "customers.manage",
  "notes.create",
  "tags.manage",
  "templates.read",
  "templates.manage",
  "audit.read",
  "users.read",
  "users.manage",
  "roles.manage",
  "locations.manage",
  "mailboxes.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Rollen-→-Rechte-Matrix (identisch zum DB-Seed). */
export const ROLE_PERMISSIONS: Record<RoleKey, readonly Permission[]> = {
  owner: PERMISSIONS,
  admin: PERMISSIONS,
  location_manager: [
    "tickets.read",
    "tickets.create",
    "tickets.update",
    "tickets.reply",
    "tickets.assign",
    "tickets.delete",
    "customers.read",
    "customers.manage",
    "notes.create",
    "tags.manage",
    "templates.read",
    "templates.manage",
    "mailboxes.manage",
  ],
  employee: [
    "tickets.read",
    "tickets.create",
    "tickets.update",
    "tickets.reply",
    "customers.read",
    "notes.create",
    "templates.read",
  ],
};

export const GLOBAL_ROLES: readonly RoleKey[] = ["owner", "admin"];
