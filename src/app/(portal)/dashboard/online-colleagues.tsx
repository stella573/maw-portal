"use client";

import { Users } from "lucide-react";
import { useOnlineUsers } from "@/components/presence/online-presence";

/**
 * Zeigt die gerade online angemeldeten Kolleg:innen (portalweite Präsenz).
 */
export function OnlineColleagues({ meId }: { meId: string }) {
  const users = useOnlineUsers();

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Users className="h-4 w-4 text-[var(--muted)]" />
          Gerade in der Grube
        </h2>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {users.length} online
        </span>
      </div>

      {users.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--muted)]">
          Gerade ist niemand eingefahren. Glück auf! ⛏️
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-3">
          {users.map((u) => (
            <div key={u.profileId} className="flex items-center gap-2">
              <span className="relative">
                {u.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={u.avatarUrl}
                    alt={u.name}
                    className="h-9 w-9 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-medium text-white">
                    {u.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[var(--surface)] bg-emerald-500" />
              </span>
              <span className="text-sm">
                {u.name}
                {u.profileId === meId && (
                  <span className="text-[var(--muted)]"> (du)</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
