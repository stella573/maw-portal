import { PageHeader } from "./page-header";

/** Einheitlicher Platzhalter für in Vorbereitung befindliche Module. */
export function ComingSoon({ title }: { title: string }) {
  return (
    <div>
      <PageHeader title={title} description="Dieses Modul ist in Vorbereitung." />
      <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-10 text-center text-sm text-[var(--muted)]">
        {title} wird in einer späteren Phase umgesetzt (siehe Roadmap).
      </div>
    </div>
  );
}
