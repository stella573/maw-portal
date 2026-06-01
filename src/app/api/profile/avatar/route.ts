import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/services/auth/current-user";

/**
 * Profilbild hochladen. Auth → Bild prüfen → in den öffentlichen avatars-Bucket
 * legen (Service-Role) → profiles.avatar_url des EIGENEN Profils setzen
 * (RLS profiles_update_self). Liefert die öffentliche URL zurück.
 */
export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Keine Datei" }, { status: 422 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: "Nur JPG, PNG, WEBP oder GIF." }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Bild zu groß (max. 5 MB)." }, { status: 413 });
  }

  const ext = file.type === "image/png" ? "png"
    : file.type === "image/webp" ? "webp"
    : file.type === "image/gif" ? "gif" : "jpg";
  const path = `${user.profileId}/${crypto.randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const admin = createAdminClient();
  const { error: upErr } = await admin.storage
    .from("avatars")
    .upload(path, bytes, { contentType: file.type, upsert: true });
  if (upErr) {
    console.error("[avatar] upload:", upErr.message);
    return NextResponse.json({ error: "Upload fehlgeschlagen" }, { status: 500 });
  }

  const { data: pub } = admin.storage.from("avatars").getPublicUrl(path);
  const avatarUrl = pub.publicUrl;

  // avatar_url am eigenen Profil setzen (RLS schützt: nur eigenes Profil).
  const supabase = await createClient();
  const { error: updErr } = await supabase
    .from("profiles")
    .update({ avatar_url: avatarUrl })
    .eq("id", user.profileId);
  if (updErr) {
    return NextResponse.json({ error: "Profil konnte nicht aktualisiert werden" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, url: avatarUrl });
}
