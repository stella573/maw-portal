"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Portalweite Online-Präsenz. Wer das Portal offen hat, ist „online" – über
 * einen gemeinsamen Realtime-Channel. Der Provider sitzt in der PortalShell,
 * sodass jede Seite (z. B. das Dashboard) die Liste via useOnlineUsers() liest.
 */
export interface OnlineUser {
  profileId: string;
  name: string;
  avatarUrl: string | null;
}

const OnlineContext = createContext<OnlineUser[]>([]);

export function useOnlineUsers(): OnlineUser[] {
  return useContext(OnlineContext);
}

export function OnlinePresenceProvider({
  me,
  children,
}: {
  me: OnlineUser;
  children: React.ReactNode;
}) {
  const [users, setUsers] = useState<OnlineUser[]>([]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel("maw-online", {
      config: { presence: { key: me.profileId } },
    });

    const sync = () => {
      const state = channel.presenceState<OnlineUser>();
      // Pro Person nur ein Eintrag (mehrere Tabs zählen einmal).
      const seen = new Map<string, OnlineUser>();
      for (const key of Object.keys(state)) {
        for (const m of state[key] ?? []) {
          seen.set(m.profileId, {
            profileId: m.profileId,
            name: m.name,
            avatarUrl: m.avatarUrl ?? null,
          });
        }
      }
      setUsers([...seen.values()].sort((a, b) => a.name.localeCompare(b.name)));
    };

    channel.on("presence", { event: "sync" }, sync);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") void channel.track(me);
    });

    return () => {
      void supabase.removeChannel(channel);
    };
    // me ist über die Primitiv-Felder vollständig erfasst.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.profileId, me.name, me.avatarUrl]);

  return <OnlineContext.Provider value={users}>{children}</OnlineContext.Provider>;
}
