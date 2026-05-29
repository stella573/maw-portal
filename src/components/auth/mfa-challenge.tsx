"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * 2FA-Abfrage beim Login: Der User hat bereits einen verifizierten TOTP-Faktor.
 * Wir fordern den aktuellen 6-stelligen Code an und heben die Session auf aal2.
 */
export function MfaChallenge() {
  const supabase = useRef(createClient());
  const [factorId, setFactorId] = useState<string>("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error: listErr } = await supabase.current.auth.mfa.listFactors();
      const totp = data?.totp?.[0];
      if (listErr || !totp) {
        setError("Kein 2FA-Faktor gefunden. Bitte neu anmelden.");
        return;
      }
      setFactorId(totp.id);
      setReady(true);
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const sb = supabase.current;

    const { data: challenge, error: chErr } = await sb.auth.mfa.challenge({
      factorId,
    });
    if (chErr || !challenge) {
      setError(chErr?.message ?? "Challenge fehlgeschlagen.");
      setBusy(false);
      return;
    }

    const { error: vErr } = await sb.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: code.trim(),
    });

    if (vErr) {
      setError(
        /invalid/i.test(vErr.message)
          ? "Code ungültig. Bitte aktuellen 6-stelligen Code eingeben."
          : vErr.message,
      );
      setBusy(false);
      // Fehlgeschlagene Challenge protokollieren (best effort).
      fetch("/api/auth/mfa-audit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event: "challenge_failed" }),
      }).catch(() => {});
      return;
    }

    try {
      await fetch("/api/auth/mfa-audit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event: "verified" }),
      });
    } catch {
      /* best effort */
    }
    window.location.assign("/dashboard");
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-[var(--muted)]">
        Gib den aktuellen 6-stelligen Code aus deiner Authenticator-App ein, um
        die Anmeldung abzuschließen.
      </p>

      <form onSubmit={handleSubmit} className="space-y-3">
        <label htmlFor="code" className="block text-sm font-medium">
          Authenticator-Code
        </label>
        <input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          required
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-center text-lg tracking-[0.4em] outline-none focus:border-brand-500"
          placeholder="000000"
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={!ready || busy || code.length !== 6}
          className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {busy ? "Prüfe…" : "Bestätigen"}
        </button>
      </form>

      <form action="/auth/signout" method="post">
        <button type="submit" className="text-xs text-[var(--muted)] hover:underline">
          Abbrechen und abmelden
        </button>
      </form>
    </div>
  );
}
