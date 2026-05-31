"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, StickyNote, Paperclip, Check, RotateCcw, Eye, PenLine } from "lucide-react";
import Link from "next/link";
import { updateTicket, addNote, assignTicket } from "./actions";
import { setTicketStatus } from "../actions";
import {
  TICKET_STATUS_LABELS,
  TICKET_PRIORITY_LABELS,
} from "@/modules/maildesk/types";
import {
  useMaildeskPresence,
  useRealtimeRefresh,
} from "@/modules/maildesk/realtime";
import type { TicketStatus, TicketPriority } from "@/types/database";
import type {
  TicketDetail,
  TicketDetailAttachment,
} from "@/modules/maildesk/services/ticket-detail";
import { ReplyEditor } from "./reply-editor";

export function TicketView({
  ticket,
  showDiagnostics = false,
  currentUser,
}: {
  ticket: TicketDetail;
  showDiagnostics?: boolean;
  currentUser: { profileId: string; name: string } | null;
}) {
  // Live: Status-/Zuweisungs-Änderungen und neue Nachrichten sofort spiegeln.
  useRealtimeRefresh([
    { table: "tickets", filter: `id=eq.${ticket.id}` },
    { table: "messages", filter: `ticket_id=eq.${ticket.id}` },
    { table: "notes", filter: `ticket_id=eq.${ticket.id}` },
  ]);

  // Presence: wer schaut/tippt gerade an diesem Ticket?
  const { peers, setTyping } = useMaildeskPresence(
    currentUser ?? { profileId: "anon", name: "—" },
    ticket.id,
  );
  const here = peers.filter((p) => p.ticketId === ticket.id);

  return (
    <div>
      <Link
        href="/maildesk"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--muted)] transition hover:text-[var(--foreground)]"
      >
        <ArrowLeft className="h-4 w-4" /> Zurück zur Inbox
      </Link>

      {/* Hinweis: weitere Bearbeiter im selben Ticket (Doppelbearbeitung vermeiden) */}
      {here.length > 0 && <PresenceBanner peers={here} />}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Hauptspalte: Verlauf */}
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-lg font-semibold">{ticket.subject}</h1>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {ticket.reference}
                  {ticket.mailboxName ? ` · ${ticket.mailboxName}` : ""}
                </p>
              </div>
              <QuickCloseButton ticket={ticket} />
            </div>
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
                <AttachmentList
                  items={ticket.attachments.filter((a) => a.messageId === m.id)}
                />
                {showDiagnostics &&
                  m.direction === "inbound" &&
                  m.raw != null && (
                    <details className="mt-3 text-xs">
                      <summary className="cursor-pointer text-[var(--muted)]">
                        Diagnose: Rohdaten der eingegangenen Mail
                      </summary>
                      <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-[var(--background)] p-3 text-[11px] leading-relaxed">
                        {JSON.stringify(m.raw, null, 2)}
                      </pre>
                    </details>
                  )}
              </div>
            ))}
          </div>

          {/* Antwort-Editor: Versand über Resend + KI-Vorschläge */}
          <ReplyEditor
            ticketId={ticket.id}
            hasCustomer={!!ticket.customerEmail}
            onTypingChange={setTyping}
          />
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

/** Banner mit weiteren Bearbeitern, die dasselbe Ticket offen haben. */
function PresenceBanner({
  peers,
}: {
  peers: { profileId: string; name: string; typing: boolean }[];
}) {
  const typist = peers.find((p) => p.typing);
  return (
    <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-300">
      {typist ? <PenLine className="h-4 w-4 shrink-0" /> : <Eye className="h-4 w-4 shrink-0" />}
      <span>
        {typist ? (
          <>
            <strong>{typist.name}</strong> tippt gerade eine Antwort…
          </>
        ) : peers.length === 1 ? (
          <>
            <strong>{peers[0]?.name}</strong> sieht dieses Ticket gerade ebenfalls.
          </>
        ) : (
          <>
            <strong>{peers.length} Bearbeiter</strong> sind gerade in diesem
            Ticket: {peers.map((p) => p.name).join(", ")}.
          </>
        )}
      </span>
    </div>
  );
}

