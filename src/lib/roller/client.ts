/**
 * ROLLER-API-Client (https://api.play.roller.app).
 *
 * Auth: OAuth2 Client-Credentials → POST /token → Bearer-Token. Tokens werden
 * je Client-ID im Speicher gecacht, bis sie (kurz vor) Ablauf erneuert werden.
 * Nur serverseitig verwenden (Secrets!).
 */

export interface RollerCreds {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
}

type Json = Record<string, unknown>;

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getToken(creds: RollerCreds): Promise<string> {
  const cached = tokenCache.get(creds.clientId);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token;

  const res = await fetch(`${creds.baseUrl.replace(/\/+$/, "")}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    }),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => null)) as Json | null;
  const token =
    (data?.access_token as string | undefined) ??
    (data?.accessToken as string | undefined) ??
    (data?.token as string | undefined);
  if (!res.ok || !token) {
    throw new Error(`ROLLER-Authentifizierung fehlgeschlagen (HTTP ${res.status}).`);
  }
  const expiresIn = typeof data?.expires_in === "number" ? data.expires_in : 3600;
  tokenCache.set(creds.clientId, {
    token,
    expiresAt: Date.now() + expiresIn * 1000,
  });
  return token;
}

/** Authentifizierter Request gegen die ROLLER-API. Gibt das geparste JSON zurück. */
export async function rollerRequest<T = unknown>(
  creds: RollerCreds,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getToken(creds);
  const url = path.startsWith("http")
    ? path
    : `${creds.baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ROLLER ${init.method ?? "GET"} ${path} → HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Prüft die Verbindung über GET /venues/me und liefert den Venue-Namen. */
export async function fetchVenue(creds: RollerCreds): Promise<{ name: string | null }> {
  const data = await rollerRequest<Json>(creds, "/venues/me");
  const name =
    (data?.name as string | undefined) ??
    ((data?.venue as Json | undefined)?.name as string | undefined) ??
    null;
  return { name };
}

/** Token-Cache leeren (z. B. nach Credential-Änderung). */
export function clearRollerToken(clientId: string): void {
  tokenCache.delete(clientId);
}
