import { LogOut } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { APP_NAME_SHORT } from "@/config/app";

interface TopbarProps {
  userEmail: string;
  userName: string | null;
}

/** Obere Leiste mit Titel, Theme-Toggle, User-Identität und Logout. */
export function Topbar({ userEmail, userName }: TopbarProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 md:px-6">
      <div className="font-medium md:hidden">{APP_NAME_SHORT}</div>
      <div className="hidden md:block" />
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <div className="text-right">
          <div className="text-sm font-medium leading-tight">
            {userName ?? userEmail}
          </div>
          <div className="text-xs text-[var(--muted)]">{userEmail}</div>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-medium text-white">
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