/** 1-Klick „Erledigt" / „Wieder öffnen" direkt im Ticketkopf. */
function QuickCloseButton({ ticket }: { ticket: TicketDetail }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function resolve() {
    startTransition(async () => {
      await setTicketStatus(ticket.id, "resolved");
      // Zurück in die Inbox des Postfachs zu den restlichen offenen Vorgängen
      // (Standardansicht „Aktiv" blendet das erledigte Ticket aus).
      const params = new URLSearchParams();
      if (ticket.mailboxId) params.set("mailbox", ticket.mailboxId);
      router.push(`/maildesk?${params.toString()}`);
      router.refresh();
    });
  }

  function reopen() {
    startTransition(async () => {
      await setTicketStatus(ticket.id, "open");
      router.refresh();
    });
  }

  if (ticket.status === "resolved") {
    return (
      <button
        type="button"
        onClick={reopen}
        disabled={pending}
        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-sm transition hover:bg-[var(--background)] disabled:opacity-60"
      >
        <RotateCcw className="h-4 w-4" /> {pending ? "…" : "Wieder öffnen"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={resolve}
      disabled={pending}
      className="flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
    >
      <Check className="h-4 w-4" /> {pending ? "…" : "Erledigt"}
    </button>
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

      <AssignControl ticket={ticket} />
    </div>
  );
}

/** Zuweisung des Tickets an ein Postfach-Mitglied. */
function AssignControl({ ticket }: { ticket: TicketDetail }) {
  const [result, action, pending] = useActionState(assignTicket, null);
  return (
    <form action={action} className="mt-4 border-t border-[var(--border)] pt-3">
      <input type="hidden" name="ticketId" value={ticket.id} />
      <label className="block text-xs text-[var(--muted)]">Zugewiesen an</label>
      <div className="mt-1 flex gap-2">
        <select
          name="assigneeId"
          defaultValue={ticket.assigneeId ?? ""}
          className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-transparent px-2 py-2 text-sm outline-none focus:border-brand-500"
        >
          <option value="">— niemand —</option>
          {ticket.assignableAgents.map((a) => (
            <option key={a.profileId} value={a.profileId}>
              {a.name}
            </option>
          ))}
          {/* aktueller Bearbeiter, der (noch) kein Postfach-Mitglied ist */}
          {ticket.assigneeId &&
            !ticket.assignableAgents.some((a) => a.profileId === ticket.assigneeId) && (
              <option value={ticket.assigneeId}>
                {ticket.assigneeName ?? "Aktueller Bearbeiter"}
              </option>
            )}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-2 text-sm transition hover:bg-[var(--background)] disabled:opacity-60"
        >
          {pending ? "…" : "Setzen"}
        </button>
      </div>
      {ticket.assignableAgents.length === 0 && (
        <p className="mt-1 text-xs text-[var(--muted)]">
          Keine Postfach-Mitglieder – unter Einstellungen → Postfächer zuweisen.
        </p>
      )}
      {result && (
        <p
          className={`mt-2 text-sm ${result.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}
        >
          {result.message}
        </p>
      )}
    </form>
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

/** Liste der Anhänge einer Nachricht – Download über die berechtigte Route. */
function AttachmentList({ items }: { items: TicketDetailAttachment[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {items.map((a) => (
        <a
          key={a.id}
          href={`/api/mail/attachment/${a.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-xs transition hover:bg-[var(--surface)]"
        >
          <Paperclip className="h-3.5 w-3.5 shrink-0" />
          <span className="max-w-[200px] truncate">{a.fileName}</span>
          {a.sizeBytes != null && (
            <span className="text-[var(--muted)]">{formatBytes(a.sizeBytes)}</span>
          )}
        </a>
      ))}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Rendert den Nachrichteninhalt. Bevorzugt echtes HTML (z. B. Buchungs-/
 * System-Mails) in einem abgeschotteten iframe – das blockiert Scripts in der
 * Fremd-Mail (XSS-Schutz) und kapselt deren CSS vom Portal. Ohne HTML wird der
 * Reintext angezeigt. Ein Umschalter erlaubt die reine Textansicht.
 */
function MessageBody({
  text,
  html,
}: {
  text: string | null;
  html: string | null;
}) {
  const hasHtml = !!(html && html.trim());
  const plain = (text && text.trim()) || stripHtml(html);
  const [showHtml, setShowHtml] = useState(hasHtml);

  if (!hasHtml && !plain) {
    return (
      <p className="text-sm italic text-[var(--muted)]">
        (Kein Textinhalt – evtl. nur Anhang. Rohdaten liegen am Ticket vor.)
      </p>
    );
  }

  return (
    <div>
      {hasHtml && showHtml ? (
        <HtmlMessage html={html!} />
      ) : (
        <div className="whitespace-pre-wrap break-words text-sm">{plain}</div>
      )}
      {hasHtml && (
        <button
          type="button"
          onClick={() => setShowHtml((v) => !v)}
          className="mt-2 text-xs text-[var(--muted)] underline-offset-2 hover:underline"
        >
          {showHtml ? "Als Text anzeigen" : "Als HTML anzeigen"}
        </button>
      )}
    </div>
  );
}

/**
 * Zeigt E-Mail-HTML in einem gesandboxten iframe – responsiv aufbereitet.
 * - sandbox ohne allow-scripts: Scripts der Mail laufen NICHT (XSS-Schutz),
 *   wir können aber (same-origin) Höhe messen und Layout anpassen.
 * - injiziertes CSS zwingt feste Breiten (typische 600px-Mail-Tabellen) und
 *   Bilder, sich an die Containerbreite anzupassen → kein horizontales Scrollen.
 */
function HtmlMessage({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(160);

  function measure() {
    try {
      const doc = ref.current?.contentDocument;
      if (doc?.body) {
        const h = Math.min(
          Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight) + 16,
          2000,
        );
        setHeight(h);
      }
    } catch {
      /* Höhe nicht lesbar – Standardhöhe bleibt */
    }
  }

  function handleLoad() {
    measure();
    // Nach Bild-Laden und bei Größenänderung neu messen.
    try {
      const win = ref.current?.contentWindow;
      const doc = ref.current?.contentDocument;
      doc?.querySelectorAll("img").forEach((img) => {
        if (!img.complete) img.addEventListener("load", measure, { once: true });
      });
      win?.addEventListener("resize", measure);
    } catch {
      /* ignore */
    }
    // mehrfach nachmessen, bis Layout/Bilder stehen
    setTimeout(measure, 150);
    setTimeout(measure, 600);
  }

  // CSS, das feste Mail-Layouts responsiv macht.
  const responsiveCss = `
    html,body{margin:0;padding:10px;background:#fff;color:#111;
      font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;
      word-break:break-word;overflow-x:hidden;-webkit-text-size-adjust:100%;}
    img{max-width:100% !important;height:auto !important;}
    /* feste Breiten (width="600", style="width:600px") aufbrechen */
    table{max-width:100% !important;}
    table[width]{width:100% !important;}
    td,th{max-width:100% !important;}
    *[width]{max-width:100% !important;}
    div,p,span,table,td{max-width:100% !important;}
    /* sehr breite Inline-Styles abfangen */
    [style*="width:6"],[style*="width: 6"],[style*="width:7"],[style*="width: 7"],
    [style*="width:5"],[style*="width: 5"]{max-width:100% !important;}
    a{color:#1d4ed8;word-break:break-all;}
    pre{white-space:pre-wrap;word-break:break-word;}
  `;

  const srcDoc = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base target="_blank">
<style>${responsiveCss}</style>
</head><body>${html}</body></html>`;

  return (
    <iframe
      ref={ref}
      onLoad={handleLoad}
      sandbox="allow-same-origin allow-popups"
      srcDoc={srcDoc}
      title="E-Mail-Inhalt"
      className="w-full rounded-lg border border-[var(--border)] bg-white"
      style={{ height }}
    />
  );
}
