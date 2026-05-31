/**
 * Erzeugt eine Vorlage für die persönliche HTML-Signatur im MAW-Stil.
 * Name/E-Mail werden vorbelegt; Position, Telefon und Bild passt jede/r
 * Mitarbeiter/in selbst an.
 */
export function buildDefaultSignature(opts: {
  name: string;
  email: string;
}): string {
  const { name, email } = opts;
  return `Mit freundlichen Grüßen
<!-- Signature -->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px;">
<tr>
<td style="padding-top:18px;">

<table role="presentation" cellspacing="0" cellpadding="0" border="0">
<tr>

<!-- Mitarbeiterbild -->
<td style="padding-right:16px; vertical-align:top;">
<img
src="https://gjtqwezwwmenhjkjrhnm.supabase.co/storage/v1/object/public/project-images/team/PLATZHALTER.webp"
width="64"
height="64"
alt="${name}"
style="display:block; border-radius:50%; object-fit:cover;"
>
</td>

<!-- Mitarbeiterdaten -->
<td style="vertical-align:top; font-family:Arial, Helvetica, sans-serif;">

<div style="color:#E8920B; font-size:15px; font-weight:700; line-height:20px;">
${name}
</div>

<div style="color:#6B7280; font-size:13px; line-height:18px; margin-bottom:8px;">
Position / Funktion
</div>

<div style="font-size:13px; line-height:20px;">

<span style="color:#6B7280;">E-Mail:</span>
<a href="mailto:${email}" style="color:#E8920B; text-decoration:none;">
${email}
</a>
<br>

<span style="color:#6B7280;">Telefon:</span>
<a href="tel:+49023629748990" style="color:#E8920B; text-decoration:none;">
02362 - 97 48 99 0
</a>
</div>

</td>
</tr>
</table>

</td>
</tr>
</table>
<!-- /Signature -->`;
}
