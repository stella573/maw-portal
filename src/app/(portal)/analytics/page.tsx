import { PageHeader } from "@/components/layout/page-header";
import { getCurrentUser } from "@/services/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { getAnalytics } from "@/services/admin/analytics";
import { AnalyticsView } from "./analytics-view";

/**
 * Analytics – Live-Kennzahlen aus ROLLER über beide Standorte (Umsatz,
 * Buchungen, Besucher) mit Tageskurven. Nur mit analytics.read.
 *
 * ROLLER-Aufrufe brauchen etwas Zeit → keine statische Vorberechnung.
 */
export const dynamic = "force-dynamic";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const ctx = await getCurrentUser();
  if (!ctx || !can(ctx, "analytics.read")) {
    return (
      <div>
        <PageHeader title="Analytics" description="Live-Kennzahlen aus ROLLER." />
        <p className="text-sm text-[var(--muted)]">
          Du hast keine Berechtigung, Analytics zu sehen.
        </p>
      </div>
    );
  }

  const sp = await searchParams;
  const range = [7, 14, 30].includes(Number(sp.range)) ? Number(sp.range) : 14;

  let data;
  let error: string | null = null;
  try {
    data = await getAnalytics(range);
  } catch (err) {
    error = err instanceof Error ? err.message : "Daten konnten nicht geladen werden.";
  }

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Wie läuft's? Umsatz, Buchungen & Besucher – live aus ROLLER, über beide Standorte."
      />
      {data ? (
        <AnalyticsView data={data} range={range} />
      ) : (
        <p className="text-sm text-red-500">{error}</p>
      )}
    </div>
  );
}
