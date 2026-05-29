import type { User } from "@supabase/supabase-js";

/**
 * Erzwungene Passwortänderung beim ersten Login.
 *
 * Beim Anlegen eines Mitarbeiters setzt der Owner ein Initialpasswort und das
 * Flag `must_change_password = true` in den user_metadata. Solange das Flag
 * gesetzt ist, leitet die Middleware den User auf /security/password, bis er
 * ein eigenes Passwort vergeben hat (Flag wird dann entfernt).
 */
export function mustChangePassword(user: User | null | undefined): boolean {
  if (!user) return false;
  return user.user_metadata?.must_change_password === true;
}
