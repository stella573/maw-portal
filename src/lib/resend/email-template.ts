/**
 * Globales MAW-E-Mail-Template (dunkles Markendesign).
 *
 * Wickelt den eigentlichen Nachrichtentext in das Corporate-HTML-Gerüst, das
 * an JEDE ausgehende Mail gehen soll. Der Antworttext wird HTML-escaped und
 * Zeilenumbrüche bleiben erhalten (white-space:pre-wrap).
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Baut die vollständige HTML-Mail aus reinem Antworttext.
 * @param bodyText reiner Text (wird escaped, Umbrüche bleiben erhalten)
 * @param signatureHtml optionale HTML-Signatur der/des Mitarbeitenden; wird
 *   unter den Nachrichtentext gesetzt. Bewusst NICHT escaped (vom internen
 *   Mitarbeitenden gepflegtes, vertrauenswürdiges HTML).
 */
export function renderEmailHtml(bodyText: string, signatureHtml?: string | null): string {
  const body = `<div style="white-space:pre-wrap; color:#E5E7EB; font-size:14px; line-height:24px;">${escapeHtml(
    bodyText,
  )}</div>`;
  const signature =
    signatureHtml && signatureHtml.trim()
      ? `<div style="margin-top:8px; color:#E5E7EB; font-size:14px; line-height:24px;">${signatureHtml}</div>`
      : "";
  const year = new Date().getFullYear();
  return baseTemplate(body + signature, year);
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

/**
 * Schön gestaltete Willkommens-Mail im MAW-Design: informiert den Mitarbeiter,
 * dass ein Zugang im Mitarbeiter-HUB erstellt wurde, inkl. Kennung, Initial-
 * passwort und Login-Button. Pflicht-Passwortwechsel + 2FA werden erklärt.
 */
export function renderWelcomeEmail(opts: {
  name: string;
  email: string;
  password: string;
  loginUrl: string;
}): string {
  const { name, email, password, loginUrl } = opts;
  const year = new Date().getFullYear();
  const content = `
    <h1 style="margin:0 0 14px 0; color:#FFFFFF; font-size:20px; line-height:28px; font-weight:700;">
      Willkommen im MAW&nbsp;Mitarbeiter-HUB
    </h1>
    <p style="margin:0 0 18px 0; color:#E5E7EB; font-size:14px; line-height:24px;">
      Hallo ${escapeHtml(name)},<br>
      für dich wurde ein Zugang zum internen Mitarbeiter-Portal erstellt. Mit diesen
      Zugangsdaten kannst du dich anmelden:
    </p>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
      style="background:#0A0E17; border:1px solid rgba(255,255,255,0.08); border-radius:12px; margin:0 0 22px 0;">
      <tr>
        <td style="padding:18px 20px;">
          <div style="color:#6B7280; font-size:12px; line-height:16px;">E-Mail (Kennung)</div>
          <div style="color:#FFFFFF; font-size:15px; font-weight:600; line-height:22px; margin-bottom:12px;">
            ${escapeHtml(email)}
          </div>
          <div style="color:#6B7280; font-size:12px; line-height:16px;">Initialpasswort</div>
          <div style="color:#E8920B; font-size:16px; font-weight:700; line-height:22px; font-family:'Courier New',Courier,monospace; letter-spacing:0.5px;">
            ${escapeHtml(password)}
          </div>
        </td>
      </tr>
    </table>

    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 22px 0;">
      <tr>
        <td align="center" style="border-radius:10px; background:#E8920B;">
          <a href="${escapeAttr(loginUrl)}"
            style="display:inline-block; padding:13px 28px; color:#0A0E17; font-size:14px; font-weight:700; text-decoration:none; border-radius:10px;">
            Jetzt anmelden
          </a>
        </td>
      </tr>
    </table>

    <p style="margin:0; color:#9CA3AF; font-size:13px; line-height:20px;">
      Bitte ändere dein Passwort direkt bei der ersten Anmeldung und richte anschließend
      die Zwei-Faktor-Authentifizierung (2FA) ein – aus Sicherheitsgründen ist 2FA
      verpflichtend. Solltest du diese Mail unerwartet erhalten haben, wende dich bitte
      an deine Ansprechperson.
    </p>`;
  return baseTemplate(content, year);
}

function baseTemplate(content: string, year: number): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark light">
  <meta name="supported-color-schemes" content="dark light">
  <title>Mining Adventure World</title>
</head>
<body style="margin:0; padding:0; background:#0A0E17; font-family:Arial, Helvetica, sans-serif; color:#E5E7EB; -webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#0A0E17; margin:0; padding:0;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px; margin:0 auto;">

          <!-- Header -->
          <tr>
            <td align="center" style="padding:10px 0 24px 0;">
              <a href="https://app.miningadventureworld.de" style="text-decoration:none; display:inline-block;">
                <img src="https://ykogoeqwqtjftwmkuxgs.supabase.co/storage/v1/object/public/email-assets/logo-maw.png" width="200" alt="Mining Adventure World" style="display:block; border:0; outline:none; text-decoration:none; height:auto; max-width:200px;">
              </a>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="padding:0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#111827; border:1px solid rgba(255,255,255,0.06); border-radius:16px; overflow:hidden;">

                <!-- Forge Accent Bar -->
                <tr>
                  <td style="background:#E8920B; height:4px; line-height:4px; font-size:0;">&nbsp;</td>
                </tr>

                <!-- Content -->
                <tr>
                  <td style="padding:32px 28px; color:#E5E7EB; font-size:14px; line-height:24px;">
                    ${content}
                  </td>
                </tr>

                <!-- Divider -->
                <tr>
                  <td style="padding:0 28px;">
                    <div style="height:1px; background:rgba(255,255,255,0.06); line-height:1px; font-size:0;">&nbsp;</div>
                  </td>
                </tr>

                <!-- Footer inside card -->
                <tr>
                  <td style="padding:20px 28px 24px 28px;">
                    <div style="font-size:12px; line-height:18px; color:#6B7280;">
                      Mining Adventure World<br>
                      <a href="https://app.miningadventureworld.de" style="color:#E8920B; text-decoration:none;">app.miningadventureworld.de</a>
                      &nbsp;·&nbsp;
                      <a href="tel:+49023629748990" style="color:#E8920B; text-decoration:none;">02362 - 97 48 99 0</a>
                    </div>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Legal -->
          <tr>
            <td align="center" style="padding:18px 8px 0 8px;">
              <div style="color:#4B5563; font-size:11px; line-height:16px; text-align:center;">
                © ${year} Mining Adventure World GmbH. Alle Rechte vorbehalten.
              </div>
              <div style="color:#374151; font-size:10px; line-height:14px; text-align:center; margin-top:6px;">
                Registergericht: Gelsenkirchen · HRB 17704 · GF: Stella Reuter, Niclas Holtrup · USt-IdNr.: DE361498974
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
