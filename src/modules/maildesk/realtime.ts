"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/**
 * Realtime-Bausteine für den MailDesk (Multi-User-Kollaboration).
 *
 * 1) useRealtimeRefresh – lauscht auf Postgres-Changes (RLS-gefiltert) und
 *    triggert ein server-seitiges router.refresh(). So verschwinden erledigte
 *    Tickets sofort aus der aktiven Inbox und neue Nachrichten erscheinen live,
 *    ohne die Datenlade-/Berechtigungslogik im Client zu duplizieren.
 *
 * 2) useMaildeskPresence – teilt über einen öffentlichen Presence-Channel mit,
 *    wer gerade die Inbox bzw. ein konkretes Ticket offen hat und wer tippt.
 *    Damit sieht ein zweiter Bearbeiter, dass ein Ticket bereits in Arbeit ist,
 *    und vermeidet Doppelbearbeitung.
 */

export interface RealtimeSub {
  table: "tickets" | "messages" | "notes";
  /** PostgREST-Filter, z. B. `id=eq.<uuid>` oder `ticket_id=eq.<uuid>`. */
  filter?: string;
}

export function useRealtimeRefresh(subs: RealtimeSub[]): void {
  const router = useRouter();
  // Stabiler Schlüssel, damit der Effekt nicht bei jeder Render-Identität neu läuft.
  const key = subs.map((s) => `${s.table}:${s.filter ?? "*"}`).join("|");

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`maildesk-rt-${key}`);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      // Kurzes Debounce bündelt mehrere kurz aufeinanderfolgende Events.
      timer = setTimeout(() => router.refresh(), 250);
    };

    for (const sub of subs) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: sub.table,
          ...(sub.filter ? { filter: sub.filter } : {}),
        },
        refresh,
      );
    }

    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
    // key kapselt subs vollständig.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, router]);
}

export interface PresenceUser {
  profileId: string;
  name: string;
}

export interface PresencePeer extends PresenceUser {
  /** Ticket, das der Peer gerade offen hat (null = Inbox/Übersicht). */
  ticketId: string | null;
  /** true, wenn der Peer gerade eine Antwort tippt. */
  typing: boolean;
}

const PRESENCE_CHANNEL = "maildesk-presence";

/**
 * Tritt dem gemeinsamen Presence-Channel bei und meldet die eigene Position
 * (Inbox oder konkretes Ticket). Liefert die anderen anwesenden Bearbeiter und
 * eine setTyping-Funktion (für den Antwort-Editor).
 */
export function useMaildeskPresence(
  me: PresenceUser,
  ticketId: string | null,
): { peers: PresencePeer[]; setTyping: (typing: boolean) => void } {
  const [peers, setPeers] = useState<PresencePeer[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingRef = useRef(false);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(PRESENCE_CHANNEL, {
      config: { presence: { key: me.profileId } },
    });
    channelRef.current = channel;
    typingRef.current = false;

    const sync = () => {
      const state = channel.presenceState<PresencePeer>();
      const all: PresencePeer[] = [];
      for (const key of Object.keys(state)) {
        for (const meta of state[key] ?? []) {
          all.push({
            profileId: meta.profileId,
            name: meta.name,
            ticketId: meta.ticketId ?? null,
            typing: !!meta.typing,
          });
        }
      }
      // sich selbst herausfiltern
      setPeers(all.filter((p) => p.profileId !== me.profileId));
    };

    channel.on("presence", { event: "sync" }, sync);

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void channel.track({
          profileId: me.profileId,
          name: me.name,
          ticketId,
          typing: false,
        });
      }
    });

    return () => {
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [me.profileId, me.name, ticketId]);

  const setTyping = useCallback(
    (typing: boolean) => {
      if (typingRef.current === typing) return;
      typingRef.current = typing;
      void channelRef.current?.track({
        profileId: me.profileId,
        name: me.name,
        ticketId,
        typing,
      });
    },
    [me.profileId, me.name, ticketId],
  );

  return { peers, setTyping };
}
