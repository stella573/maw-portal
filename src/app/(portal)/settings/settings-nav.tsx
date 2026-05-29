"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SETTINGS_NAV } from "@/config/settings-nav";
import { cn } from "@/utils/cn";

/**
 * Seitennavigation des Einstellungsbereichs. Erhält die erlaubten Keys
 * serverseitig (Permission-Gating) und zeigt nur diese.
 */
export function SettingsNav({ allowedKeys }: { allowedKeys: string[] }) {
  const pathname = usePathname();
  const items = SETTINGS_NAV.filter((i) => allowedKeys.includes(i.key));

  return (
    <nav className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
      {items.map((item) => {
        const Icon = item.icon;
        // exakte Übereinstimmung für /settings, sonst Präfix
        const isActive =
          item.href === "/settings"
            ? pathname === "/settings"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.key}
            href={item.href as never}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition lg:shrink",
              isActive
                ? "bg-brand-50 font-medium text-brand-700 dark:bg-brand-700/15 dark:text-brand-100"
                : "text-[var(--foreground)] hover:bg-[var(--surface)]",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
