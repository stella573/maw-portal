import {
  GLOBAL_ROLES,
  ROLE_PERMISSIONS,
  type Permission,
  type RoleKey,
} from "./roles";

/**
 * Eine aufgelöste Rollen-Zuweisung eines Users.
 * `locationId === null` bedeutet global wirksam.
 */
export interface RoleAssignment {
  roleKey: RoleKey;
  locationId: string | null;
}

/**
 * Der für UI/Server-Gating relevante Berechtigungskontext eines Users.
 * Wird serverseitig aus profiles + user_roles aufgebaut (siehe
 * services/auth/current-user.ts) und an Komponenten durchgereicht.
 */
export interface AuthContext {
  profileId: string;
  email: string;
  fullName: string | null;
  assignments: RoleAssignment[];
  /**
   * Optionale, aus der DB geladene Rollen-→-Rechte-Matrix (role_permissions).
   * Wenn gesetzt, ist sie maßgeblich für can() – sonst Fallback auf die
   * statische ROLE_PERMISSIONS-Konstante. So spiegelt das UI-Gating die in der
   * Rechteübersicht editierbaren Rechte.
   */
  rolePermissions?: Partial<Record<RoleKey, readonly Permission[]>>;
}

/**
 * Prüft, ob der User ein Recht besitzt.
 * @param locationId optionaler Standort; wenn gesetzt, zählt auch ein
 *   global gültiges Recht. Wenn null/undefined: "irgendwo".
 *
 * Spiegelt die DB-Funktion private.has_permission(). UI-Gating only.
 */
export function can(
  ctx: AuthContext | null | undefined,
  permission: Permission,
  locationId?: string | null,
): boolean {
  if (!ctx) return false;

  return ctx.assignments.some((a) => {
    // Dynamische DB-Matrix bevorzugen, sonst statischer Fallback.
    const grants =
      ctx.rolePermissions?.[a.roleKey] ?? ROLE_PERMISSIONS[a.roleKey];
    if (!grants.includes(permission)) return false;

    // global wirksame Rolle gilt überall
    if (a.locationId === null) return true;
    // Aufrufer fragt "irgendwo"
    if (locationId === undefined || locationId === null) return true;
    // standortgebundene Rolle muss zum Standort passen
    return a.locationId === locationId;
  });
}

/** Globale Verwaltungsrolle (owner/admin)? */
export function isOwnerOrAdmin(ctx: AuthContext | null | undefined): boolean {
  if (!ctx) return false;
  return ctx.assignments.some(
    (a) => a.locationId === null && GLOBAL_ROLES.includes(a.roleKey),
  );
}

/** Verwaltet der User den Standort (owner/admin global oder location_manager)? */
export function managesLocation(
  ctx: AuthContext | null | undefined,
  locationId: string,
): boolean {
  if (!ctx) return false;
  if (isOwnerOrAdmin(ctx)) return true;
  return ctx.assignments.some(
    (a) => a.roleKey === "location_manager" && a.locationId === locationId,
  );
}

/** Liste der Standort-IDs, auf die der User standortgebunden Zugriff hat. */
export function scopedLocationIds(ctx: AuthContext | null | undefined): string[] {
  if (!ctx) return [];
  return Array.from(
    new Set(
      ctx.assignments
        .map((a) => a.locationId)
        .filter((id): id is string => id !== null),
    ),
  );
}
