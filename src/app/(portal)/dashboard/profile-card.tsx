"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";

/**
 * Profilkarte mit Avatar + „Foto ändern". Lädt das Bild an /api/profile/avatar,
 * aktualisiert die Anzeige sofort und refresht die Shell (Topbar-Avatar).
 */
export function ProfileCard({
  name,
  email,
  position,
  initialAvatarUrl,
}: {
  name: string;
  email: string;
  position?: string | null;
  initialAvatarUrl: string | null;
}) {
  const router = useRouter();
  const [avatar, setAvatar] = useState(initialAvatarUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/profile/avatar", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Upload fehlgeschlagen.");
      } else {
        setAvatar(data.url);
        router.refresh();
      }
    } catch {
      setError("Upload fehlgeschlagen.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="group relative h-20 w-20 shrink-0 rounded-full"
          title="Profilbild ändern"
        >
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatar}
              alt={name}
              className="h-20 w-20 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-600 text-2xl font-semibold text-white">
              {name.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition group-hover:opacity-100">
            <Camera className="h-6 w-6 text-white" />
          </span>
        </button>
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold">{name}</div>
          {position && (
            <div className="truncate text-sm text-[var(--muted)]">{position}</div>
          )}
          <div className="truncate text-xs text-[var(--muted)]">{email}</div>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
        }}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm transition hover:bg-[var(--background)] disabled:opacity-60"
      >
        <Camera className="h-4 w-4" />
        {uploading ? "Lädt…" : "Profilbild ändern"}
      </button>
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </div>
  );
}
