import { getServerEnv } from "@/lib/env";

/**
 * Minimaler Personio-API-Client (REST v1).
 *
 * Auth: POST /v1/auth mit client_id/client_secret → Bearer-Token (rotiert; neue
 * Tokens kommen im Authorization-Header der Antworten). Daten: /v1/company/
 * employees (paginiert). Nur serverseitig verwenden.
 */

const BASE = "https://api.personio.de";

export interface PersonioEmployee {
  personioId: number;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  position: string | null;
  department: string | null;
  office: string | null;
  /** Personio-Status: active | inactive | onboarding | leave … */
  status: string;
}

type Json = Record<string, unknown>;

/** Liest attributes[key].value aus einem Personio-Employee-Objekt. */
function val(row: unknown, key: string): unknown {
  const attrs = (row as Json | null)?.attributes as Json | undefined;
  const field = attrs?.[key] as Json | undefined;
  return field?.value;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

/** department/office sind verschachtelt: { attributes: { name: { value } } }. */
function nestedName(v: unknown): string | null {
  if (typeof v === "string") return v.trim() ? v : null;
  const attrs = (v as Json | null)?.attributes as Json | undefined;
  const name = (attrs?.name as Json | undefined)?.value;
  return asString(name);
}

async function getToken(): Promise<string> {
  const { PERSONIO_CLIENT_ID, PERSONIO_CLIENT_SECRET } = getServerEnv();
  if (!PERSONIO_CLIENT_ID || !PERSONIO_CLIENT_SECRET) {
    throw new Error(
      "Personio ist nicht konfiguriert (PERSONIO_CLIENT_ID/PERSONIO_CLIENT_SECRET fehlen).",
    );
  }
  const res = await fetch(`${BASE}/v1/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: PERSONIO_CLIENT_ID,
      client_secret: PERSONIO_CLIENT_SECRET,
    }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as Json | null;
  const data = json?.data as Json | undefined;
  const token = data?.token;
  if (!res.ok || json?.success !== true || typeof token !== "string") {
    throw new Error(`Personio-Authentifizierung fehlgeschlagen (HTTP ${res.status}).`);
  }
  return token;
}

/** Lädt alle Mitarbeiter aus Personio (über alle Seiten). */
export async function fetchPersonioEmployees(): Promise<PersonioEmployee[]> {
  let token = await getToken();
  const out: PersonioEmployee[] = [];
  const limit = 200;
  let offset = 0;

  for (;;) {
    const res = await fetch(
      `${BASE}/v1/company/employees?limit=${limit}&offset=${offset}`,
      {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        cache: "no-store",
      },
    );
    // Personio rotiert das Token und liefert ein neues im Header.
    const rotated = res.headers.get("authorization");
    if (rotated) token = rotated.replace(/^Bearer\s+/i, "");

    const json = (await res.json().catch(() => null)) as Json | null;
    if (!res.ok || json?.success !== true) {
      throw new Error(`Personio-Mitarbeiter laden fehlgeschlagen (HTTP ${res.status}).`);
    }

    const data = Array.isArray(json?.data) ? (json!.data as unknown[]) : [];
    for (const row of data) {
      const id = Number(val(row, "id"));
      if (!Number.isFinite(id)) continue;
      out.push({
        personioId: id,
        email: asString(val(row, "email")),
        firstName: asString(val(row, "first_name")),
        lastName: asString(val(row, "last_name")),
        position: asString(val(row, "position")),
        department: nestedName(val(row, "department")),
        office: nestedName(val(row, "office")),
        status: asString(val(row, "status")) ?? "active",
      });
    }

    const meta = json?.metadata as Json | undefined;
    const total = typeof meta?.total_elements === "number" ? meta.total_elements : out.length;
    offset += limit;
    if (data.length < limit || offset >= total) break;
  }

  return out;
}
