import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/services/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { fetchVenue, clearRollerToken, type RollerCreds } from "@/lib/roller/client";

/**
 * ROLLER-Verbindungen je Standort. Secrets liegen in roller_connections
 * (RLS-abgeschottet) → ausschließlich über die Service-Role zugreifbar.
 * Verwaltung erfordert integrations.manage.
 */

export interface RollerConnectionStatus {
  locationId: string;
  locationName: string;
  configured: boolean;
  clientId: string | null;
  isActive: boolean;
  venueName: string | null;
  lastVerifiedAt: string | null;
}

async function requireManage() {
  const ctx = await getCurrentUser();
  if (!ctx || !can(ctx, "integrations.manage")) throw new Error("FORBIDDEN");
  return ctx;
}

/** Alle aktiven Standorte mit ihrem ROLLER-Verbindungsstatus (ohne Secret). */
export async function listRollerConnections(): Promise<RollerConnectionStatus[]> {
  await requireManage();
  const admin = createAdminClient();
  const [{ data: locs }, { data: conns }] = await Promise.all([
    admin.from("locations").select("id, name").eq("is_active", true).order("name"),
    admin
      .from("roller_connections")
      .select("location_id, client_id, is_active, venue_name, last_verified_at"),
  ]);
  const byLoc = new Map((conns ?? []).map((c) => [c.location_id, c]));
  return (locs ?? []).map((l) => {
    const c = byLoc.get(l.id);
    return {
      locationId: l.id,
      locationName: l.name,
      configured: !!c,
      clientId: c?.client_id ?? null,
      isActive: c?.is_active ?? false,
      venueName: c?.venue_name ?? null,
      lastVerifiedAt: c?.last_verified_at ?? null,
    };
  });
}

/** Speichert/aktualisiert die Zugangsdaten eines Standorts. */
export async function saveRollerConnection(
  locationId: string,
  input: { clientId: string; clientSecret: string; baseUrl?: string },
): Promise<void> {
  await requireManage();
  const admin = createAdminClient();
  const { error } = await admin.from("roller_connections").upsert(
    {
      location_id: locationId,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      base_url: input.baseUrl?.trim() || "https://api.play.roller.app",
      is_active: true,
    },
    { onConflict: "location_id" },
  );
  if (error) throw new Error(error.message);
  clearRollerToken(input.clientId);
}

export async function deleteRollerConnection(locationId: string): Promise<void> {
  await requireManage();
  const admin = createAdminClient();
  await admin.from("roller_connections").delete().eq("location_id", locationId);
}

/** Interner Helfer: Creds eines Standorts (für API-Aufrufe in Features). */
export async function getRollerCreds(locationId: string): Promise<RollerCreds | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("roller_connections")
    .select("base_url, client_id, client_secret, is_active")
    .eq("location_id", locationId)
    .maybeSingle();
  if (!data || !data.is_active) return null;
  return {
    baseUrl: data.base_url,
    clientId: data.client_id,
    clientSecret: data.client_secret,
  };
}

/** Testet die Verbindung (GET /venues/me) und merkt sich Venue-Name + Zeit. */
export async function verifyRollerConnection(
  locationId: string,
): Promise<{ ok: boolean; venueName: string | null; error?: string }> {
  await requireManage();
  const creds = await getRollerCreds(locationId);
  if (!creds) return { ok: false, venueName: null, error: "Keine (aktiven) Zugangsdaten hinterlegt." };
  try {
    const { name } = await fetchVenue(creds);
    const admin = createAdminClient();
    await admin
      .from("roller_connections")
      .update({ venue_name: name, last_verified_at: new Date().toISOString() })
      .eq("location_id", locationId);
    return { ok: true, venueName: name };
  } catch (err) {
    return {
      ok: false,
      venueName: null,
      error: err instanceof Error ? err.message : "Verbindung fehlgeschlagen.",
    };
  }
}
