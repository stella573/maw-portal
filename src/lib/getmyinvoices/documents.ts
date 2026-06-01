import "server-only";
import { gmiRequest, GmiHttpError, type GmiCreds } from "@/lib/getmyinvoices/client";

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

/**
 * Lädt die Companies/Lieferanten aus GetMyInvoices (defensiv geparst).
 *
 * Die GMI Accounts-API nutzt Action-Endpunkte: Companies werden per
 * `POST listCompanies` geladen (kein `GET companies`). Als Fallback wird der
 * REST-Stil versucht, falls die API-Version abweicht.
 */
export async function listCompanies(creds: GmiCreds): Promise<GmiCompany[]> {
  let json: unknown;
  try {
    json = await gmiRequest<unknown>(creds, "listCompanies", { method: "POST", body: {} });
  } catch {
    json = await gmiRequest<unknown>(creds, "companies");
  }
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
    for (const key of ["records", "companies", "data", "items", "results", "result"]) {
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
  // Der Upload-Endpunkt der GMI Accounts-API erwartet camelCase-Felder.
  // `fileName` + `fileContent` sind Pflicht. `documentType` wird BEWUSST NICHT
  // gesendet: der Wert "invoice" wird abgelehnt (Code 146) und GMI klassifiziert
  // das Dokument ohnehin per OCR selbst.
  const body: Record<string, unknown> = {
    fileName: input.fileName,
    fileContent: input.fileBase64,
  };
  // Lieferant: numerische company_uid bevorzugt; sonst companyId mitgeben.
  if (input.companyId) {
    const uid = Number(String(input.companyId).replace(/\D/g, ""));
    if (Number.isFinite(uid) && uid > 0) body.companyUid = uid;
    else body.companyId = input.companyId;
  }
  if (input.documentNumber) body.documentNumber = input.documentNumber;
  if (input.documentDate) body.documentDate = input.documentDate;
  if (input.dueDate) body.documentDueDate = input.dueDate;
  if (input.netAmount != null) body.netAmount = input.netAmount;
  if (input.grossAmount != null) body.grossAmount = input.grossAmount;
  if (input.vat != null) body.vat = input.vat;
  if (input.currency) body.currency = input.currency;
  if (input.paymentStatus) body.paymentStatus = input.paymentStatus;
  if (input.comment) body.comment = input.comment;
  return body;
}

export interface UploadDocumentResult {
  documentId: string | null;
  raw: unknown;
  /** Dokument war bereits im Konto vorhanden (GMI-Duplikaterkennung). */
  alreadyExists?: boolean;
}

/**
 * Lädt ein Dokument (Rechnung) zu GetMyInvoices hoch.
 *
 * Idempotent: Erkennt GMI das Dokument als Duplikat (Code 127
 * "Document already exists"), wird das als Erfolg gewertet und die vorhandene
 * `duplicate_invoice_id` als Dokument-ID übernommen.
 */
export async function uploadDocument(
  creds: GmiCreds,
  input: UploadDocumentInput,
): Promise<UploadDocumentResult> {
  const body = buildDocumentPayload(input);
  try {
    const json = await gmiRequest<unknown>(creds, "documents", { method: "POST", body });
    return { documentId: extractDocumentId(json), raw: json };
  } catch (err) {
    if (err instanceof GmiHttpError) {
      const dup = findDuplicateId(err.body);
      if (dup != null) {
        return { documentId: String(dup), raw: err.body, alreadyExists: true };
      }
    }
    throw err;
  }
}

/** Sucht in einer GMI-Fehlerantwort die duplicate_invoice_id (Code 127). */
function findDuplicateId(body: unknown): string | number | null {
  if (!body || typeof body !== "object") return null;
  const errors = (body as Record<string, unknown>).errors;
  if (!Array.isArray(errors)) return null;
  for (const e of errors) {
    const o = e as Record<string, unknown>;
    if (o.code === 127 || /already exists/i.test(String(o.detail ?? ""))) {
      const dup = o.duplicate_invoice_id ?? o.duplicateInvoiceId;
      if (typeof dup === "string" || typeof dup === "number") return dup;
      return "exists";
    }
  }
  return null;
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
