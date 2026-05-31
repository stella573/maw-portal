"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { APP_NAME } from "@/config/app";

type Status = "idle" | "submitting" | "error";

/**
 * Login-Seite für das interne Portal.
 * Anmeldung ausschließlich per E-Mail + Passwort (kein Magic Link).
 */
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  // Eventuelle Fehler aus einem Redirect (?error=... / ?deactivated=1) anzeigen.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (params.get("deactivated") === "1") {
      setStatus("error");
      setMessage(
        "Dein Zugang ist deaktiviert (in Personio inaktiv). Bitte wende dich an die Personalabteilung.",
      );
      return;
    }
    if (err) {
      setStatus("error");
      setMessage(decodeURIComponent(err));
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setStatus("error");
      setMessage(
        error.message === "Invalid login credentials"
          ? "E-Mail oder Passwort ist falsch."
          : error.message,
      );
      return;
    }
    // Nach Passwort ist die Session erst aal1. Die 2FA-Seite entscheidet, ob
    // Einrichtung oder Code-Abfrage nötig ist, und leitet bei Erfolg weiter.
    // Volle Navigation, damit die Middleware die frischen Cookies sofort sieht.
    window.location.assign("/security/2fa");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 shadow-sm">
        <h1 className="text-xl font-semibold">{APP_NAME}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Anmeldung für Mitarbeiter</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium">
              E-Mail
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand-500"
              placeholder="name@miningadventureworld.de"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium">
              Passwort
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand-500"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={status === "submitting"}
            className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {status === "submitting" ? "Anmelden…" : "Anmelden"}
          </button>
        </form>

        {message && (
          <p className="mt-4 text-sm text-red-500">{message}</p>
        )}
      </div>
    </main>
  );
}
