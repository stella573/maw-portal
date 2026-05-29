import { createClient } from "@/lib/supabase/server";
import type { AuditAction } from "@/types/database";

export interface AuditEntry {
  action: AuditAction;
  entityType?: string | null;
  entityId?: string | null;
  locationId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Schreibt einen Audit-Eintrag über die DB-Funktion public.log_audit().
 * Der Actor wird in der Funktion aus dem JWT (auth.uid()) bestimmt.
 *
 * Bewusst "best effort": Audit-Fehler dürfen die eigentliche Operation nicht
 * abbrechen, werden aber geloggt.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("log_audit", {
      p_action: entry.action,
      p_entity_type: entry.entityType ?? null,
      p_entity_id: entry.entityId ?? null,
      p_location_id: entry.locationId ?? null,
      p_metadata: entry.metadata ?? {},
    });
    if (error) {
      console.error("[audit] log_audit fehlgeschlagen:", error.message);
    }
  } catch (err) {
    console.error("[audit] unerwarteter Fehler:", err);
  }
}
