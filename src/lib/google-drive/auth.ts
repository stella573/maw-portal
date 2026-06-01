import "server-only";
import { createSign } from "node:crypto";
import { getServerEnv } from "@/lib/env";

/**
 * Google-Service-Account-Authentifizierung – ohne externe Abhängigkeit.
 *
 * Erzeugt ein signiertes JWT (RS256) aus dem Service-Account-Key und tauscht es
 * am Google-OAuth-Token-Endpunkt gegen ein kurzlebiges Access-Token. Optionale
 * Domain-Wide-Delegation über `GOOGLE_DRIVE_IMPERSONATED_USER_EMAIL` (sub).
 *
 * Läuft ausschließlich serverseitig – der Private Key gelangt nie in den Client.
 */

// Breiter Drive-Scope: nötig, um bestehende Ordner zu finden/wiederzuverwenden
// und Dateien später umsortieren (verschieben) zu können.
const SCOPE = "https://www.googleapis.com/auth/drive";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

export class GoogleDriveNotConfiguredError extends Error {
  constructor() {
    super("Google Drive ist nicht konfiguriert (GOOGLE_SERVICE_ACCOUNT_KEY / GOOGLE_DRIVE_ROOT_FOLDER_ID fehlen).");
    this.name = "GoogleDriveNotConfiguredError";
  }
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function loadServiceAccount(): ServiceAccount | null {
  const { GOOGLE_SERVICE_ACCOUNT_KEY } = getServerEnv();
  if (!GOOGLE_SERVICE_ACCOUNT_KEY) return null;
  try {
    const json = JSON.parse(GOOGLE_SERVICE_ACCOUNT_KEY) as Record<string, unknown>;
    const client_email = String(json.client_email ?? "");
    // Private Key kann mit literalen \n gespeichert sein → in echte Umbrüche wandeln.
    const private_key = String(json.private_key ?? "").replace(/\\n/g, "\n");
    if (!client_email || !private_key) return null;
    return { client_email, private_key };
  } catch {
    return null;
  }
}

/** Ist Google Drive serverseitig konfiguriert? */
export function isGoogleDriveConfigured(): boolean {
  const { GOOGLE_DRIVE_ROOT_FOLDER_ID } = getServerEnv();
  return !!loadServiceAccount() && !!GOOGLE_DRIVE_ROOT_FOLDER_ID;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

/** Liefert ein gültiges Access-Token (gecached bis kurz vor Ablauf). */
export async function getDriveAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const sa = loadServiceAccount();
  if (!sa) throw new GoogleDriveNotConfiguredError();
  const { GOOGLE_DRIVE_IMPERSONATED_USER_EMAIL } = getServerEnv();

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim: Record<string, unknown> = {
    iss: sa.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  if (GOOGLE_DRIVE_IMPERSONATED_USER_EMAIL) {
    claim.sub = GOOGLE_DRIVE_IMPERSONATED_USER_EMAIL;
  }

  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signature = createSign("RSA-SHA256")
    .update(unsigned)
    .sign(sa.private_key);
  const assertion = `${unsigned}.${base64url(signature)}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof data.access_token !== "string") {
    throw new Error(
      `Google-Token-Anforderung fehlgeschlagen: HTTP ${res.status} ${JSON.stringify(data).slice(0, 200)}`,
    );
  }

  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 3600;
  cachedToken = { token: data.access_token, expiresAt: Date.now() + expiresIn * 1000 };
  return cachedToken.token;
}
