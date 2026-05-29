"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Minimale Login-Seite (Magic Link). Bewusst schlank gehalten – das
 * vollständige Auth-/Onboarding-UI folgt in Phase 1.2.
 */
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  // Fehler aus der Callback-Route (?error=...) anzeigen.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) {
      setStatus("error");
      setMessage(
        err === "missing_code"
          ? "Anmeldelink ungültig oder abgelaufen. Bitte erneut anfordern."
          : err,
      );
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    const supabase = createClient();
    // Origin dynamisch aus dem Browser – passt immer zur tatsächlichen Domain
    // (lokal wie Vercel). Der Magic Link führt zur Callback-Route, die den
    // Code gegen eine Session eintauscht.
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard` },
    });
    if (error) {
      setStatus("error");
      setMessage(error.message);
    } else {
      setStatus("sent");
      setMessage("Magic Link gesendet. Bitte E-Mail-Postfach prüfen.");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 shadow-sm">
        <h1 className="text-xl font-semibold">MAW Internal Portal</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Anmeldung für Mitarbeiter</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium">
              E-Mail
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand-500"
              placeholder="name@entertainmentwizards.de"
            />
          </div>
          <button
            type="submit"
            disabled={status === "sending"}
            className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {status === "sending" ? "Sende…" : "Magic Link senden"}
          </button>
        </form>

        {message && (
          <p
            className={`mt-4 text-sm ${status === "error" ? "text-red-500" : "text-[var(--muted)]"}`}
          >
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
