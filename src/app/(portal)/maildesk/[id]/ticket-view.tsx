"use client";

import { useActionState } from "react";
import { ArrowLeft, StickyNote } from "lucide-react";
import Link from "next/link";
import { updateTicket, addNote } from "./actions";
import {
  TICKET_STATUS_LABELS,
  TICKET_PRIORITY_LABELS,
} from "@/modules/maildesk/types";
import type { TicketStatus, TicketPriority } from "@/types/database";
import type { TicketDetail } from "@/modules/maildesk/services/ticket-detail";

export function TicketView({ ticket }: { ticket: TicketDetail }) {
  return (
    <div>
      <Link
        href="/maildesk"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--muted)] transition hover:text-[var(--foreground)]"
      >
        <ArrowLeft className="h-4 w-4" /> Zurück zur Inbox
      </Link>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Hauptspalte: Verlauf */}
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <h1 className="text-lg font-semibold">{ticket.subject}</h1>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {ticket.reference}
              {ticket.mailboxName ? ` · ${ticket.mailboxName}` : ""}
            </p>
          </div>

          <div className="space-y-3">
            {ticket.messages.length === 0 && (
              <p className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-6 text-center text-sm text-[var(--muted)]">
                Noch keine Nachrichten in diesem Vorgang.
              </p>
            )}
            {ticket.messages.map((m) => (
              <div
                key={m.id}
                className={`rounded-xl border p-4 ${
                  m.direction === "outbound"
                    ? "border-brand-500/30 bg-brand-50/50 dark:bg-brand-700/10"
                    : "border-[var(--border)] bg-[var(--surface)]"
                }`}
              >
                <div className="mb-2 flex items-center justify-between text-xs text-[var(--muted)]">
                  <span>
                    {m.direction === "outbound"
                      ? `→ ${m.toEmail ?? "Kunde"}${m.authorName ? ` · ${m.authorName}` : ""}`
                      : `← ${m.fromEmail ?? "Kunde"}`}
                    {m.isDraft && " · Entwurf"}
                  </span>
                  <span>{formatDateTime(m.createdAt)}</span>
                </div>
                <MessageBody text={m.bodyText} html={m.bodyHtml} />
              </div>
            ))}
          </div>

          {/* Antwort-Hinweis (Versand via Resend folgt im nächsten Schritt) */}
          <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
            Antwort-Editor mit Versand über Resend + KI-Vorschläge folgt im
            nächsten Schritt.
          </div>
        </div>

        {/* Seitenspalte: Steuerung + Kunde + Notizen */}
        <div className="space-y-4">
          <TicketControls ticket={ticket} />
          <CustomerCard ticket={ticket} />
          <NotesCard ticket={ticket} />
        </div>
      </div>
    </div>
  );
}

function TicketControls({ ticket }: { ticket: TicketDetail }) {
  const [result, action, pending] = useActionState(updateTicket, null);
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h2 className="text-sm font-medium">Vorgang</h2>
      <form action={action} className="mt-3 space-y-3">
        <input type="hidden" name="ticketId" value={ticket.id} />
        <div>
          <label className="block text-xs text-[var(--muted)]">Status</label>
          <select
            name="status"
            defaultValue={ticket.status}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-2 py-2 text-sm outline-none focus:border-brand-500"
          >
            {(Object.keys(TICKET_STATUS_LABELS) as TicketStatus[]).map((s) => (
              <option key={s} value={s}>
                {TICKET_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-[var(--muted)]">Priorität</label>
          <select
            name="priority"
            defaultValue={ticket.priority}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-2 py-2 text-sm outline-none focus:border-brand-500"
          >
            {(Object.keys(TICKET_PRIORITY_LABELS) as TicketPriority[]).map((p) => (
              <option key={p} value={p}>
                {TICKET_PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Speichere…" : "Speichern"}
        </button>
        {result && (
          <p className={`text-sm ${result.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
            {result.message}
          </p>
        )}
      </form>
    </div>
  );
}

function CustomerCard({ ticket }: { ticket: TicketDetail }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h2 className="text-sm font-medium">Kunde</h2>
      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--muted)]">Name</dt>
          <dd className="truncate">{ticket.customerName ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--muted)]">E-Mail</dt>
          <dd className="truncate">{ticket.customerEmail ?? "—"}</dd>
        </div>
      </dl>
    </div>
  );
}

function NotesCard({ ticket }: { ticket: TicketDetail }) {
  const [result, action, pending] = useActionState(addNote, null);
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h2 className="flex items-center gap-1.5 text-sm font-medium">
        <StickyNote className="h-4 w-4" /> Interne Notizen
      </h2>
      <div className="mt-3 space-y-2">
        {ticket.notes.length === 0 && (
          <p className="text-xs text-[var(--muted)]">Noch keine Notizen.</p>
        )}
        {ticket.notes.map((n) => (
          <div key={n.id} className="rounded-lg bg-[var(--background)] p-2 text-sm">
            <div className="whitespace-pre-wrap">{n.body}</div>
            <div className="mt-1 text-[10px] text-[var(--muted)]">
              {n.authorName ?? "—"} · {formatDateTime(n.createdAt)}
            </div>
          </div>
        ))}
      </div>
      <form action={action} className="mt-3 space-y-2">
        <input type="hidden" name="ticketId" value={ticket.id} />
        <textarea
          name="body"
          rows={2}
          required
          placeholder="Interne Notiz (nicht für Kunden sichtbar)…"
          className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm transition hover:bg-[var(--background)] disabled:opacity-60"
        >
          {pending ? "Speichere…" : "Notiz hinzufügen"}
        </button>
        {result && !result.ok && (
          <p className="text-sm text-red-500">{result.message}</p>
        )}
      </form>
    </div>
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function stripHtml(html: string | null): string {
  if (!html) return "";
  return html
    // Block-Elemente in Zeilenumbrüche überführen, damit der Text lesbar bleibt
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|tr|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    // HTML-Entities grob auflösen
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/** Rendert den Nachrichtentext; fällt auf HTML-Strip zurück, sonst Hinweis. */
function MessageBody({
  text,
  html,
}: {
  text: string | null;
  html: string | null;
}) {
  const content = (text && text.trim()) || stripHtml(html);
  if (!content) {
    return (
      <p className="text-sm italic text-[var(--muted)]">
        (Kein Textinhalt – evtl. nur HTML/Anhang. Rohdaten liegen am Ticket vor.)
      </p>
    );
  }
  return <div className="whitespace-pre-wrap break-words text-sm">{content}</div>;
}
