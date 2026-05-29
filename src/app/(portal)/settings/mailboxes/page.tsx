import { getCurrentUser } from "@/services/auth/current-user";
import { can } from "@/lib/auth/permissions";
import {
  listMailboxes,
  listAssignableProfiles,
  listMailboxLocations,
} from "@/services/admin/mailboxes";
import { MailboxAdmin } from "./mailbox-admin";

/**
 * Postfach-Verwaltung. Nur mit mailboxes.manage. Hier werden Funktions-/
 * Team-Postfächer angelegt und Mitarbeiter explizit zugewiesen – die
 * Zuweisung steuert, wer die Tickets eines Postfachs sieht.
 */
export default async function MailboxesPage() {
  const ctx = await getCurrentUser();

  if (!ctx || !can(ctx, "mailboxes.manage")) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Du hast keine Berechtigung, Postfächer zu verwalten.
      </p>
    );
  }

  const [mailboxes, profiles, locations] = await Promise.all([
    listMailboxes(),
    listAssignableProfiles(),
    listMailboxLocations(),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Postfächer</h2>
        <p className="text-sm text-[var(--muted)]">
          Funktions-/Team-Postfächer anlegen und Mitarbeiter zuweisen.
        </p>
      </div>
      <MailboxAdmin
        mailboxes={mailboxes}
        profiles={profiles}
        locations={locations}
      />
    </div>
  );
}
