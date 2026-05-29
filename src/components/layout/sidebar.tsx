"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAVIGATION } from "@/config/navigation";
import { cn } from "@/utils/cn";

/**
 * Persistente Seitennavigation. Datengetrieben aus config/navigation.ts.
 * Geplante Module erscheinen ausgegraut und nicht klickbar.
 */
export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 border-r border-[var(--border)] bg-[var(--surface)] md:flex md:flex-col">
      <div className="flex h-16 items-center gap-2 border-b border-[var(--border)] px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
          M
        </div>
        <span className="font-semibold">MAW Portal</span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAVIGATION.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);

          if (item.status === "planned") {
            return (
              <div
                key={item.key}
                className="flex cursor-not-allowed items-center justify-between rounded-lg px-3 py-2 text-sm text-[var(--muted)] opacity-60"
                title="In Vorbereitung"
              >
                <span className="flex items-center gap-3">
                  <Icon className="h-4 w-4" />
                  {item.label}
                </span>
                <span className="rounded bg-[var(--background)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                  bald
                </span>
              </div>
            );
          }

          return (
            <Link
              key={item.key}
              href={item.href as never}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
                isActive
                  ? "bg-brand-50 font-medium text-brand-700 dark:bg-brand-700/15 dark:text-brand-100"
                  : "text-[var(--foreground)] hover:bg-[var(--background)]",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[var(--border)] p-3 text-xs text-[var(--muted)]">
        Phase 1 · MailDesk
      </div>
    </aside>
  );
}
