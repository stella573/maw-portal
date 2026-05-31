import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/services/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { rollerRequest, type RollerCreds } from "@/lib/roller/client";

/**
 * Diagnose: liefert je Data-API-Quelle EINE Roh-Beispielzeile (Keys + Werte),
 * damit das Feld-Mapping exakt justiert werden kann. Nur Owner/Admin
 * (integrations.manage). Zeitraum: ?date=yyyy-mm-dd (Default heute).
 *
 * Bewusst nur 1 Zeile je Quelle → minimaler Datenabfluss zur Diagnose.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCES = [
  "/data/bookingpayments",
  "/data/bookingitems",
  "/data/attendances",
] as const;

function rows(res: unknown): Record<string, unknown>[] {
  if (Array.isArray(res)) return res as Record<string, unknown>[];
  const o = (res ?? {}) as Record<string, unknown>;
  for (const k of ["data", "items", "results", "records"]) {
    if (Array.isArray(o[k])) return o[k] as Record<string, unknown>[];
  }
  return [];
}

export async function GET(request: NextRequest) {
  const ctx = await getCurrentUser();
  if (!ctx || !can(ctx, "integrations.manage")) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }

  const date = request.nextUrl.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  const end = new Date(`${date}T00:00:00`);
  end.setDate(end.getDate() + 1);
  const endDate = end.toISOString().slice(0, 10);

  const admin = createAdminClient();
  const { data: conns } = await admin
    .from("roller_connections")
    .select("location_id, base_url, client_id, client_secret, is_active, locations(name)")
    .eq("is_active", true);

  const out: Record<string, unknown> = { date, endDate, locations: [] as unknown[] };

  for (const c of conns ?? []) {
    const creds: RollerCreds = {
      baseUrl: c.base_url,
      clientId: c.client_id,
      clientSecret: c.client_secret,
    };
    const locName = (c.locations as unknown as { name: string } | null)?.name ?? c.location_id;
    const sample: Record<string, unknown> = { location: locName };
    for (const src of SOURCES) {
      try {
        const res = await rollerRequest<unknown>(
          creds,
          `${src}?startDate=${date}&endDate=${endDate}&pageNumber=1&pageSize=1`,
        );
        const list = rows(res);
        sample[src] = {
          count: list.length,
          keys: list[0] ? Object.keys(list[0]) : [],
          example: list[0] ?? null,
        };
      } catch (err) {
        sample[src] = { error: err instanceof Error ? err.message : "Fehler" };
      }
    }
    (out.locations as unknown[]).push(sample);
  }

  return NextResponse.json(out);
}
