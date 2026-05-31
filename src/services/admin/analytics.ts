import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/services/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { rollerRequest, type RollerCreds } from "@/lib/roller/client";

/**
 * Analytics aus der ROLLER Data API, pro Standort und aggregiert.
 *
 * Quellen (tagesbezogen, paginiert über startDate/endDate):
 *   /data/bookingpayments  → Umsatz (eingegangene Zahlungen)
 *   /data/bookingitems     → Buchungen/verkaufte Positionen
 *   /data/attendances      → Besucher (eingelöste Tickets)
 *
 * Da die genauen Feldnamen je Venue leicht variieren können, werden Beträge/
 * Datumswerte defensiv aus mehreren möglichen Feldern gelesen.
 */

type Json = Record<string, unknown>;

export interface DayPoint {
  date: string; // yyyy-mm-dd
  revenue: number;
  bookings: number;
  visitors: number;
}

export interface LocationAnalytics {
  locationId: string;
  locationName: string;
  connected: boolean;
  error: string | null;
  currency: string;
  revenueTotal: number;
  bookingsTotal: number;
  visitorsTotal: number;
  revenueToday: number;
  bookingsToday: number;
  visitorsToday: number;
  series: DayPoint[];
}

export interface AnalyticsResult {
  from: string;
  to: string;
  locations: LocationAnalytics[];
  totals: {
    revenue: number;
    bookings: number;
    visitors: number;
    revenueToday: number;
    bookingsToday: number;
    visitorsToday: number;
    series: DayPoint[];
  };
  currency: string;
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function pick(o: Json, keys: string[]): unknown {
  for (const k of keys) {
    if (o[k] != null) return o[k];
  }
  return undefined;
}

/** yyyy-mm-dd in lokaler (Berliner) Sicht. */
function isoDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function dayKeyFromRow(row: Json, fallback: string): string {
  const raw = pick(row, [
    "date",
    "paymentDate",
    "transactionDate",
    "bookingDate",
    "attendanceDate",
    "createdDate",
    "created",
    "modifiedDate",
  ]);
  if (typeof raw === "string" && raw.length >= 10) return raw.slice(0, 10);
  return fallback;
}

/** Folgetag (yyyy-mm-dd). endDate ist bei der Data API exklusiv/Folgetag-orientiert. */
function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return isoDate(d);
}

