"use client";

import { useActionState, useState } from "react";
import { Inbox, Plus, Trash2, UserPlus, Mail } from "lucide-react";
import {
  createMailbox,
  setMailboxActive,
  addMember,
  removeMember,
  type ActionResult,
} from "./actions";
import type {
  ManagedMailbox,
  AssignableProfile,
  MailboxLocationOption,
} from "@/services/admin/mailboxes";

interface Props {
  mailboxes: ManagedMailbox[];
  profiles: AssignableProfile[];
  locations: MailboxLocationOption[];
}

function Feedback({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return (
    <p
      className={`mt-2 text-sm ${result.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}
    >
      {result.message}
    </p>
  );
}

export function MailboxAdmin({ mailboxes, profiles, locations }: Props) {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <Plus className="h-4 w-4" /> Postfach anlegen
          </h2>
          <button
            onClick={() => setShowCreate((s) => !s)}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm transition hover:bg-[var(--background)]"
          >
            {showCreate ? "Abbrechen" : "Neu"}
          </button>
        </div>
        {showCreate && <CreateForm locations={locations} />}
      </div>

      <div className="space-y-4">
        {mailboxes.length === 0 && (
          <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-10 text-center text-sm text-[var(--muted)]">
            Noch keine Postfächer. Lege oben das erste an (z.&nbsp;B. „Support“
            mit support@…).
          </div>
        )}
        {mailboxes.map((mb) => (
          <MailboxCard key={mb.id} mailbox={mb} profiles={profiles} />
        ))}
      </div>
    </div>
  );
}

function CreateForm({ locations }: { locations: MailboxLocationOption[] }) {
  const [result, action, pending] = useActionState(createMailbox, null);
  return (
    <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
      <div>
        <label className="block text-xs font-medium text-[var(--muted)]">Anzeigename</label>
        <input
          name="name"
          required
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand-500"
          placeholder="Support"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-[var(--muted)]">E-Mail-Adresse</label>
        <input
          name="email"
          type="email"
          required
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand-500"
          placeholder="support@miningadventureworld.de"
        />
      </div>
      <div className="sm:col-span-2">
        <label className="block text-xs font-medium text-[var(--muted)]">
          Standort (optional)
        </label>
        <select
          name="locationId"
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-2 py-2 text-sm outline-none focus:border-brand-500 sm:w-1/2"
        >
          <option value="">— kein Standort —</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Lege an…" : "Postfach anlegen"}
        </button>
        <Feedback result={result} />
      </div>
    </form>
  );
}

function MailboxCard({
  mailbox,
  profiles,
}: {
  mailbox: ManagedMailbox;
  profiles: AssignableProfile[];
}) {
  const [addResult, addAction, addPending] = useActionState(addMember, null);
  const [activeResult, activeAction] = useActionState(setMailboxActive, null);
  const [showAdd, setShowAdd] = useState(false);

  // Nur Profile anbieten, die noch nicht Mitglied sind.
  const memberIds = new Set(mailbox.members.map((m) => m.profileId));
  const available = profiles.filter((p) => !memberIds.has(p.id));

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Inbox className="h-4 w-4 text-[var(--muted)]" />
            <span className="font-medium">{mailbox.name}</span>
            {!mailbox.isActive && (
              <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase text-red-500">
                inaktiv
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-sm text-[var(--muted)]">
            <Mail className="h-3.5 w-3.5" />
            {mailbox.email}
            {mailbox.locationName ? ` · ${mailbox.locationName}` : ""}
          </div>
          <div className="mt-1 text-xs text-[var(--muted)]">
            {mailbox.ticketCount} Ticket(s) · {mailbox.members.length} Mitglied(er)
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAdd((s) => !s)}
            className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs transition hover:bg-[var(--background)]"
          >
            <UserPlus className="h-3.5 w-3.5" /> Mitglied
          </button>
          <form action={activeAction}>
            <input type="hidden" name="mailboxId" value={mailbox.id} />
            <input type="hidden" name="active" value={(!mailbox.isActive).toString()} />
            <button
              type="submit"
              className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs transition hover:bg-[var(--background)]"
            >
              {mailbox.isActive ? "Deaktivieren" : "Aktivieren"}
            </button>
          </form>
        </div>
      </div>

      {/* Mitgliederliste */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {mailbox.members.length === 0 && (
          <span className="text-xs text-[var(--muted)]">
            Keine Mitglieder – nur Owner/Admin sehen dieses Postfach.
          </span>
        )}
        {mailbox.members.map((m) => (
          <span
            key={m.profileId}
            className="inline-flex items-center gap-1 rounded-full bg-[var(--background)] px-2 py-0.5 text-xs"
          >
            {m.fullName ?? m.email}
            <RemoveMemberButton mailboxId={mailbox.id} profileId={m.profileId} />
          </span>
        ))}
      </div>

      {showAdd && (
        <form
          action={addAction}
          className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-[var(--background)] p-3"
        >
          <input type="hidden" name="mailboxId" value={mailbox.id} />
          <div className="min-w-[12rem] flex-1">
            <label className="block text-xs text-[var(--muted)]">Mitarbeiter</label>
            <select
              name="profileId"
              required
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm"
            >
              {available.length === 0 && <option value="">— alle bereits Mitglied —</option>}
              {available.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName ? `${p.fullName} (${p.email})` : p.email}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={addPending || available.length === 0}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            Hinzufügen
          </button>
          <Feedback result={addResult} />
        </form>
      )}

      <Feedback result={activeResult} />
    </div>
  );
}

function RemoveMemberButton({
  mailboxId,
  profileId,
}: {
  mailboxId: string;
  profileId: string;
}) {
  const [, action, pending] = useActionState(removeMember, null);
  return (
    <form action={action} className="inline">
      <input type="hidden" name="mailboxId" value={mailboxId} />
      <input type="hidden" name="profileId" value={profileId} />
      <button
        type="submit"
        disabled={pending}
        aria-label="Mitglied entfernen"
        title="Mitglied entfernen"
        className="text-[var(--muted)] transition hover:text-red-500"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </form>
  );
}
