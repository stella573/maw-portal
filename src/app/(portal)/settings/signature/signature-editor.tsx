"use client";

import { useActionState, useState } from "react";
import { updateSignature, type ActionResult } from "./actions";

/**
 * Editor für die persönliche HTML-Signatur: Textarea + Live-Vorschau im
 * dunklen MAW-Template-Kontext (gesandboxter iframe, keine Scripts).
 */
export function SignatureEditor({
  initialValue,
  defaultTemplate,
}: {
  initialValue: string;
  defaultTemplate: string;
}) {
  const [value, setValue] = useState(initialValue);
  const [result, action, pending] = useActionState(
    async (_prev: ActionResult | null, fd: FormData) => updateSignature(_prev, fd),
    null,
  );

  return (
    <form action={action} className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Signatur (HTML)</label>
          <button
            type="button"
            onClick={() => setValue(defaultTemplate)}
            className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs transition hover:bg-[var(--background)]"
          >
            Vorlage einfügen
          </button>
        </div>
        {/* name muss gesetzt sein, damit der Wert im FormData landet */}
        <textarea
          name="signatureHtml"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={20}
          spellCheck={false}
          placeholder="Mit freundlichen Grüßen …"
          className="w-full resize-y rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 font-mono text-xs outline-none focus:border-brand-500"
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {pending ? "Speichere…" : "Signatur speichern"}
          </button>
          {result && (
            <span
              className={`text-sm ${result.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}
            >
              {result.message}
            </span>
          )}
        </div>
        <p className="text-xs text-[var(--muted)]">
          Tipp: Das Bild über die öffentliche Storage-URL einbinden. Leeres Feld
          speichern entfernt die Signatur.
        </p>
      </div>

      <div className="space-y-2">
        <span className="text-sm font-medium">Vorschau</span>
        <SignaturePreview html={value} />
      </div>
    </form>
  );
}

/**
 * Rendert die Signatur so, wie sie im Mailtext erscheint: heller Nachrichtentext
 * auf dunklem Karten-Hintergrund (entspricht dem MAW-Template). Scripts werden
 * im Sandbox-iframe nicht ausgeführt.
 */
function SignaturePreview({ html }: { html: string }) {
  const srcDoc = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base target="_blank">
<style>
  html,body{margin:0;padding:24px;background:#111827;color:#E5E7EB;
    font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:24px;
    word-break:break-word;}
  img{max-width:100%;height:auto;}
  a{color:#E8920B;}
</style>
</head><body>${html}</body></html>`;

  return (
    <iframe
      sandbox="allow-popups"
      srcDoc={srcDoc}
      title="Signatur-Vorschau"
      className="h-[480px] w-full rounded-lg border border-[var(--border)]"
    />
  );
}
