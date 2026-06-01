/**
 * GetMyInvoices-API-Client (Accounts API v3, https://api.getmyinvoices.com).
 *
 * Auth: API-Key im HTTP-Header `X-API-KEY` (kein OAuth/Token-Flow). Die API ist
 * RESTful (GET/POST/PUT/DELETE auf Ressourcen-Pfaden), UTF-8/JSON.
 *   GET  apiStatus            → Status/Verbindungstest
 *   GET  documents            → Rechnungen/Dokumente auflisten
 *   POST documents            → neues Dokument hochladen (späterer E-Mail→GMI-Push)
 *
 * Nur serverseitig verwenden (der API-Key ist ein Secret!).
 */

export interface GmiCreds {
  baseUrl: string;
  apiKey: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Authentifizierter Request gegen die GetMyInvoices-API. Default GET; ein
 * optionaler Body wird als JSON gesendet. Bei HTTP 429/5xx wird mit
 * (exponentiellem) Backoff erneut versucht.
 */
export async function gmiRequest<T = unknown>(
  creds: GmiCreds,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const url = path.startsWith("http")
    ? path
    : `${creds.baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
  const method = init.method ?? "GET";

  const maxRetries = 4;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method,
      headers: {
        "X-API-KEY": creds.apiKey,
        Accept: "application/json",
        ...(init.body != null ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body != null ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });

    if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
      await res.text().catch(() => "");
      await sleep(Math.min(8_000, 500 * 2 ** attempt) + Math.floor(Math.random() * 200));
      continue;
    }

    const text = await res.text().catch(() => "");
    if (!res.ok) {
      throw new Error(`GetMyInvoices ${method} ${path} → HTTP ${res.status} ${text.slice(0, 200)}`);
    }
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`GetMyInvoices ${method} ${path} → ungültige JSON-Antwort`);
    }
  }
}

/**
 * Prüft die Verbindung über den leichten Status-Endpunkt (GET apiStatus).
 * Wirft bei ungültigem Key (HTTP 4xx).
 */
export async function verifyConnection(creds: GmiCreds): Promise<void> {
  await gmiRequest(creds, "apiStatus");
}
