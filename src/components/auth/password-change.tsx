"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Erzwungene Passwortänderung. Setzt ein neues Passwort und entfernt das
 * must_change_password-Flag in einem Schritt (updateUser). Danach volle
 * Navigation, damit die Middleware den neuen Zustand sieht.
 */
export function PasswordChange() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (pw.length < 10) {
      setError("Das Passwort muss mindestens 10 Zeichen haben.");
      return;
    }
    if (pw !== pw2) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const { error: updErr } = await supabase.auth.updateUser({
      password: pw,
      data: { must_change_password: false },
    });

    if (updErr) {
      setError(
        /should be different|same/i.test(updErr.message)
          ? "Bitte ein anderes als das Initialpasswort wählen."
          : updErr.message,
      );
      setBusy(false);
      return;
    }

    try {
      await fetch("/api/auth/password-changed", { method: "POST" });
    } catch {
      /* Audit ist best effort */
    }
    window.location.assign("/dashboard");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="pw" className="block text-sm font-medium">
          Neues Passwort
        </label>
        <input
          id="pw"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand-500"
          placeholder="mind. 10 Zeichen"
        />
      </div>
      <div>
        <label htmlFor="pw2" className="block text-sm font-medium">
          Passwort wiederholen
        </label>
        <input
          id="pw2"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand-500"
          placeholder="erneut eingeben"
        />
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
      >
        {busy ? "Speichere…" : "Passwort festlegen"}
      </button>
    </form>
  );
}
