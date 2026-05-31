"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, Inbox as InboxIcon, Check, RotateCcw, Eye, PenLine, Loader2 } from "lucide-react";
import { createTicket, setTicketStatus, type ActionResult } from "./actions";
import type {
  InboxMailbox,
  InboxTicket,
} from "@/modules/maildesk/services/tickets";
import {
  TICKET_STATUS_LABELS,
  TICKET_PRIORITY_LABELS,
} from "@/modules/maildesk/types";
import {
  useMaildeskPresence,
  useRealtimeRefresh,
  type PresencePeer,
} from "@/modules/maildesk/realtime";
import type { TicketStatus, TicketPriority } from "@/types/database";

export type InboxView = "active" | "resolved" | "all";

const VIEW_LABELS: Record<InboxView, string> = {
  active: "Aktiv",
  resolved: "Erledigt",
  all: "Alle",
};

const STATUS_STYLES: Record<TicketStatus, string> = {
  open: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  pending: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  resolved: "bg-slate-500/15 text-slate-500 dark:text-slate-400",
};

const PRIORITY_STYLES: Record<TicketPriority, string> = {
  low: "text-slate-400",
  normal: "text-slate-500 dark:text-slate-400",
  high: "text-amber-600 dark:text-amber-400",
  urgent: "text-red-500",
};

interface Props {
  mailboxes: InboxMailbox[];
  tickets: InboxTicket[];
  mailboxId?: string;
  view: InboxView;
  priority?: TicketPriority;
  search?: string;
  canCreate: boolean;
  currentUser: { profileId: string; name: string } | null;
}

