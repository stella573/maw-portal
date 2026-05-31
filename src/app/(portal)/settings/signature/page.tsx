import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/services/auth/current-user";
import { SignatureEditor } from "./signature-editor";
import { buildDefaultSignature } from "./default-signature";

/**
 * Persönliche E-Mail-Signatur. Jede/r Mitarbeiter/in pflegt die eigene
 * HTML-Signatur, die beim Versand unter den Nachrichtentext gesetzt wird.
 */
export default async function SignaturePage() {
  const ctx = await getCurrentUser();
  if (!ctx) {
    return (
      <p className="text-sm text-[var(--muted)]">Nicht authentifiziert.</p>
    );
  }

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("signature_html")
    .eq("id", ctx.profileId)
    .maybeSingle();

  const fallback = buildDefaultSignature({
    name: ctx.fullName ?? ctx.email,
    email: ctx.email,
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">E-Mail-Signatur</h2>
        <p className="text-sm text-[var(--muted)]">
          Wird bei deinen ausgehenden Antworten automatisch unter den Text und
          unter das MAW-Template gesetzt. HTML ist erlaubt.
        </p>
      </div>
      <SignatureEditor
        initialValue={profile?.signature_html ?? ""}
        defaultTemplate={fallback}
      />
    </div>
  );
}
