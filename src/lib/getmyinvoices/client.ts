/**
 * GetMyInvoices-API-Client (Accounts API v3, https://api.getmyinvoices.com).
 *
 * Auth: API-Key. Anders als ROLLER (OAuth) erwartet GMI den Key als JSON-Feld
 * `api_key` im POST-Body jeder Anfrage – es gibt keinen Token-Flow. Alle
 * Endpunkte sind POST + JSON, UTF-8.
 *
 * Nur serverseitig verwenden (der API-Key ist ein Secret!).
 */

export interface GmiCreds {
  baseUrl: string;
  apiKey: string;
}

type Json = Record<string, unknown>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Authentifizierter Request gegen die GetMyInvoices-API. Sendet POST mit
 * JSON-Body `{ ...body, api_key }` und gibt das geparste JSON zurück.
 * Bei HTTP 429/5xx wird mit (exponentiellem) Backoff erneut versucht.
 */
export async function gmiRequest<T = unknown>(
  creds: GmiCreds,
  path: string,
  body: Json = {},
): Promise<T> {
  const url = path.startsWith("http")
    ? path
    : `${creds.baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;

  const payload = JSON.stringify({ ...body, api_key: creds.apiKey });

  const maxRetries = 4;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: payload,
      cache: "no-store",
    });

    if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
      await res.text().catch(() => "");
      await sleep(Math.min(8_000, 500 * 2 ** attempt) + Math.floor(Math.random() * 200));
      continue;
    }

    const text = await res.text().catch(() => "");
    if (!res.ok) {
      throw new Error(`GetMyInvoices POST ${path} → HTTP ${res.status} ${text.slice(0, 200)}`);
    }
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`GetMyInvoices POST ${path} → ungültige JSON-Antwort`);
    }
  }
}

/**
 * Prüft die Verbindung über einen leichten Endpunkt (Länderliste). Wirft bei
 * ungültigem Key (HTTP 4xx). Gibt die Anzahl gelieferter Länder zurück.
 */
export async function verifyConnection(creds: GmiCreds): Promise<{ countries: number }> {
  const res = await gmiRequest<unknown>(creds, "/getCountries");
  const list = extractRows(res);
  return { countries: list.length };
}

/** Defensive Extraktion einer Liste aus den variierenden GMI-Antwortformen. */
function extractRows(res: unknown): unknown[] {
  if (Array.isArray(res)) return res;
  const o = (res ?? {}) as Json;
  for (const k of ["countries", "data", "items", "results", "records", "documents", "invoices"]) {
    if (Array.isArray(o[k])) return o[k] as unknown[];
  }
  return [];
}