export function Inbox({
  mailboxes,
  tickets,
  mailboxId,
  view,
  priority,
  search,
  canCreate,
  currentUser,
}: Props) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  // Navigation (Tab-/Filter-/Postfachwechsel) als Transition: die aktuelle
  // Liste bleibt sichtbar, während die neuen Daten laden → kein „Hängen".
  const [isPending, startTransition] = useTransition();

  // Live: Ticket-Änderungen (Status, Zuweisung, neue Vorgänge) sofort spiegeln.
  // RLS filtert serverseitig – wir laden bei einem Event einfach neu.
  useRealtimeRefresh([{ table: "tickets" }]);

  // Presence: wer ist gerade wo? (für „bereits in Bearbeitung"-Hinweis)
  const { peers } = useMaildeskPresence(
    currentUser ?? { profileId: "anon", name: "—" },
    null,
  );
  const peersByTicket = useMemo(() => {
    const map = new Map<string, PresencePeer[]>();
    for (const p of peers) {
      if (!p.ticketId) continue;
      const list = map.get(p.ticketId) ?? [];
      list.push(p);
      map.set(p.ticketId, list);
    }
    return map;
  }, [peers]);

  // Filter über URL-Query steuern (server-seitiges Neuladen).
  function updateQuery(patch: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      mailbox: mailboxId,
      view,
      priority,
      q: search,
      ...patch,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v) params.set(k, v);
    }
    startTransition(() => {
      router.push(`/maildesk?${params.toString()}`);
    });
  }

  if (mailboxes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-10 text-center">
        <InboxIcon className="mx-auto h-8 w-8 text-[var(--muted)]" />
        <p className="mt-3 text-sm text-[var(--muted)]">
          Dir ist noch kein Postfach zugewiesen. Ein Owner/Admin legt unter
          <strong> Postfächer</strong> ein Postfach an und weist dich als
          Mitglied zu.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Postfach-Umschalter */}
      <div className="flex flex-wrap gap-2">
        {mailboxes.map((mb) => {
          const active = mailboxId === mb.id;
          return (
            <button
              key={mb.id}
              onClick={() => updateQuery({ mailbox: mb.id })}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition ${
                active
                  ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-700/15 dark:text-brand-100"
                  : "border-[var(--border)] hover:bg-[var(--background)]"
              }`}
            >
              <InboxIcon className="h-4 w-4" />
              {mb.name}
              {mb.openCount > 0 && (
                <span className="rounded-full bg-[var(--background)] px-1.5 text-xs">
                  {mb.openCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Status-Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-[var(--border)] p-0.5">
          {(Object.keys(VIEW_LABELS) as InboxView[]).map((v) => (
            <button
              key={v}
              onClick={() => updateQuery({ view: v })}
              className={`rounded-md px-3 py-1.5 text-sm transition ${
                view === v
                  ? "bg-brand-600 text-white"
                  : "text-[var(--muted)] hover:bg-[var(--background)]"
              }`}
            >
              {VIEW_LABELS[v]}
            </button>
          ))}
        </div>
        {isPending && (
          <Loader2 className="h-4 w-4 animate-spin text-[var(--muted)]" aria-label="Lädt" />
        )}
      </div>

      {/* Filterleiste */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
          <input
            defaultValue={search ?? ""}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                updateQuery({ q: (e.target as HTMLInputElement).value || undefined });
              }
            }}
            placeholder="Betreff suchen… (Enter)"
            className="w-full rounded-lg border border-[var(--border)] bg-transparent py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500"
          />
        </div>
        <select
          value={priority ?? ""}
          onChange={(e) => updateQuery({ priority: e.target.value || undefined })}
          className="rounded-lg border border-[var(--border)] bg-transparent px-2 py-2 text-sm outline-none focus:border-brand-500"
        >
          <option value="">Alle Prioritäten</option>
          {(Object.keys(TICKET_PRIORITY_LABELS) as TicketPriority[]).map((p) => (
            <option key={p} value={p}>
              {TICKET_PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
        {canCreate && (
          <button
            onClick={() => setShowCreate((s) => !s)}
            className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> Ticket
          </button>
        )}
      </div>

      {showCreate && canCreate && (
        <CreateTicketForm
          mailboxId={mailboxId ?? mailboxes[0]?.id ?? ""}
          onDone={() => setShowCreate(false)}
        />
      )}

      {/* Ticketliste – bleibt während des Wechsels sichtbar (nur gedimmt) */}
      <div className={isPending ? "pointer-events-none opacity-50 transition-opacity" : "transition-opacity"}>
        <TicketList tickets={tickets} peersByTicket={peersByTicket} />
      </div>
    </div>
  );
}

function TicketList({
  tickets,
  peersByTicket,
}: {
  tickets: InboxTicket[];
  peersByTicket: Map<string, PresencePeer[]>;
}) {
  if (tickets.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-10 text-center text-sm text-[var(--muted)]">
        Keine Tickets in diesem Postfach (mit den aktuellen Filtern).
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <ul className="divide-y divide-[var(--border)]">
        {tickets.map((t) => (
          <TicketRow
            key={t.id}
            ticket={t}
            peers={peersByTicket.get(t.id) ?? []}
          />
        ))}
      </ul>
    </div>
  );
}

function TicketRow({
  ticket: t,
  peers,
}: {
  ticket: InboxTicket;
  peers: PresencePeer[];
}) {
  const [pending, startTransition] = useTransition();
  const typing = peers.some((p) => p.typing);

  function quickStatus(status: TicketStatus) {
    startTransition(async () => {
      await setTicketStatus(t.id, status);
    });
  }

  return (
    <li className="group relative flex items-stretch">
      <Link
        href={`/maildesk/${t.id}`}
        className={`flex min-w-0 flex-1 items-start gap-3 px-4 py-3 transition hover:bg-[var(--background)] ${
          t.needsReply ? "bg-brand-50/40 dark:bg-brand-700/10" : ""
        } ${pending ? "opacity-50" : ""}`}
      >
        {/* Unbeantwortet-Punkt */}
        <span className="mt-1.5 shrink-0">
          {t.needsReply ? (
            <span
              className="block h-2 w-2 rounded-full bg-brand-600"
              aria-label="Unbeantwortet"
              title="Unbeantwortet"
            />
          ) : (
            <span className="block h-2 w-2" />
          )}
        </span>
        <span
          className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[t.status]}`}
        >
          {TICKET_STATUS_LABELS[t.status]}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`truncate ${t.needsReply ? "font-semibold" : "font-medium"}`}
            >
              {t.subject}
            </span>
            <span className={`shrink-0 text-xs ${PRIORITY_STYLES[t.priority]}`}>
              ● {TICKET_PRIORITY_LABELS[t.priority]}
            </span>
          </div>
          {t.preview && (
            <div className="truncate text-xs text-[var(--foreground)]/70">
              {t.preview}
            </div>
          )}
          <div className="flex items-center gap-2 truncate text-xs text-[var(--muted)]">
            <span className="truncate">
              {t.reference}
              {t.customerName || t.customerEmail
                ? ` · ${t.customerName ?? t.customerEmail}`
                : ""}
            </span>
            {/* Presence: wer ist gerade in diesem Ticket? */}
            {peers.length > 0 && (
              <span
                className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${
                  typing
                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    : "bg-brand-500/15 text-brand-600 dark:text-brand-300"
                }`}
                title={peers.map((p) => p.name).join(", ")}
              >
                {typing ? (
                  <PenLine className="h-3 w-3" />
                ) : (
                  <Eye className="h-3 w-3" />
                )}
                {typing
                  ? `${peers.find((p) => p.typing)?.name ?? "Jemand"} tippt…`
                  : peers.length === 1
                    ? `${peers[0]?.name} ist hier`
                    : `${peers.length} Bearbeiter`}
              </span>
            )}
          </div>
        </div>
        <span className="hidden shrink-0 text-xs text-[var(--muted)] sm:block">
          {formatDate(t.lastMessageAt ?? t.createdAt)}
        </span>
      </Link>

      {/* Schnellaktion: erledigen / wieder öffnen */}
      <div className="flex shrink-0 items-center pr-3">
        {t.status === "resolved" ? (
          <button
            type="button"
            onClick={() => quickStatus("open")}
            disabled={pending}
            title="Wieder öffnen"
            className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--muted)] opacity-0 transition hover:bg-[var(--background)] hover:text-[var(--foreground)] focus:opacity-100 group-hover:opacity-100 disabled:opacity-60"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Öffnen
          </button>
        ) : (
          <button
            type="button"
            onClick={() => quickStatus("resolved")}
            disabled={pending}
            title="Als erledigt markieren"
            className="flex items-center gap-1 rounded-lg border border-emerald-500/40 px-2.5 py-1.5 text-xs text-emerald-600 opacity-0 transition hover:bg-emerald-500/10 focus:opacity-100 group-hover:opacity-100 disabled:opacity-60 dark:text-emerald-400"
          >
            <Check className="h-3.5 w-3.5" /> Erledigt
          </button>
        )}
      </div>
    </li>
  );
}

function CreateTicketForm({
  mailboxId,
  onDone,
}: {
  mailboxId: string;
  onDone: () => void;
}) {
  const [result, action, pending] = useActionState(
    async (prev: ActionResult | null, fd: FormData) => {
      const r = await createTicket(prev, fd);
      if (r.ok) onDone();
      return r;
    },
    null,
  );

  return (
    <form
      action={action}
      className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-2"
    >
      <input type="hidden" name="mailboxId" value={mailboxId} />
      <div className="sm:col-span-2">
        <label className="block text-xs font-medium text-[var(--muted)]">Betreff</label>
        <input
          name="subject"
          required
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand-500"
          placeholder="Worum geht es?"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-[var(--muted)]">
          Kunde (E-Mail, optional)
        </label>
        <input
          name="customerEmail"
          type="email"
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand-500"
          placeholder="kunde@example.com"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-[var(--muted)]">Priorität</label>
        <select
          name="priority"
          defaultValue="normal"
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-2 py-2 text-sm outline-none focus:border-brand-500"
        >
          {(Object.keys(TICKET_PRIORITY_LABELS) as TicketPriority[]).map((p) => (
            <option key={p} value={p}>
              {TICKET_PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="block text-xs font-medium text-[var(--muted)]">
          Erste Nachricht (optional)
        </label>
        <textarea
          name="body"
          rows={3}
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand-500"
          placeholder="Inhalt der Anfrage…"
        />
      </div>
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Lege an…" : "Ticket anlegen"}
        </button>
        {result && !result.ok && (
          <p className="mt-2 text-sm text-red-500">{result.message}</p>
        )}
      </div>
    </form>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
