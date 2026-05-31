import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/services/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { fetchPersonioEmployees } from "@/lib/personio/client";

/**
 * Mitarbeiter-Verzeichnis (Personio) – Lesen für die Übersicht und Sync.
 */

export interface DirectoryEmployee {
  personioId: number;
  email: string | null;
  fullName: string;
  position: string | null;
  department: string | null;
  office: string | null;
  status: string;
  /** true, wenn ein Portal-Zugang (profiles) verknüpft ist. */
  hasAccess: boolean;
  syncedAt: string;
}

function fullName(first: string | null, last: string | null, email: string | null): string {
  const n = [first, last].filter(Boolean).join(" ").trim();
  return n || email || "—";
}

/** Verzeichnis für die Mitarbeiter-Übersicht (RLS: employees.read). */
export async function listDirectory(): Promise<DirectoryEmployee[]> {
  const ctx = await getCurrentUser();
  if (!ctx || !can(ctx, "employees.read")) throw new Error("FORBIDDEN");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("personio_employees")
    .select(
      "personio_id, email, first_name, last_name, position, department, office, status, profile_id, synced_at",
    )
    .order("status")
    .order("last_name");
  if (error) throw new Error(error.message);

  return (data ?? []).map((e) => ({
    personioId: e.personio_id,
    email: e.email,
    fullName: fullName(e.first_name, e.last_name, e.email),
    position: e.position,
    department: e.department,
    office: e.office,
    status: e.status,
    hasAccess: e.profile_id !== null,
    syncedAt: e.synced_at,
  }));
}

export interface SyncResult {
  total: number;
  active: number;
  inactive: number;
  linked: number;
  deactivatedAccounts: number;
  reactivatedAccounts: number;
}

/**
 * Synchronisiert das Verzeichnis aus Personio (Service-Role, umgeht RLS).
 *  - upsert je personio_id
 *  - verknüpft profile_id über die E-Mail (falls Portal-Konto existiert)
 *  - spiegelt den Personio-Status auf profiles.is_active (inaktiv ⇒ gesperrt)
 *
 * Quelle der Wahrheit ist Personio. Profile, die NICHT in Personio vorkommen,
 * werden bewusst nicht angefasst (z. B. System-/Owner-Konten).
 */
export async function syncFromPersonio(): Promise<SyncResult> {
  const employees = await fetchPersonioEmployees();
  const admin = createAdminClient();

  // E-Mail → profile_id (für Verknüpfung + Status-Spiegelung).
  const emails = employees.map((e) => e.email).filter((e): e is string => !!e);
  const profileByEmail = new Map<string, string>();
  if (emails.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email")
      .in("email", emails);
    for (const p of profiles ?? []) {
      if (p.email) profileByEmail.set(p.email.toLowerCase(), p.id);
    }
  }

  let active = 0;
  let inactive = 0;
  let linked = 0;
  const toDeactivate: string[] = [];
  const toReactivate: string[] = [];

  const rows = employees.map((e) => {
    const isActive = e.status === "active";
    if (isActive) active += 1;
    else inactive += 1;
    const profileId = e.email ? profileByEmail.get(e.email.toLowerCase()) ?? null : null;
    if (profileId) {
      linked += 1;
      if (isActive) toReactivate.push(profileId);
      else toDeactivate.push(profileId);
    }
    return {
      personio_id: e.personioId,
      email: e.email,
      first_name: e.firstName,
      last_name: e.lastName,
      position: e.position,
      department: e.department,
      office: e.office,
      status: e.status,
      profile_id: profileId,
      synced_at: new Date().toISOString(),
    };
  });

  if (rows.length > 0) {
    const { error } = await admin
      .from("personio_employees")
      .upsert(rows, { onConflict: "personio_id" });
    if (error) throw new Error(`Verzeichnis-Upsert fehlgeschlagen: ${error.message}`);
  }

  // Status auf Portal-Konten spiegeln: inaktiv ⇒ sperren, aktiv ⇒ entsperren.
  let deactivatedAccounts = 0;
  let reactivatedAccounts = 0;
  if (toDeactivate.length > 0) {
    const { count } = await admin
      .from("profiles")
      .update({ is_active: false }, { count: "exact" })
      .in("id", toDeactivate)
      .eq("is_active", true);
    deactivatedAccounts = count ?? 0;
  }
  if (toReactivate.length > 0) {
    const { count } = await admin
      .from("profiles")
      .update({ is_active: true }, { count: "exact" })
      .in("id", toReactivate)
      .eq("is_active", false);
    reactivatedAccounts = count ?? 0;
  }

  return {
    total: employees.length,
    active,
    inactive,
    linked,
    deactivatedAccounts,
    reactivatedAccounts,
  };
}
