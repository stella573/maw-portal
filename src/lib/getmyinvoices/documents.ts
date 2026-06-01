import "server-only";
import { gmiRequest, type GmiCreds } from "@/lib/getmyinvoices/client";

/**
 * GetMyInvoices: Companies (Lieferanten) laden und Dokumente (Rechnungen)
 * hochladen. Nur serverseitig verwenden (API-Key ist ein Secret).
 *
 * Hinweis: Die GMI Accounts-API v3 ist RESTful/JSON. Die exakten Feldnamen für
 * den Dokument-Upload werden hier ZENTRAL gemappt (siehe buildDocumentPayload),
 * damit sie bei Bedarf an die jeweilige API-Version leicht angepasst werden
 * können. Antworten werden defensiv geparst.
 */

/** Normalisierter Lieferant für das Matching. */
export interface GmiCompany {
  id: string;
  name: string;
  vatId: string | null;
  taxNumber: string | null;
  iban: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  country: string | null;
  raw: unknown;
}

function pick(o: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

function normId(v: string | null): string | null {
  return v ? v.replace(/\s+/g, "").toUpperCase() : null;
}

function normalizeCompany(raw: unknown): GmiCompany | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = pick(o, ["id", "companyId", "company_id", "uid"]);
  const name = pick(o, ["name", "companyName", "company_name", "title", "displayName"]);
  if (!id || !name) return null;
  return {
    id,
    name,
    vatId: normId(pick(o, ["vatId", "vat_id", "vatNumber", "ustId", "vat", "taxId"])),
    taxNumber: normId(pick(o, ["taxNumber", "tax_number", "taxNo", "steuernummer"])),
    iban: normId(pick(o, ["iban", "IBAN"])),
    email: pick(o, ["email", "mail", "emailAddress"])?.toLowerCase() ?? null,
    website: pick(o, ["website", "url", "homepage", "web"]),
    address: pick(o, ["address", "street", "addressLine", "fullAddress"]),
    country: pick(o, ["country", "countryCode", "land"]),
    raw,
  };
}

/** Lädt die Companies/Lieferanten aus GetMyInvoices (defensiv geparst). */
export async function listCompanies(creds: GmiCreds): Promise<GmiCompany[]> {
  const json = await gmiRequest<unknown>(creds, "companies");
  const list = extractList(json);
  return list
    .map(normalizeCompany)
    .filter((c): c is GmiCompany => c !== null);
}

/** Findet in diversen Response-Formen die eigentliche Liste. */
function extractList(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (json && typeof json === "object") {
    const o = json as Record<string, unknown>;
    for (const key of ["companies", "data", "items", "results", "result"]) {
      if (Array.isArray(o[key])) return o[key] as unknown[];
    }
  }
  return [];
}

export interface UploadDocumentInput {
  fileName: string;
  fileBase64: string;
  companyId?: string | null;
  documentNumber?: string | null;
  documentDate?: string | null;
  dueDate?: string | null;
  netAmount?: number | null;
  grossAmount?: number | null;
  vat?: number | null;
  currency?: string | null;
  paymentStatus?: string | null;
  comment?: string | null;
}

/**
 * Baut den Upload-Payload für GMI. ZENTRALER Mapping-Punkt der Feldnamen –
 * bei Bedarf hier an die API-Version anpassen.
 */
export function buildDocumentPayload(
  input: UploadDocumentInput,
): Record<string, unknown> {
  // Die GMI Accounts-API verwendet snake_case-Felder; document_type ist Pflicht
  // (gültige Werte sind kleingeschriebene Strings wie "invoice").
  const body: Record<string, unknown> = {
    document_type: "invoice",
    document_name: input.fileName,
    file_name: input.fileName,
    file_content: input.fileBase64,
  };
  // Lieferant: company_uid ist numerisch.
  if (input.companyId) {
    const uid = Number(String(input.companyId).replace(/\D/g, ""));
    if (Number.isFinite(uid) && uid > 0) body.company_uid = uid;
  }
  if (input.documentNumber) body.document_number = input.documentNumber;
  if (input.documentDate) body.document_date = input.documentDate;
  if (input.dueDate) body.document_due_date = input.dueDate;
  if (input.netAmount != null) body.net_amount = input.netAmount;
  if (input.grossAmount != null) body.gross_amount = input.grossAmount;
  if (input.vat != null) body.vat = input.vat;
  if (input.currency) body.currency = input.currency;
  if (input.paymentStatus) body.payment_status = input.paymentStatus;
  if (input.comment) body.note = input.comment;
  return body;
}

export interface UploadDocumentResult {
  documentId: string | null;
  raw: unknown;
}

/** Lädt ein Dokument (Rechnung) zu GetMyInvoices hoch. */
export async function uploadDocument(
  creds: GmiCreds,
  input: UploadDocumentInput,
): Promise<UploadDocumentResult> {
  const body = buildDocumentPayload(input);
  const json = await gmiRequest<unknown>(creds, "documents", { method: "POST", body });
  return { documentId: extractDocumentId(json), raw: json };
}

function extractDocumentId(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  const direct = pick(o, ["id", "documentId", "document_id", "uid"]);
  if (direct) return direct;
  // Verschachtelt z. B. { document: { id } } oder { data: { id } }
  for (const key of ["document", "data", "result"]) {
    const nested = o[key];
    if (nested && typeof nested === "object") {
      const n = pick(nested as Record<string, unknown>, ["id", "documentId", "uid"]);
      if (n) return n;
    }
  }
  return null;
}
