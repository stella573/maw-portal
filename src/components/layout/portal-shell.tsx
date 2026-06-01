"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { MobileNavDrawer } from "./mobile-nav";
import { OnlinePresenceProvider } from "@/components/presence/online-presence";

interface PortalShellProps {
  userEmail: string;
  userName: string | null;
  profileId: string;
  avatarUrl: string | null;
  /** Keys der Navigationseinträge, die der User sehen darf. */
  allowedNavKeys: string[];
  children: React.ReactNode;
}

/**
 * Client-Shell des Portals: hält den Zustand des mobilen Navigations-Drawers
 * und verbindet Sidebar (Desktop), Topbar und Drawer (Mobil). Umschließt zudem
 * den Online-Präsenz-Provider, damit jede Seite weiß, wer gerade online ist.
 */
export function PortalShell({
  userEmail,
  userName,
  profileId,
  avatarUrl,
  allowedNavKeys,
  children,
}: PortalShellProps) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <OnlinePresenceProvider
      me={{ profileId, name: userName ?? userEmail, avatarUrl }}
    >
      <div className="flex h-screen overflow-hidden">
        {/* Desktop-Sidebar */}
        <Sidebar allowedNavKeys={allowedNavKeys} />

        {/* Mobiler Off-Canvas-Drawer */}
        <MobileNavDrawer
          open={navOpen}
          onClose={() => setNavOpen(false)}
          allowedNavKeys={allowedNavKeys}
        />

        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar
            userEmail={userEmail}
            userName={userName}
            avatarUrl={avatarUrl}
            onMenuOpen={() => setNavOpen(true)}
          />
          <main className="flex-1 overflow-y-auto p-4 md:p-8">{children}</main>
        </div>
      </div>
    </OnlinePresenceProvider>
  );
}
