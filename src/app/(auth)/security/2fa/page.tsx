import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMfaStatus } from "@/lib/auth/mfa";
import { MfaEnroll } from "@/components/auth/mfa-enroll";
import { MfaChallenge } from "@/components/auth/mfa-challenge";
import { APP_NAME } from "@/config/app";

/**
 * 2FA-Gate. Pflicht für alle. Je nach Session-Zustand:
 *  - needs_setup     → Authenticator einrichten (QR-Code)
 *  - needs_challenge → vorhandenen Faktor per Code bestätigen
 *  - ok              → bereits erfüllt, weiter ins Portal
 *
 * Liegt bewusst außerhalb der Portal-Shell: der User hat hier noch keinen
 * vollwertigen (aal2) Zugriff.
 */
export default async function TwoFactorPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Ohne Session: zurück zum Login (Middleware greift normalerweise schon).
  if (!user) redirect("/login");

  const mfa = await getMfaStatus(supabase);
  if (mfa.state === "ok") redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm sm:p-8">
        <h1 className="text-lg font-semibold sm:text-xl">{APP_NAME}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Zwei-Faktor-Authentifizierung
        </p>

        <div className="mt-6">
          {mfa.state === "needs_setup" ? <MfaEnroll /> : <MfaChallenge />}
        </div>
      </div>
    </main>
  );
}
