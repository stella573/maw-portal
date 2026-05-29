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

export interface ReceivedEmailBody {
  text: string | null;
  html: string | null;
  subject: string | null;
  from: string | null;
  to: string[] | null;
}

/**
 * Lädt den vollständigen Inhalt einer eingegangenen Mail über die Resend-API
 * nach. Resend-Inbound-Webhooks enthalten NUR Metadaten – Body (text/html)
 * muss separat per email_id geholt werden:
 *   GET https://api.resend.com/emails/receiving/{id}
 *
 * Direkt per fetch (das installierte SDK kennt receiving.get noch nicht).
 */
export async function fetchReceivedEmail(
  emailId: string,
  apiKey: string,
): Promise<ReceivedEmailBody | null> {
  try {
    const res = await fetch(
      `https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        // Inbound-Body kann groß sein; kein Cache.
        cache: "no-store",
      },
    );
    if (!res.ok) {
      console.error(
        `[resend] receiving.get ${emailId} → HTTP ${res.status} ${await res.text()}`,
      );
      return null;
    }
    const data = (await res.json()) as Record<string, unknown>;
    const str = (x: unknown) => (typeof x === "string" && x.trim() ? x : null);
    return {
      text: str(data.text),
      html: str(data.html),
      subject: str(data.subject),
      from: str(data.from),
      to: Array.isArray(data.to) ? (data.to as string[]) : null,
    };
  } catch (err) {
    console.error("[resend] fetchReceivedEmail Fehler:", err);
    return null;
  }
}

export interface ReceivedAttachment {
  id: string | null;
  filename: string;
  contentType: string | null;
  /** Heruntergeladener Inhalt (zum Persistieren in Storage). */
  content: Uint8Array;
}

/**
 * Lädt die Anhänge einer eingegangenen Mail über die Resend-API:
 *   GET /emails/receiving/{id}/attachments   → Liste mit download_url
 * Die download_url ist signiert/abläuft → wir laden den Inhalt sofort herunter,
 * damit er dauerhaft in Supabase Storage abgelegt werden kann.
 *
 * Defensiv: Fehler einzelner Anhänge brechen den Import nicht ab.
 */
export async function fetchReceivedAttachments(
  emailId: string,
  apiKey: string,
): Promise<ReceivedAttachment[]> {
  try {
    const res = await fetch(
      `https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}/attachments`,
      { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store" },
    );
    if (!res.ok) {
      console.error(
        `[resend] attachments.list ${emailId} → HTTP ${res.status}`,
      );
      return [];
    }
    const json = (await res.json()) as Record<string, unknown>;
    // Antwort kann { data: [...] } oder direkt [...] sein.
    const list = Array.isArray(json)
      ? json
      : Array.isArray(json.data)
        ? (json.data as unknown[])
        : [];

    const out: ReceivedAttachment[] = [];
    for (const raw of list) {
      const a = raw as Record<string, unknown>;
      const downloadUrl =
        (a.download_url as string | undefined) ?? (a.url as string | undefined);
      const filename =
        (a.filename as string | undefined) ??
        (a.name as string | undefined) ??
        "anhang";
      const contentType =
        (a.content_type as string | undefined) ??
        (a.contentType as string | undefined) ??
        null;
      const id = (a.id as string | undefined) ?? null;
      if (!downloadUrl) continue;

      try {
        const fileRes = await fetch(downloadUrl, { cache: "no-store" });
        if (!fileRes.ok) {
          console.error(`[resend] Anhang-Download fehlgeschlagen: ${filename}`);
          continue;
        }
        const buf = new Uint8Array(await fileRes.arrayBuffer());
        // Sicherheitslimit: Anhänge > 25 MB überspringen.
        if (buf.byteLength > 25 * 1024 * 1024) {
          console.warn(`[resend] Anhang zu groß, übersprungen: ${filename}`);
          continue;
        }
        out.push({ id, filename, contentType, content: buf });
      } catch (err) {
        console.error(`[resend] Anhang-Fehler ${filename}:`, err);
      }
    }
    return out;
  } catch (err) {
    console.error("[resend] fetchReceivedAttachments Fehler:", err);
    return [];
  }
}
