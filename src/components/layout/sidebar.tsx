import { NavList, NavBrand } from "./nav-list";
import { APP_NAME_SHORT } from "@/config/app";

/**
 * Persistente Seitennavigation (Desktop ≥ md). Auf kleineren Viewports
 * übernimmt der mobile Drawer (siehe mobile-nav.tsx).
 */
export function Sidebar({ allowedNavKeys }: { allowedNavKeys: string[] }) {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-[var(--border)] bg-[var(--surface)] md:flex md:flex-col">
      <div className="flex h-16 items-center border-b border-[var(--border)] px-6">
        <NavBrand name={APP_NAME_SHORT} />
      </div>

      <NavList allowedKeys={allowedNavKeys} />

      <div className="border-t border-[var(--border)] p-3 text-xs text-[var(--muted)]">
        Phase 1 · MailDesk
      </div>
    </aside>
  );
}
