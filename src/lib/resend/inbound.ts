import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifikation eingehender Resend-Webhooks (Svix-Signaturformat).
 *
 * Resend nutzt Svix zum Signieren. Der Webhook sendet drei Header:
 *   svix-id, svix-timestamp, svix-signature
 * Signiert wird:  `${id}.${timestamp}.${rawBody}`
 * Secret-Format:  `whsec_<base64>` → der Teil nach dem Präfix ist base64.
 * Der Signatur-Header enthält eine leerzeichengetrennte Liste `v1,<base64sig>`.
 *
 * Implementiert ohne externe Abhängigkeit (node:crypto).
 */
export function verifyResendSignature(opts: {
  rawBody: string;
  svixId: string | null;
  svixTimestamp: string | null;
  svixSignature: string | null;
  secret: string;
  /** Toleranz gegen Replay (Sekunden), Standard 5 Minuten. */
  toleranceSeconds?: number;
}): boolean {
  const { rawBody, svixId, svixTimestamp, svixSignature, secret } = opts;
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  // Replay-Schutz: Timestamp darf nicht zu alt/zukünftig sein.
  const tolerance = opts.toleranceSeconds ?? 300;
  const ts = Number(svixTimestamp);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > tolerance) return false;

  // Secret dekodieren (Präfix whsec_ entfernen, Rest ist base64).
  const secretKey = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let keyBytes: Buffer;
  try {
    keyBytes = Buffer.from(secretKey, "base64");
  } catch {
    return false;
  }

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expected = createHmac("sha256", keyBytes)
    .update(signedContent)
    .digest("base64");

  // Header kann mehrere Signaturen enthalten (Rotation): "v1,<sig> v1,<sig2>"
  const provided = svixSignature
    .split(" ")
    .map((part) => part.split(",")[1] ?? part)
    .filter(Boolean);

  const expectedBuf = Buffer.from(expected);
  return provided.some((sig) => {
    const sigBuf = Buffer.from(sig);
    return (
      sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf)
    );
  });
}

/**
 * Extrahiert eine reine E-Mail-Adresse aus einem To/From-Header.
 * Akzeptiert "Name <mail@x.de>" oder "mail@x.de", einzeln oder als Array,
 * und liefert die erste Adresse in Kleinschreibung.
 */
export function extractEmail(value: string | string[] | undefined): string | null {
  if (!value) return null;
  const first = Array.isArray(value) ? value[0] : value;
  if (!first) return null;
  const match = first.match(/<([^>]+)>/);
  const raw = (match?.[1] ?? first).trim().toLowerCase();
  return raw.includes("@") ? raw : null;
}

/**
 * Sucht eine Ticket-Referenz (z. B. MAW-AB12CD34) im Betreff – für Threading.
 */
export function extractTicketReference(subject: string | undefined): string | null {
  if (!subject) return null;
  const m = subject.match(/MAW-[A-Z0-9]{8}/i);
  return m ? m[0].toUpperCase() : null;
}
