import { LogOut } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { MobileNavTrigger } from "./mobile-nav";
import { APP_NAME_SHORT } from "@/config/app";

interface TopbarProps {
  userEmail: string;
  userName: string | null;
  onMenuOpen: () => void;
}

/** Obere Leiste mit Hamburger (Mobil), Theme-Toggle, User-Identität und Logout. */
export function Topbar({ userEmail, userName, onMenuOpen }: TopbarProps) {
  return (
    <header className="flex h-16 items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-3 md:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <MobileNavTrigger onOpen={onMenuOpen} />
        <span className="truncate font-medium md:hidden">{APP_NAME_SHORT}</span>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <ThemeToggle />
        {/* Name/E-Mail erst ab sm einblenden, damit auf kleinen Screens nichts überläuft. */}
        <div className="hidden text-right sm:block">
          <div className="max-w-[12rem] truncate text-sm font-medium leading-tight">
            {userName ?? userEmail}
          </div>
          <div className="max-w-[12rem] truncate text-xs text-[var(--muted)]">
            {userEmail}
          </div>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-medium text-white">
          {(userName ?? userEmail).charAt(0).toUpperCase()}
        </div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            aria-label="Abmelden"
            title="Abmelden"
            className="rounded-lg border border-[var(--border)] p-2 text-[var(--muted)] transition hover:text-[var(--foreground)]"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </header>
  );
}
