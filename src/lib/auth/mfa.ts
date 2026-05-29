/**
 * MFA-Hilfslogik (TOTP).
 *
 * Sicherheitsmodell: 2FA ist für ALLE verpflichtend. Wir nutzen Supabase MFA
 * (GoTrue) und erzwingen den "Authenticator Assurance Level" (AAL):
 *
 *  - aal1 = nur Passwort verifiziert
 *  - aal2 = zusätzlich ein 2. Faktor (TOTP) verifiziert
 *
 * Daraus ergeben sich drei Zustände, die Middleware/Seiten steuern:
 *  - "ok"        : aal2 erreicht → voller Zugriff
 *  - "needs_setup": noch kein verifizierter Faktor → 2FA einrichten (Enrollment)
 *  - "needs_challenge": Faktor vorhanden, aber Session erst aal1 → Code abfragen
 *
 * Die Auswertung erfolgt über getAuthenticatorAssuranceLevel():
 *   currentLevel/nextLevel == aal2  → ok
 *   nextLevel == aal2 && current == aal1 → es existiert ein Faktor, Challenge nötig
 *   nextLevel == aal1 → kein Faktor → Setup nötig
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type MfaState = "ok" | "needs_setup" | "needs_challenge";

export interface MfaStatus {
  state: MfaState;
  currentLevel: string | null;
  nextLevel: string | null;
}

/**
 * Ermittelt den MFA-Zustand der aktuellen Session.
 * Funktioniert mit jedem Supabase-Client (Server, Middleware, Browser).
 */
export async function getMfaStatus(
  supabase: SupabaseClient,
): Promise<MfaStatus> {
  const { data, error } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  // Im Zweifel (Fehler) konservativ: Setup verlangen statt Zugriff gewähren.
  if (error || !data) {
    return { state: "needs_setup", currentLevel: null, nextLevel: null };
  }

  const { currentLevel, nextLevel } = data;

  if (currentLevel === "aal2") {
    return { state: "ok", currentLevel, nextLevel };
  }

  // currentLevel ist aal1 (oder null): hat der User schon einen Faktor?
  if (nextLevel === "aal2") {
    // Faktor existiert → muss per Code bestätigt werden.
    return { state: "needs_challenge", currentLevel, nextLevel };
  }

  // nextLevel == aal1 → kein verifizierter Faktor vorhanden.
  return { state: "needs_setup", currentLevel, nextLevel };
}
