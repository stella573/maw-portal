"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, Inbox as InboxIcon } from "lucide-react";
import { createTicket, type ActionResult } from "./actions";
import type {
  InboxMailbox,
  InboxTicket,
  TicketFilters,
} from "@/modules/maildesk/services/tickets";
import {
  TICKET_STATUS_LABELS,
  TICKET_PRIORITY_LABELS,
} from "@/modules/maildesk/types";
import type { TicketStatus, TicketPriority } from "@/types/database";

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
  filters: TicketFilters;
  canCreate: boolean;
}

export function Inbox({ mailboxes, tickets, filters, canCreate }: Props) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);

  // Filter über URL-Query steuern (server-seitiges Neuladen).
  function updateQuery(patch: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const merged = {
      mailbox: filters.mailboxId,
      status: filters.status,
      priority: filters.priority,
      q: filters.search,
      ...patch,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v) params.set(k, v);
    }
    router.push(`/maildesk?${params.toString()}`);
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
          const active = filters.mailboxId === mb.id;
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

      {/* Filterleiste */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
          <input
            defaultValue={filters.search ?? ""}
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
          value={filters.status ?? ""}
          onChange={(e) => updateQuery({ status: e.target.value || undefined })}
          className="rounded-lg border border-[var(--border)] bg-transparent px-2 py-2 text-sm outline-none focus:border-brand-500"
        >
          <option value="">Alle Status</option>
          {(Object.keys(TICKET_STATUS_LABELS) as TicketStatus[]).map((s) => (
            <option key={s} value={s}>
              {TICKET_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          value={filters.priority ?? ""}
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
          mailboxId={filters.mailboxId ?? mailboxes[0]?.id ?? ""}
          onDone={() => setShowCreate(false)}
        />
      )}

      {/* Ticketliste */}
      <TicketList tickets={tickets} />
    </div>
  );
}

function TicketList({ tickets }: { tickets: InboxTicket[] }) {
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
          <li key={t.id}>
            <Link
              href={`/maildesk/${t.id}`}
              className="flex items-center gap-3 px-4 py-3 transition hover:bg-[var(--background)]"
            >
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[t.status]}`}
              >
                {TICKET_STATUS_LABELS[t.status]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{t.subject}</span>
                  <span className={`shrink-0 text-xs ${PRIORITY_STYLES[t.priority]}`}>
                    ● {TICKET_PRIORITY_LABELS[t.priority]}
                  </span>
                </div>
                <div className="truncate text-xs text-[var(--muted)]">
                  {t.reference}
                  {t.customerName || t.customerEmail
                    ? ` · ${t.customerName ?? t.customerEmail}`
                    : ""}
                </div>
              </div>
              <span className="hidden shrink-0 text-xs text-[var(--muted)] sm:block">
                {formatDate(t.lastMessageAt ?? t.createdAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
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
