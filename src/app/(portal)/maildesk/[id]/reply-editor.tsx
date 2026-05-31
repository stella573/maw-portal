"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Send, Paperclip, X } from "lucide-react";

interface PendingAttachment {
  id: string;
  fileName: string;
  sizeBytes: number;
}

/**
 * Antwort-Editor: Textfeld + KI-Vorschlag (Claude) + Versand über Resend.
 * KI erzeugt nur einen Entwurf im Feld – gesendet wird ausschließlich per
 * bewusstem Klick auf "Senden".
 *
 * onTypingChange meldet dem Presence-Channel, dass hier gerade getippt wird
 * (für die Live-Anzeige bei anderen Bearbeitern). Wird nach kurzer Inaktivität
 * automatisch zurückgesetzt.
 */
export function ReplyEditor({
  ticketId,
  hasCustomer,
  onTypingChange,
}: {
  ticketId: string;
  hasCustomer: boolean;
  onTypingChange?: (typing: boolean) => void;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tipp-Status melden und nach 2,5 s Inaktivität wieder zurücknehmen.
  function signalTyping() {
    onTypingChange?.(true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => onTypingChange?.(false), 2500);
  }

  // Beim Verlassen der Komponente Tipp-Status sicher zurücksetzen.
  useEffect(() => {
    return () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      onTypingChange?.(false);
    };
  }, [onTypingChange]);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError("");
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.set("ticketId", ticketId);
        fd.set("file", file);
        const res = await fetch("/api/mail/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? `Upload von ${file.name} fehlgeschlagen.`);
        } else {
          setAttachments((prev) => [
            ...prev,
            { id: data.id, fileName: data.fileName, sizeBytes: data.sizeBytes },
          ]);
        }
      }
    } catch {
      setError("Upload fehlgeschlagen.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

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
        body: JSON.stringify({
          ticketId,
          bodyText: body,
          attachmentIds: attachments.map((a) => a.id),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Versand fehlgeschlagen.");
      } else {
        setBody("");
        setAttachments([]);
        setInfo("Antwort gesendet.");
        onTypingChange?.(false);
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
        onChange={(e) => {
          setBody(e.target.value);
          signalTyping();
        }}
        onBlur={() => onTypingChange?.(false)}
        rows={6}
        placeholder="Antwort an den Kunden…"
        className="w-full resize-y rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand-500"
      />

      {/* Anhänge */}
      {attachments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {attachments.map((a) => (
            <span
              key={a.id}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-1 text-xs"
            >
              <Paperclip className="h-3 w-3 shrink-0" />
              <span className="max-w-[180px] truncate">{a.fileName}</span>
              <button
                type="button"
                onClick={() => removeAttachment(a.id)}
                aria-label="Anhang entfernen"
                className="text-[var(--muted)] hover:text-red-500"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      {info && (
        <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">{info}</p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleUpload(e.target.files)}
      />

      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || sending}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-2 text-xs transition hover:bg-[var(--background)] disabled:opacity-60"
        >
          <Paperclip className="h-3.5 w-3.5" />
          {uploading ? "Lädt…" : "Anhängen"}
        </button>
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || suggesting || uploading || !body.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          <Send className="h-4 w-4" />
          {sending ? "Sende…" : "Senden"}
        </button>
      </div>
    </div>
  );
}
