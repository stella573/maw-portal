import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/services/auth/current-user";
import { can } from "@/lib/auth/permissions";

/**
 * Lädt eine Datei als (noch nicht gesendeten) Ticket-Anhang in den privaten
 * Storage-Bucket hoch und legt eine attachments-Zeile OHNE message_id an.
 * Beim Versand (/api/mail/send) werden die per IDs referenzierten Anhänge an
 * die Mail gehängt und der entstandenen outbound-Nachricht zugeordnet.
 *
 * Berechtigung: tickets.reply am Standort des Tickets.
 */
export const runtime = "nodejs";

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB pro Datei

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  const ticketId = z.string().uuid().safeParse(form.get("ticketId"));
  const file = form.get("file");
  if (!ticketId.success || !(file instanceof File)) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 422 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Datei zu groß (max. 15 MB)" }, { status: 413 });
  }

  const supabase = await createClient();
  const { data: ticket } = await supabase
    .from("tickets")
    .select("id, location_id")
    .eq("id", ticketId.data)
    .single();
  if (!ticket) {
    return NextResponse.json({ error: "Ticket nicht gefunden" }, { status: 404 });
  }
  if (!can(user, "tickets.reply", ticket.location_id)) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }

  const safeName = (file.name || "anhang").replace(/[^\w.\-]+/g, "_").slice(0, 120);
  const storagePath = `${ticket.id}/outgoing/${crypto.randomUUID()}-${safeName}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const admin = createAdminClient();
  const { error: upErr } = await admin.storage
    .from("mail-attachments")
    .upload(storagePath, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (upErr) {
    console.error("[mail/upload] storage:", upErr.message);
    return NextResponse.json({ error: "Upload fehlgeschlagen" }, { status: 500 });
  }

  const { data: row, error: insErr } = await admin
    .from("attachments")
    .insert({
      ticket_id: ticket.id,
      message_id: null,
      storage_path: storagePath,
      file_name: (file.name || safeName).slice(0, 200),
      content_type: file.type || null,
      size_bytes: file.size,
    })
    .select("id, file_name, size_bytes")
    .single();
  if (insErr || !row) {
    return NextResponse.json({ error: "Anhang konnte nicht gespeichert werden" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    id: row.id,
    fileName: row.file_name,
    sizeBytes: row.size_bytes,
  });
}
