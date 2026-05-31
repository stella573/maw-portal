"use client";

import { useActionState, useState } from "react";
import { FileText, Trash2 } from "lucide-react";
import { createTemplate, updateTemplate, deleteTemplate, type ActionResult } from "./actions";
import type { ManagedTemplate } from "@/services/admin/templates";

function Feedback({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return (
    <p className={`mt-2 text-sm ${result.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
      {result.message}
    </p>
  );
}

export function TemplatesAdmin({ templates }: { templates: ManagedTemplate[] }) {
  const [showCreate, setShowCreate] = useState(false);
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <FileText className="h-4 w-4" /> Neue Vorlage
          </h3>
          <button
            onClick={() => setShowCreate((s) => !s)}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm transition hover:bg-[var(--background)]"
          >
            {showCreate ? "Abbrechen" : "Neu"}
          </button>
        </div>
        {showCreate && <CreateForm onDone={() => setShowCreate(false)} />}
      </div>

      <div className="space-y-3">
        {templates.length === 0 && (
          <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-10 text-center text-sm text-[var(--muted)]">
            Noch keine Vorlagen. Lege oben die erste an.
          </div>
        )}
        {templates.map((t) => (
          <TemplateRow key={t.id} template={t} />
        ))}
      </div>
    </div>
  );
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const [result, action, pending] = useActionState(
    async (prev: ActionResult | null, fd: FormData) => {
      const r = await createTemplate(prev, fd);
      if (r.ok) onDone();
      return r;
    },
    null,
  );
  return (
    <form action={action} className="mt-4 space-y-3">
      <div>
        <label className="block text-xs font-medium text-[var(--muted)]">Name</label>
        <input
          name="name"
          required
          maxLength={80}
          placeholder="z. B. Buchungsbestätigung"
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-[var(--muted)]">Inhalt</label>
        <textarea
          name="body"
          required
          rows={6}
          placeholder="Sehr geehrte/r …"
          className="mt-1 w-full resize-y rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Lege an…" : "Vorlage anlegen"}
      </button>
      <Feedback result={result} />
    </form>
  );
}

function TemplateRow({ template }: { template: ManagedTemplate }) {
  const [result, action, pending] = useActionState(updateTemplate, null);
  const [, delAction, delPending] = useActionState(deleteTemplate, null);
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 font-medium">
          <FileText className="h-4 w-4 text-[var(--muted)]" />
          {template.name}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOpen((o) => !o)}
            className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs transition hover:bg-[var(--background)]"
          >
            {open ? "Schließen" : "Bearbeiten"}
          </button>
          <form action={delAction}>
            <input type="hidden" name="templateId" value={template.id} />
            <button
              type="submit"
              disabled={delPending}
              title="Vorlage löschen"
              className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-red-500 transition hover:bg-red-500/10 disabled:opacity-60"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      </div>

      {!open && (
        <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm text-[var(--muted)]">
          {template.body}
        </p>
      )}

      {open && (
        <form action={action} className="mt-3 space-y-3">
          <input type="hidden" name="templateId" value={template.id} />
          <div>
            <label className="block text-xs font-medium text-[var(--muted)]">Name</label>
            <input
              name="name"
              defaultValue={template.name}
              required
              maxLength={80}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--muted)]">Inhalt</label>
            <textarea
              name="body"
              defaultValue={template.body}
              required
              rows={6}
              className="mt-1 w-full resize-y rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {pending ? "Speichere…" : "Speichern"}
          </button>
          <Feedback result={result} />
        </form>
      )}
    </div>
  );
}
