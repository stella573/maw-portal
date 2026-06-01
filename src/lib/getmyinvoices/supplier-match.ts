import "server-only";
import type { GmiCompany } from "@/lib/getmyinvoices/documents";

/**
 * Lieferanten-Matching: vergleicht die aus der Rechnung extrahierten
 * Lieferantendaten mit den vorhandenen GetMyInvoices-Companies und berechnet
 * einen Score (0..1) samt Begründung.
 *
 * Priorität:
 *  - hoch:    exakte USt-ID / Steuernummer / IBAN  → sicherer Treffer (Score 1)
 *  - mittel:  sehr ähnlicher Name, gleiche Adresse/Website-/E-Mail-Domain
 *  - niedrig: Teil-Namensübereinstimmung, Schreibvarianten, Abkürzungen
 */

export interface ExtractedVendor {
  name: string | null;
  address: string | null;
  vatId: string | null;
  taxNumber: string | null;
  iban: string | null;
  email: string | null;
  website: string | null;
  country: string | null;
}

export interface SupplierMatchResult {
  matched: boolean;
  supplier_id: string | null;
  supplier_name: string | null;
  score: number;
  match_reason: string;
  /** Exakter Treffer über USt-ID/Steuernr./IBAN (für Sonderregel). */
  exact_id_match: boolean;
}

const LEGAL_SUFFIXES =
  /\b(gmbh|mbh|ag|ug|kg|kgaa|ohg|gbr|e\.?k\.?|e\.?v\.?|co|kg|inc|incorporated|ltd|limited|llc|llp|plc|s\.?a\.?|s\.?r\.?l\.?|b\.?v\.?|& co|und co)\b/gi;

function normName(s: string | null): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(LEGAL_SUFFIXES, " ")
    .replace(/[^a-z0-9äöüß ]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function domain(s: string | null): string | null {
  if (!s) return null;
  const m = s.toLowerCase().match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9.-]+\.[a-z]{2,})/i);
  return m ? m[1]! : null;
}

function emailDomain(s: string | null): string | null {
  if (!s) return null;
  const at = s.toLowerCase().split("@")[1];
  return at?.trim() || null;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prevDiag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        prevDiag + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prevDiag = tmp;
    }
  }
  return prev[b.length];
}

/** Namensähnlichkeit 0..1 (Levenshtein-Ratio + Token-Überlappung). */
function nameSimilarity(a: string, b: string): number {
  const na = normName(a);
  const nb = normName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  const lev = 1 - levenshtein(na, nb) / maxLen;
  // Token-Überlappung (Jaccard).
  const ta = new Set(na.split(" ").filter(Boolean));
  const tb = new Set(nb.split(" ").filter(Boolean));
  const inter = [...ta].filter((t) => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size || 1;
  const jacc = inter / union;
  // Teil-String-Bonus (z. B. Handelsname enthalten).
  const sub = na.includes(nb) || nb.includes(na) ? 0.85 : 0;
  return Math.max(lev * 0.6 + jacc * 0.4, sub);
}

interface Scored {
  company: GmiCompany;
  score: number;
  reason: string;
  exactId: boolean;
}

function scoreCompany(vendor: ExtractedVendor, c: GmiCompany): Scored {
  // Exakte ID-Treffer (höchste Priorität).
  if (vendor.vatId && c.vatId && vendor.vatId === c.vatId) {
    return { company: c, score: 1, reason: "Exakte USt-ID-Übereinstimmung", exactId: true };
  }
  if (vendor.taxNumber && c.taxNumber && vendor.taxNumber === c.taxNumber) {
    return { company: c, score: 1, reason: "Exakte Steuernummer-Übereinstimmung", exactId: true };
  }
  if (vendor.iban && c.iban && vendor.iban === c.iban) {
    return { company: c, score: 1, reason: "Exakte IBAN-Übereinstimmung", exactId: true };
  }

  const reasons: string[] = [];
  const nameSim = vendor.name ? nameSimilarity(vendor.name, c.name) : 0;
  let score = nameSim * 0.7;
  if (nameSim >= 0.9) reasons.push("sehr ähnlicher Firmenname");
  else if (nameSim >= 0.6) reasons.push("ähnlicher Firmenname");

  const vWeb = domain(vendor.website);
  const cWeb = domain(c.website);
  if (vWeb && cWeb && vWeb === cWeb) {
    score += 0.15;
    reasons.push("gleiche Website-Domain");
  }

  const vMail = emailDomain(vendor.email);
  const cMail = emailDomain(c.email);
  if (vMail && cMail && vMail === cMail) {
    score += 0.15;
    reasons.push("gleiche E-Mail-Domain");
  }

  if (vendor.address && c.address) {
    const aSim = nameSimilarity(vendor.address, c.address);
    if (aSim >= 0.7) {
      score += 0.1;
      reasons.push("ähnliche Adresse");
    }
  }

  score = Math.min(1, score);
  return {
    company: c,
    score,
    reason: reasons.length ? reasons.join(", ") : "geringe Übereinstimmung",
    exactId: false,
  };
}

/** Bester Lieferant für die extrahierten Daten. */
export function matchSupplier(
  vendor: ExtractedVendor,
  companies: GmiCompany[],
): SupplierMatchResult {
  if (companies.length === 0) {
    return {
      matched: false,
      supplier_id: null,
      supplier_name: null,
      score: 0,
      match_reason: "Keine Lieferanten in GetMyInvoices vorhanden",
      exact_id_match: false,
    };
  }

  let best: Scored | null = null;
  for (const c of companies) {
    const s = scoreCompany(vendor, c);
    if (!best || s.score > best.score) best = s;
    if (s.exactId) {
      best = s;
      break; // exakter ID-Treffer ist eindeutig
    }
  }

  if (!best || best.score < 0.3) {
    return {
      matched: false,
      supplier_id: null,
      supplier_name: null,
      score: best?.score ?? 0,
      match_reason: "Kein sicherer Lieferant gefunden",
      exact_id_match: false,
    };
  }

  return {
    matched: true,
    supplier_id: best.company.id,
    supplier_name: best.company.name,
    score: Math.round(best.score * 100) / 100,
    match_reason: best.reason,
    exact_id_match: best.exactId,
  };
}

/** Top-N Lieferantenkandidaten mit Score (für die manuelle Auswahl). */
export function rankSuppliers(
  vendor: ExtractedVendor,
  companies: GmiCompany[],
  limit = 10,
): { id: string; name: string; score: number; matchReason: string }[] {
  return companies
    .map((c) => scoreCompany(vendor, c))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => ({
      id: s.company.id,
      name: s.company.name,
      score: Math.round(s.score * 100) / 100,
      matchReason: s.reason,
    }));
}
