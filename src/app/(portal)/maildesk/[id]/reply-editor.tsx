"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Send } from "lucide-react";

/**
 * Antwort-Editor: Textfeld + KI-Vorschlag (Claude) + Versand über Resend.
 * KI erzeugt nur einen Entwurf im Feld – gesendet wird ausschließlich per
 * bewusstem Klick auf "Senden".
 */
export function ReplyEditor({
  ticketId,
  hasCustomer,
}: {
  ticketId: string;
  hasCustomer: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function handleSuggest() {
    setSuggesting(true);
    setError("");
    setInfo("");
    try {
      const res = await fetch("/api/mail/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticketId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "KI-Vorschlag fehlgeschlagen.");
      } else {
        setBody(data.suggestion ?? "");
        setInfo("KI-Vorschlag eingefügt – bitte prüfen und ggf. anpassen.");
      }
    } catch {
      setError("KI-Vorschlag fehlgeschlagen.");
    } finally {
      setSuggesting(false);
    }
  }

  async function handleSend() {
    if (!body.trim()) return;
    setSending(true);
    setError("");
    setInfo("");
    try {
      const res = await fetch("/api/mail/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticketId, bodyText: body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Versand fehlgeschlagen.");
      } else {
        setBody("");
        setInfo("Antwort gesendet.");
        router.refresh();
      }
    } catch {
      setError("Versand fehlgeschlagen.");
    } finally {
      setSending(false);
    }
  }

  if (!hasCustomer) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
        Keine Kunden-E-Mail hinterlegt – Antwort per Mail nicht möglich.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium">Antworten</h2>
        <button
          type="button"
          onClick={handleSuggest}
          disabled={suggesting || sending}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs transition hover:bg-[var(--background)] disabled:opacity-60"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {suggesting ? "KI denkt nach…" : "KI-Vorschlag"}
        </button>
      </div>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={6}
        placeholder="Antwort an den Kunden…"
        className="w-full resize-y rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand-500"
      />

      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      {info && (
        <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">{info}</p>
      )}

      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-[var(--muted)]">
          Versand über das Postfach. KI sendet nie automatisch.
        </p>
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || suggesting || !body.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          <Send className="h-4 w-4" />
          {sending ? "Sende…" : "Senden"}
        </button>
      </div>
    </div>
  );
}
