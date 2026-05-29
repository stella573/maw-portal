"use client";

import { useEffect } from "react";
import { Menu, X } from "lucide-react";
import { NavList, NavBrand } from "./nav-list";
import { APP_NAME_SHORT } from "@/config/app";

/** Hamburger-Button – nur unter md sichtbar. Öffnet den mobilen Drawer. */
export function MobileNavTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Navigation öffnen"
      className="rounded-lg border border-[var(--border)] p-2 text-[var(--muted)] transition hover:text-[var(--foreground)] md:hidden"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}

/**
 * Off-Canvas-Navigation für Mobil (< md). Overlay + Slide-in-Panel.
 * Schließt bei Navigation, Escape und Klick aufs Overlay.
 */
export function MobileNavDrawer({
  open,
  onClose,
  allowedNavKeys,
}: {
  open: boolean;
  onClose: () => void;
  allowedNavKeys: string[];
}) {
  // Body-Scroll sperren, solange offen; Escape schließt.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <div
      className={cnOpen(open)}
      aria-hidden={!open}
      role="dialog"
      aria-modal="true"
    >
      {/* Overlay */}
      <button
        type="button"
        aria-label="Navigation schließen"
        onClick={onClose}
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0"
        }`}
        tabIndex={open ? 0 : -1}
      />

      {/* Panel */}
      <aside
        className={`absolute left-0 top-0 flex h-full w-64 max-w-[80%] flex-col border-r border-[var(--border)] bg-[var(--surface)] shadow-xl transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-[var(--border)] px-4">
          <NavBrand name={APP_NAME_SHORT} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Navigation schließen"
            className="rounded-lg p-2 text-[var(--muted)] transition hover:text-[var(--foreground)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <NavList onNavigate={onClose} allowedKeys={allowedNavKeys} />

        <div className="border-t border-[var(--border)] p-3 text-xs text-[var(--muted)]">
          Phase 1 · MailDesk
        </div>
      </aside>
    </div>
  );
}

/** Sichtbarkeit des Containers steuern (md:hidden + pointer-events). */
function cnOpen(open: boolean): string {
  return [
    "fixed inset-0 z-50 md:hidden",
    open ? "pointer-events-auto" : "pointer-events-none",
  ].join(" ");
}
