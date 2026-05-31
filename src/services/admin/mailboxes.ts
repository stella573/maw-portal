import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/services/auth/current-user";
import { can } from "@/lib/auth/permissions";

/**
 * Server-seitige Postfach-Verwaltung (Funktions-/Team-Postfächer).
 *
 * Lesen erfordert mailboxes.manage; RLS lässt zwar auch Mitglieder lesen,
 * für die Verwaltungs-Ansicht verlangen wir aber das Verwaltungsrecht.
 */

export interface MailboxMember {
  profileId: string;
  email: string;
  fullName: string | null;
}

export interface MailboxAlias {
  id: string;
  email: string;
}

export interface ManagedMailbox {
  id: string;
  name: string;
  email: string;
  locationId: string | null;
  locationName: string | null;
  isActive: boolean;
  members: MailboxMember[];
  aliases: MailboxAlias[];
  ticketCount: number;
}

export interface AssignableProfile {
  id: string;
  email: string;
  fullName: string | null;
}

async function requireManage() {
  const ctx = await getCurrentUser();
  if (!ctx || !can(ctx, "mailboxes.manage")) {
    throw new Error("FORBIDDEN");
  }
  return ctx;
}

/** Alle Postfächer inkl. Mitglieder + Ticketanzahl. */
export async function listMailboxes(): Promise<ManagedMailbox[]> {
  await requireManage();
  const supabase = await createClient();

  const { data: boxes, error } = await supabase
    .from("mailboxes")
    .select("id, name, email, location_id, is_active, locations(name)")
    .order("name");
  if (error) throw new Error(error.message);

  const { data: members } = await supabase
    .from("mailbox_members")
    .select("mailbox_id, profiles(id, email, full_name)");

  const { data: aliases } = await supabase
    .from("mailbox_aliases")
    .select("id, mailbox_id, email")
    .order("email");

  // Ticketanzahl je Postfach (head + count pro Box).
  const counts = new Map<string, number>();
  await Promise.all(
    (boxes ?? []).map(async (b) => {
      const { count } = await supabase
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("mailbox_id", b.id);
      counts.set(b.id, count ?? 0);
    }),
  );

  return (boxes ?? []).map((b) => {
    const loc = b.locations as unknown as { name: string } | null;
    const mbMembers: MailboxMember[] = (members ?? [])
      .filter((m) => m.mailbox_id === b.id)
      .map((m) => {
        const p = m.profiles as unknown as {
          id: string;
          email: string;
          full_name: string | null;
        } | null;
        return {
          profileId: p?.id ?? "",
          email: p?.email ?? "—",
          fullName: p?.full_name ?? null,
        };
      })
      .filter((m) => m.profileId !== "");

    const mbAliases: MailboxAlias[] = (aliases ?? [])
      .filter((a) => a.mailbox_id === b.id)
      .map((a) => ({ id: a.id, email: a.email }));

    return {
      id: b.id,
      name: b.name,
      email: b.email,
      locationId: b.location_id,
      locationName: loc?.name ?? null,
      isActive: b.is_active,
      members: mbMembers,
      aliases: mbAliases,
      ticketCount: counts.get(b.id) ?? 0,
    };
  });
}

/** Profile, die einem Postfach zugewiesen werden können. */
export async function listAssignableProfiles(): Promise<AssignableProfile[]> {
  await requireManage();
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .eq("is_active", true)
    .order("full_name", { nullsFirst: false });
  return (data ?? []).map((p) => ({
    id: p.id,
    email: p.email,
    fullName: p.full_name,
  }));
}

export interface MailboxLocationOption {
  id: string;
  name: string;
}

export async function listMailboxLocations(): Promise<MailboxLocationOption[]> {
  await requireManage();
  const supabase = await createClient();
  const { data } = await supabase
    .from("locations")
    .select("id, name")
    .eq("is_active", true)
    .order("name");
  return (data ?? []).map((l) => ({ id: l.id, name: l.name }));
}