/** Holt alle Seiten eines Data-API-Endpunkts für genau einen Tag (startDate..Folgetag). */
async function fetchDay(creds: RollerCreds, path: string, day: string): Promise<Json[]> {
  const out: Json[] = [];
  const pageSize = 100;
  const startDate = day;
  const endDate = nextDay(day);
  for (let page = 1; page <= 50; page++) {
    const url = `${path}?startDate=${startDate}&endDate=${endDate}&pageNumber=${page}&pageSize=${pageSize}`;
    const res = await rollerRequest<unknown>(creds, url);
    const rows = extractRows(res);
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

/**
 * Holt alle Seiten eines Data-API-Endpunkts für mehrere Tage.
 * Die ROLLER Data API erlaubt pro Request nur ein Fenster von max. 1 Tag
 * ("startDate and endDate must be within 1 day(s)"), daher wird je Tag einzeln
 * (startDate=Tag, endDate=Folgetag) abgefragt und das Ergebnis zusammengeführt.
 */
async function fetchAll(creds: RollerCreds, path: string, days: string[]): Promise<Json[]> {
  const perDay = await Promise.all(days.map((d) => fetchDay(creds, path, d)));
  return perDay.flat();
}

function extractRows(res: unknown): Json[] {
  if (Array.isArray(res)) return res as Json[];
  const o = (res ?? {}) as Json;
  for (const k of ["data", "items", "results", "records"]) {
    if (Array.isArray(o[k])) return o[k] as Json[];
  }
  return [];
}

async function analyticsForLocation(
  locationId: string,
  locationName: string,
  creds: RollerCreds | null,
  days: string[],
  today: string,
): Promise<LocationAnalytics> {
  const base: LocationAnalytics = {
    locationId,
    locationName,
    connected: !!creds,
    error: creds ? null : "Nicht angebunden",
    currency: "EUR",
    revenueTotal: 0,
    bookingsTotal: 0,
    visitorsTotal: 0,
    revenueToday: 0,
    bookingsToday: 0,
    visitorsToday: 0,
    series: days.map((d) => ({ date: d, revenue: 0, bookings: 0, visitors: 0 })),
  };
  if (!creds) return base;

  const byDay = new Map(base.series.map((p) => [p.date, p]));

  try {
    const [payments, bookings, attendances] = await Promise.all([
      fetchAll(creds, "/data/bookingpayments", days),
      fetchAll(creds, "/data/bookingitems", days),
      fetchAll(creds, "/data/attendances", days),
    ]);

    for (const p of payments) {
      const amount = num(pick(p, ["amount", "amountPaid", "paymentAmount", "total", "value"]));
      const day = dayKeyFromRow(p, today);
      const cur = pick(p, ["currency", "currencyCode"]);
      if (typeof cur === "string" && cur) base.currency = cur;
      const pt = byDay.get(day);
      if (pt) pt.revenue += amount;
      base.revenueTotal += amount;
      if (day === today) base.revenueToday += amount;
    }

    for (const b of bookings) {
      const day = dayKeyFromRow(b, today);
      const pt = byDay.get(day);
      if (pt) pt.bookings += 1;
      base.bookingsTotal += 1;
      if (day === today) base.bookingsToday += 1;
    }

    for (const a of attendances) {
      const qty = num(pick(a, ["quantity", "count", "guests", "attendanceCount"])) || 1;
      const day = dayKeyFromRow(a, today);
      const pt = byDay.get(day);
      if (pt) pt.visitors += qty;
      base.visitorsTotal += qty;
      if (day === today) base.visitorsToday += qty;
    }
  } catch (err) {
    base.error = err instanceof Error ? err.message : "Daten konnten nicht geladen werden.";
  }

  return base;
}

/**
 * Aggregiert Analytics über alle (angebundenen) Standorte für die letzten
 * `rangeDays` Tage. Erfordert analytics.read.
 */
export async function getAnalytics(rangeDays = 14): Promise<AnalyticsResult> {
  const ctx = await getCurrentUser();
  if (!ctx || !can(ctx, "analytics.read")) throw new Error("FORBIDDEN");

  const admin = createAdminClient();
  const [{ data: locs }, { data: conns }] = await Promise.all([
    admin.from("locations").select("id, name").eq("is_active", true).order("name"),
    admin.from("roller_connections").select("location_id, base_url, client_id, client_secret, is_active"),
  ]);

  const credsByLoc = new Map<string, RollerCreds>();
  for (const c of conns ?? []) {
    if (c.is_active) {
      credsByLoc.set(c.location_id, {
        baseUrl: c.base_url,
        clientId: c.client_id,
        clientSecret: c.client_secret,
      });
    }
  }

  const today = isoDate(new Date());
  const days: string[] = [];
  for (let i = rangeDays - 1; i >= 0; i--) {
    const d = new Date(`${today}T00:00:00`);
    d.setDate(d.getDate() - i);
    days.push(isoDate(d));
  }

  const locations = await Promise.all(
    (locs ?? []).map((l) =>
      analyticsForLocation(l.id, l.name, credsByLoc.get(l.id) ?? null, days, today),
    ),
  );

  // Gesamt über alle Standorte.
  const series = days.map((d) => ({ date: d, revenue: 0, bookings: 0, visitors: 0 }));
  const seriesByDay = new Map(series.map((p) => [p.date, p]));
  const totals = {
    revenue: 0,
    bookings: 0,
    visitors: 0,
    revenueToday: 0,
    bookingsToday: 0,
    visitorsToday: 0,
    series,
  };
  let currency = "EUR";
  for (const loc of locations) {
    if (loc.connected && !loc.error) currency = loc.currency;
    totals.revenue += loc.revenueTotal;
    totals.bookings += loc.bookingsTotal;
    totals.visitors += loc.visitorsTotal;
    totals.revenueToday += loc.revenueToday;
    totals.bookingsToday += loc.bookingsToday;
    totals.visitorsToday += loc.visitorsToday;
    for (const p of loc.series) {
      const agg = seriesByDay.get(p.date);
      if (agg) {
        agg.revenue += p.revenue;
        agg.bookings += p.bookings;
        agg.visitors += p.visitors;
      }
    }
  }

  return { from: days[0]!, to: today, locations, totals, currency };
}
