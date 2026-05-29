"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Step = "loading" | "show_qr" | "verifying" | "error";

/**
 * 2FA-Einrichtung (TOTP):
 *  1. enroll() → liefert QR-Code (SVG) + Secret
 *  2. User scannt mit Authenticator-App
 *  3. User gibt 6-stelligen Code ein → challenge() + verify()
 *  4. Erfolg → Session wird auf aal2 gehoben, weiter ins Portal
 *
 * Sicherheit: Schlägt das Verifizieren fehl, wird der eben angelegte
 * (unverifizierte) Faktor wieder entfernt, damit keine halben Faktoren
 * zurückbleiben.
 */
export function MfaEnroll() {
  const supabase = useRef(createClient());
  const [step, setStep] = useState<Step>("loading");
  const [qrSvg, setQrSvg] = useState<string>("");
  const [secret, setSecret] = useState<string>("");
  const [factorId, setFactorId] = useState<string>("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const startedRef = useRef(false);

  useEffect(() => {
    // Strict-Mode-Schutz: nur einmal enrollen.
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      const sb = supabase.current;

      // Etwaige verwaiste, unverifizierte TOTP-Faktoren aufräumen.
      const { data: list } = await sb.auth.mfa.listFactors();
      const stale = list?.all?.filter(
        (f) => f.factor_type === "totp" && f.status === "unverified",
      );
      if (stale) {
        for (const f of stale) {
          await sb.auth.mfa.unenroll({ factorId: f.id });
        }
      }

      const { data, error: enrollErr } = await sb.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Authenticator (${new Date().toLocaleDateString("de-DE")})`,
      });

      if (enrollErr || !data) {
        setError(enrollErr?.message ?? "Einrichtung fehlgeschlagen.");
        setStep("error");
        return;
      }

      setFactorId(data.id);
      setQrSvg(data.totp.qr_code);
      setSecret(data.totp.secret);
      setStep("show_qr");
    })();
  }, []);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setStep("verifying");
    const sb = supabase.current;

    const { data: challenge, error: chErr } = await sb.auth.mfa.challenge({
      factorId,
    });
    if (chErr || !challenge) {
      setError(chErr?.message ?? "Challenge fehlgeschlagen.");
      setStep("show_qr");
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
      setStep("show_qr");
      return;
    }

    // Erfolg: Session ist jetzt aal2. Audit serverseitig protokollieren,
    // dann volle Navigation, damit die Middleware den neuen Status sieht.
    try {
      await fetch("/api/auth/mfa-audit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event: "enrolled" }),
      });
    } catch {
      /* Audit ist best effort */
    }
    window.location.assign("/dashboard");
  }

  if (step === "loading") {
    return <p className="text-sm text-[var(--muted)]">Einrichtung wird vorbereitet…</p>;
  }

  if (step === "error") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-500">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
        >
          Erneut versuchen
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1 text-sm text-[var(--muted)]">
        <p>
          Diese Anmeldung erfordert Zwei-Faktor-Authentifizierung. Scanne den
          Code mit einer Authenticator-App (z.&nbsp;B. Google Authenticator,
          Microsoft Authenticator, 1Password).
        </p>
      </div>

      {/* QR-Code (SVG-Data-URL aus Supabase) */}
      <div className="flex justify-center rounded-lg border border-[var(--border)] bg-white p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrSvg} alt="2FA QR-Code" className="h-44 w-44" />
      </div>

      <details className="text-xs text-[var(--muted)]">
        <summary className="cursor-pointer">QR-Code lässt sich nicht scannen?</summary>
        <p className="mt-2 break-all">
          Gib diesen Schlüssel manuell ein:
          <code className="ml-1 rounded bg-[var(--background)] px-1 py-0.5">{secret}</code>
        </p>
      </details>

      <form onSubmit={handleVerify} className="space-y-3">
        <label htmlFor="code" className="block text-sm font-medium">
          6-stelligen Code aus der App eingeben
        </label>
        <input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-center text-lg tracking-[0.4em] outline-none focus:border-brand-500"
          placeholder="000000"
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={step === "verifying" || code.length !== 6}
          className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {step === "verifying" ? "Prüfe…" : "Aktivieren & fortfahren"}
        </button>
      </form>
    </div>
  );
}
