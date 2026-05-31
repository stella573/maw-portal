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

  const tokenUrl = `${creds.baseUrl.replace(/\/+$/, "")}/token`;

  // Versuch 1: JSON (ROLLER-Standard laut offizieller Collection).
  let res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    }),
    cache: "no-store",
  });
  let raw = await res.text().catch(() => "");

  // Versuch 2 (Fallback): form-urlencoded, falls JSON abgelehnt wird.
  if (!res.ok) {
    const form = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    });
    const res2 = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: form.toString(),
      cache: "no-store",
    });
    if (res2.ok) {
      res = res2;
      raw = await res2.text().catch(() => "");
    }
  }

  let data: Json | null = null;
  try {
    data = raw ? (JSON.parse(raw) as Json) : null;
  } catch {
    /* keine JSON-Antwort */
  }
  const token =
    (data?.access_token as string | undefined) ??
    (data?.accessToken as string | undefined) ??
    (data?.token as string | undefined);
  if (!res.ok || !token) {
    // Echte Fehlermeldung von ROLLER mitgeben (z. B. invalid_client).
    throw new Error(
      `ROLLER-Authentifizierung fehlgeschlagen (HTTP ${res.status}): ${raw.slice(0, 300) || "(keine Antwort)"}`,
    );
  }
  const expiresIn = typeof data?.expires_in === "number" ? data.expires_in : 3600;
  tokenCache.set(creds.clientId, {
    token,
    expiresAt: Date.now() + expiresIn * 1000,
  });
  return token;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Begrenzt die gleichzeitigen Requests je Client-ID (= ROLLER-Rate-Limit-Topf),
 * damit parallele Analytics-Abfragen kein HTTP 429 auslösen.
 */
const MAX_CONCURRENT_PER_CLIENT = 3;
const gates = new Map<string, { active: number; queue: Array<() => void> }>();

async function acquire(clientId: string): Promise<void> {
  let gate = gates.get(clientId);
  if (!gate) {
    gate = { active: 0, queue: [] };
    gates.set(clientId, gate);
  }
  if (gate.active < MAX_CONCURRENT_PER_CLIENT) {
    gate.active++;
    return;
  }
  // Slot belegt: in die Warteschlange; beim Aufwecken ist der Slot bereits gezählt.
  await new Promise<void>((resolve) => gate!.queue.push(resolve));
}

function release(clientId: string): void {
  const gate = gates.get(clientId);
  if (!gate) return;
  const next = gate.queue.shift();
  if (next) {
    next(); // Slot direkt an den nächsten Wartenden übergeben (active unverändert).
  } else {
    gate.active--;
  }
}

/** Wartezeit (ms) aus dem Retry-After-Header (Sekunden oder HTTP-Datum). */
function retryAfterMs(res: Response): number | null {
  const h = res.headers.get("retry-after");
  if (!h) return null;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const when = Date.parse(h);
  return Number.isFinite(when) ? Math.max(0, when - Date.now()) : null;
}

/**
 * Authentifizierter Request gegen die ROLLER-API. Gibt das geparste JSON zurück.
 * Bei HTTP 429 (Rate-Limit) und transienten 5xx wird mit (exponentiellem)
 * Backoff erneut versucht; ein vorhandener Retry-After-Header wird respektiert.
 */
export async function rollerRequest<T = unknown>(
  creds: RollerCreds,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const url = path.startsWith("http")
    ? path
    : `${creds.baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;

  await acquire(creds.clientId);
  try {
    const maxRetries = 5;
    for (let attempt = 0; ; attempt++) {
      const token = await getToken(creds);
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

      if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
        // Body verwerfen (Verbindung freigeben), dann warten und erneut versuchen.
        await res.text().catch(() => "");
        const backoff = Math.min(16_000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
        await sleep(retryAfterMs(res) ?? backoff);
        continue;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`ROLLER ${init.method ?? "GET"} ${path} → HTTP ${res.status} ${text.slice(0, 200)}`);
      }
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    }
  } finally {
    release(creds.clientId);
  }
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
