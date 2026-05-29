"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { MobileNavDrawer } from "./mobile-nav";

interface PortalShellProps {
  userEmail: string;
  userName: string | null;
  children: React.ReactNode;
}

/**
 * Client-Shell des Portals: hält den Zustand des mobilen Navigations-Drawers
 * und verbindet Sidebar (Desktop), Topbar und Drawer (Mobil).
 *
 * Die Authentifizierung/Userdaten kommen aus dem Server-Layout – hier nur
 * der UI-State.
 */
export function PortalShell({ userEmail, userName, children }: PortalShellProps) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop-Sidebar */}
      <Sidebar />

      {/* Mobiler Off-Canvas-Drawer */}
      <MobileNavDrawer open={navOpen} onClose={() => setNavOpen(false)} />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          userEmail={userEmail}
          userName={userName}
          onMenuOpen={() => setNavOpen(true)}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
