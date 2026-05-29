"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Mode = "password" | "magic";
type Status = "idle" | "submitting" | "sent" | "error";

/**
 * Login-Seite für das interne Portal.
 *
 * Primär: E-Mail + Passwort (robust in Firmenumgebungen – E-Mail-Scanner
 * können keine Einmal-Tokens "verbrauchen"). Magic Link bleibt als optionaler
 * Fallback verfügbar.
 */
export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
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
          : decodeURIComponent(err),
      );
    }
  }, []);

  function redirectTarget(): string {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("redirectTo");
    return next && next.startsWith("/") ? next : "/dashboard";
  }

  async function handlePassword(e: React.FormEvent) {
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
    // Volle Navigation, damit die Middleware die frischen Cookies sofort sieht.
    window.location.assign(redirectTarget());
  }

  async function handleMagic(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTarget())}`,
      },
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

        <form
          onSubmit={mode === "password" ? handlePassword : handleMagic}
          className="mt-6 space-y-4"
        >
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

          {mode === "password" && (
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
          )}

          <button
            type="submit"
            disabled={status === "submitting"}
            className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {status === "submitting"
              ? mode === "password"
                ? "Anmelden…"
                : "Sende…"
              : mode === "password"
                ? "Anmelden"
                : "Magic Link senden"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode((m) => (m === "password" ? "magic" : "password"));
            setStatus("idle");
            setMessage("");
          }}
          className="mt-4 text-xs text-[var(--muted)] underline-offset-2 hover:underline"
        >
          {mode === "password"
            ? "Stattdessen Magic Link per E-Mail"
            : "Stattdessen mit Passwort anmelden"}
        </button>

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
