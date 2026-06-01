/**
 * Zentrale App-Metadaten. Eine Quelle der Wahrheit für den Portal-Namen,
 * damit Branding nicht über die Komponenten driftet.
 */
export const APP_NAME = "Mining Adventure World Mitarbeiter HUB";
/** Kurzform für enge UI-Bereiche (Sidebar, mobile Topbar). */
export const APP_NAME_SHORT = "Mitarbeiter HUB";

/**
 * Marken-Präfix für den Absendernamen ausgehender Kundenmails. Wird dem
 * Postfachnamen vorangestellt → z. B. "Mining Adventure World – Dorsten",
 * damit Empfänger immer erkennen, von wem die Mail kommt.
 */
export const EMAIL_SENDER_BRAND = "Mining Adventure World";

/** Baut den Anzeige-Absendernamen aus Marke + Postfachname. */
export function senderDisplayName(mailboxName?: string | null): string {
  const name = mailboxName?.trim();
  return name ? `${EMAIL_SENDER_BRAND} – ${name}` : EMAIL_SENDER_BRAND;
}
