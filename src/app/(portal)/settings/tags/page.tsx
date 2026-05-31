import { getCurrentUser } from "@/services/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { listManagedTags } from "@/services/admin/tags";
import { TagsAdmin } from "./tags-admin";

/**
 * Tag-Katalog verwalten (nur mit tags.manage). Tags kategorisieren Tickets;
 * angewendet werden sie in der Ticket-Ansicht von den Postfach-Bearbeitern.
 */
export default async function TagsPage() {
  const ctx = await getCurrentUser();
  if (!ctx || !can(ctx, "tags.manage")) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Du hast keine Berechtigung, Tags zu verwalten.
      </p>
    );
  }

  const tags = await listManagedTags();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Tags / Kategorien</h2>
        <p className="text-sm text-[var(--muted)]">
          Schlagworte zum Kategorisieren von Tickets (z. B. Buchung, Beschwerde,
          Gutschein). In der Ticket-Ansicht zuweisbar.
        </p>
      </div>
      <TagsAdmin tags={tags} />
    </div>
  );
}
