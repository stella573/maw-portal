import { getCurrentUser } from "@/services/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { listManagedTemplates } from "@/services/admin/templates";
import { TemplatesAdmin } from "./templates-admin";

/**
 * Antwortvorlagen verwalten (nur mit templates.manage). Verwendet werden sie
 * von allen Bearbeitern im Antwort-Editor („Vorlage einfügen").
 */
export default async function TemplatesPage() {
  const ctx = await getCurrentUser();
  if (!ctx || !can(ctx, "templates.manage")) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Du hast keine Berechtigung, Antwortvorlagen zu verwalten.
      </p>
    );
  }

  const templates = await listManagedTemplates();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Antwortvorlagen</h2>
        <p className="text-sm text-[var(--muted)]">
          Textbausteine für wiederkehrende Antworten (z. B. Buchungsbestätigung,
          Preisauskunft). Im Antwort-Editor per „Vorlage“ einfügbar.
        </p>
      </div>
      <TemplatesAdmin templates={templates} />
    </div>
  );
}
