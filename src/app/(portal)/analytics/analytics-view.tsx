"use client";

import { useRouter } from "next/navigation";
import { TrendingUp, CalendarCheck, Users, Euro, AlertCircle } from "lucide-react";
import { LineChart, BarChart } from "./charts";
import type { AnalyticsResult } from "@/services/admin/analytics";

const RANGES = [
  { days: 7, label: "7 Tage" },
  { days: 14, label: "14 Tage" },
  { days: 30, label: "30 Tage" },
];

const LOC_COLORS = ["#E8920B", "#3b82f6", "#16a34a", "#db2777"];

export function AnalyticsView({
  data,
  range,
}: {
  data: AnalyticsResult;
  range: number;
}) {
  const router = useRouter();
  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: data.currency || "EUR",
      maximumFractionDigits: 0,
    }).format(n);
  const fmtMoneyFull = (n: number) =>
    new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: data.currency || "EUR",
    }).format(n);

  const revenueSeries = data.totals.series.map((p) => ({ date: p.date, value: p.revenue }));
  const bookingsSeries = data.totals.series.map((p) => ({ date: p.date, value: p.bookings }));
  const visitorsSeries = data.totals.series.map((p) => ({ date: p.date, value: p.visitors }));

  return (
    <div className="space-y-6">
      {/* Zeitraum-Umschalter */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-[var(--muted)]">
          Zeitraum: {data.from} – {data.to}
        </span>
        <div className="inline-flex rounded-lg border border-[var(--border)] p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => router.push(`/analytics?range=${r.days}` as never)}
              className={`rounded-md px-3 py-1.5 text-sm transition ${
                range === r.days
                  ? "bg-brand-600 text-white"
                  : "text-[var(--muted)] hover:bg-[var(--background)]"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI-Karten: Heute */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi
          icon={<Euro className="h-5 w-5" />}
          label="Umsatz heute"
          value={fmtMoneyFull(data.totals.revenueToday)}
          sub={`${fmtMoney(data.totals.revenue)} im Zeitraum`}
          accent="text-emerald-600 dark:text-emerald-400"
        />
        <Kpi
          icon={<CalendarCheck className="h-5 w-5" />}
          label="Buchungen heute"
          value={String(data.totals.bookingsToday)}
          sub={`${data.totals.bookings} im Zeitraum`}
          accent="text-blue-600 dark:text-blue-400"
        />
        <Kpi
          icon={<Users className="h-5 w-5" />}
          label="Besucher heute"
          value={String(data.totals.visitorsToday)}
          sub={`${data.totals.visitors} im Zeitraum`}
          accent="text-brand-600 dark:text-brand-300"
        />
      </div>

      {/* Umsatzkurve */}
      <ChartCard title="Umsatzverlauf" icon={<TrendingUp className="h-4 w-4" />}>
        <LineChart points={revenueSeries} color="#E8920B" format={fmtMoney} />
      </ChartCard>

      {/* Buchungen + Besucher */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Buchungen je Tag" icon={<CalendarCheck className="h-4 w-4" />}>
          <BarChart points={bookingsSeries} color="#3b82f6" />
        </ChartCard>
        <ChartCard title="Besucher je Tag" icon={<Users className="h-4 w-4" />}>
          <BarChart points={visitorsSeries} color="#16a34a" />
        </ChartCard>
      </div>

      {/* Standort-Vergleich */}
      <div>
        <h2 className="mb-3 text-sm font-medium text-[var(--muted)]">Nach Standort</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {data.locations.map((loc, i) => (
            <div
              key={loc.locationId}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"
            >
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-semibold">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: LOC_COLORS[i % LOC_COLORS.length] }}
                  />
                  {loc.locationName}
                </h3>
                {!loc.connected || loc.error ? (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {loc.connected ? "Fehler" : "Nicht angebunden"}
                  </span>
                ) : (
                  <span className="text-xs text-[var(--muted)]">ROLLER verbunden</span>
                )}
              </div>

              {loc.connected && !loc.error ? (
                <>
                  <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                    <Mini label="Umsatz heute" value={fmtMoney(loc.revenueToday)} />
                    <Mini label="Buchungen" value={String(loc.bookingsToday)} />
                    <Mini label="Besucher" value={String(loc.visitorsToday)} />
                  </div>
                  <div className="mt-4 text-[var(--muted)]">
                    <LineChart
                      points={loc.series.map((p) => ({ date: p.date, value: p.revenue }))}
                      height={140}
                      color={LOC_COLORS[i % LOC_COLORS.length]}
                      format={fmtMoney}
                    />
                  </div>
                </>
              ) : (
                <p className="mt-3 text-sm text-[var(--muted)]">
                  {loc.error ?? "Unter Einstellungen → Integrationen anbinden."}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-[var(--muted)]">{label}</span>
        <span className={accent}>{icon}</span>
      </div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
      <div className="mt-1 text-xs text-[var(--muted)]">{sub}</div>
    </div>
  );
}

function ChartCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-[var(--foreground)]">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <span className="text-[var(--muted)]">{icon}</span>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[var(--background)] p-3">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-[11px] text-[var(--muted)]">{label}</div>
    </div>
  );
}
