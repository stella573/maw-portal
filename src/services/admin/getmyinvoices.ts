import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/services/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { verifyConnection, type GmiCreds } from "@/lib/getmyinvoices/client";

/**
 * GetMyInvoices-Verbindung (global/Singleton). Der API-Key liegt in
 * getmyinvoices_connection (RLS-abgeschottet) → nur über die Service-Role
 * zugreifbar. Verwaltung erfordert integrations.manage.
 */

const DEFAULT_BASE_URL = "https://api.getmyinvoices.com/accounts/v3";

export interface GmiConnectionStatus {
  configured: boolean;
  baseUrl: string;
  accountId: string | null;
  isActive: boolean;
  lastVerifiedAt: string | null;
}

async function requireManage() {
  const ctx = await getCurrentUser();
  if (!ctx || !can(ctx, "integrations.manage")) throw new Error("FORBIDDEN");
  return ctx;
}

/** Status der globalen GMI-Verbindung (ohne Secret). */
export async function getGmiConnectionStatus(): Promise<GmiConnectionStatus> {
  await requireManage();
  const admin = createAdminClient();
  const { data } = await admin
    .from("getmyinvoices_connection")
    .select("base_url, account_id, is_active, last_verified_at")
    .eq("id", true)
    .maybeSingle();
  return {
    configured: !!data,
    baseUrl: data?.base_url ?? DEFAULT_BASE_URL,
    accountId: data?.account_id ?? null,
    isActive: data?.is_active ?? false,
    lastVerifiedAt: data?.last_verified_at ?? null,
  };
}

/** Speichert/aktualisiert API-Key, Account-Kennung (und optional die Base-URL). */
export async function saveGmiConnection(input: {
  apiKey: string;
  accountId: string;
  baseUrl?: string;
}): Promise<void> {
  await requireManage();
  const admin = createAdminClient();
  const { error } = await admin.from("getmyinvoices_connection").upsert(
    {
      id: true,
      api_key: input.apiKey,
      account_id: input.accountId.trim() || null,
      base_url: input.baseUrl?.trim() || DEFAULT_BASE_URL,
      is_active: true,
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(error.message);
}

export async function deleteGmiConnection(): Promise<void> {
  await requireManage();
  const admin = createAdminClient();
  await admin.from("getmyinvoices_connection").delete().eq("id", true);
}

/** Interner Helfer: Creds der globalen Verbindung (für Features, z. B. E-Mail→GMI). */
export async function getGmiCreds(): Promise<GmiCreds | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("getmyinvoices_connection")
    .select("base_url, api_key, account_id, is_active")
    .eq("id", true)
    .maybeSingle();
  if (!data || !data.is_active) return null;
  return { baseUrl: data.base_url, apiKey: data.api_key, accountId: data.account_id ?? "" };
}

/** Testet die Verbindung (GET apiStatus) und merkt sich den Zeitpunkt. */
export async function verifyGmiConnection(): Promise<{ ok: boolean; error?: string }> {
  await requireManage();
  const admin = createAdminClient();
  const { data } = await admin
    .from("getmyinvoices_connection")
    .select("base_url, api_key, account_id, is_active")
    .eq("id", true)
    .maybeSingle();
  if (!data || !data.is_active) {
    return { ok: false, error: "Kein (aktiver) API-Key hinterlegt." };
  }
  if (!data.account_id) {
    return { ok: false, error: "Account-Kennung (G-…) fehlt – bitte ergänzen." };
  }
  try {
    await verifyConnection({
      baseUrl: data.base_url,
      apiKey: data.api_key,
      accountId: data.account_id,
    });
    await admin
      .from("getmyinvoices_connection")
      .update({ last_verified_at: new Date().toISOString() })
      .eq("id", true);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Verbindung fehlgeschlagen." };
  }
}
