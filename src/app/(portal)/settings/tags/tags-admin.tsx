"use client";

import { useActionState, useState } from "react";
import { Tag as TagIcon, Trash2 } from "lucide-react";
import { createTag, updateTag, deleteTag, type ActionResult } from "./actions";
import type { ManagedTag } from "@/services/admin/tags";

const PRESET_COLORS = [
  "#E8920B", "#16a34a", "#0ea5e9", "#6366f1",
  "#db2777", "#dc2626", "#64748b", "#a16207",
];

function Feedback({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return (
    <p className={`mt-2 text-sm ${result.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
      {result.message}
    </p>
  );
}

export function TagsAdmin({ tags }: { tags: ManagedTag[] }) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <TagIcon className="h-4 w-4" /> Neuer Tag
        </h3>
        <CreateForm />
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="border-b border-[var(--border)] px-5 py-3 text-sm font-medium">
          Tags ({tags.length})
        </div>
        <ul className="divide-y divide-[var(--border)]">
          {tags.length === 0 && (
            <li className="px-5 py-6 text-sm text-[var(--muted)]">
              Noch keine Tags angelegt.
            </li>
          )}
          {tags.map((t) => (
            <TagRow key={t.id} tag={t} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={`Farbe ${c}`}
          className={`h-6 w-6 rounded-full border-2 transition ${value.toLowerCase() === c.toLowerCase() ? "border-[var(--foreground)]" : "border-transparent"}`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

function CreateForm() {
  const [result, action, pending] = useActionState(createTag, null);
  const [color, setColor] = useState(PRESET_COLORS[0]!);
  return (
    <form action={action} className="mt-4 flex flex-wrap items-end gap-3">
      <input type="hidden" name="color" value={color} />
      <div className="min-w-[12rem] flex-1">
        <label className="block text-xs font-medium text-[var(--muted)]">Name</label>
        <input
          name="name"
          required
          maxLength={40}
          placeholder="z. B. Buchung"
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-[var(--muted)]">Farbe</label>
        <div className="mt-1">
          <ColorPicker value={color} onChange={setColor} />
        </div>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Lege an…" : "Tag anlegen"}
      </button>
      <div className="w-full"><Feedback result={result} /></div>
    </form>
  );
}

function TagRow({ tag }: { tag: ManagedTag }) {
  const [result, action, pending] = useActionState(updateTag, null);
  const [, delAction, delPending] = useActionState(deleteTag, null);
  const [color, setColor] = useState(tag.color);

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs"
          style={{ backgroundColor: `${tag.color}22`, color: tag.color }}
        >
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} />
          {tag.name}
        </span>
        <span className="text-xs text-[var(--muted)]">{tag.ticketCount} Ticket(s)</span>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <form action={action} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="tagId" value={tag.id} />
          <input type="hidden" name="color" value={color} />
          <div>
            <label className="block text-xs text-[var(--muted)]">Name</label>
            <input
              name="name"
              defaultValue={tag.name}
              required
              maxLength={40}
              className="mt-1 rounded-lg border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm outline-none focus:border-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--muted)]">Farbe</label>
            <div className="mt-1"><ColorPicker value={color} onChange={setColor} /></div>
          </div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm transition hover:bg-[var(--background)] disabled:opacity-60"
          >
            {pending ? "…" : "Speichern"}
          </button>
          <Feedback result={result} />
        </form>

        <form action={delAction} className="ml-auto">
          <input type="hidden" name="tagId" value={tag.id} />
          <button
            type="submit"
            disabled={delPending}
            title="Tag löschen"
            className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-sm text-red-500 transition hover:bg-red-500/10 disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" /> Löschen
          </button>
        </form>
      </div>
    </li>
  );
}
