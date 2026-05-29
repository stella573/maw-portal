import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { mustChangePassword } from "@/lib/auth/password-policy";
import { PasswordChange } from "@/components/auth/password-change";
import { APP_NAME } from "@/config/app";

/**
 * Erzwungene Passwortänderung. Wird von der Middleware angesteuert, solange
 * must_change_password gesetzt ist. Liegt außerhalb der Portal-Shell.
 */
export default async function PasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  // Wer es nicht (mehr) muss, soll hier nicht hängen bleiben.
  if (!mustChangePassword(user)) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm sm:p-8">
        <h1 className="text-lg font-semibold sm:text-xl">{APP_NAME}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Neues Passwort festlegen
        </p>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Aus Sicherheitsgründen musst du dein Initialpasswort jetzt durch ein
          eigenes ersetzen.
        </p>
        <div className="mt-6">
          <PasswordChange />
        </div>
      </div>
    </main>
  );
}
