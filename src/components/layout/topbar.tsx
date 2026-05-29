import { ThemeToggle } from "./theme-toggle";

interface TopbarProps {
  userEmail: string;
  userName: string | null;
}

/** Obere Leiste mit Titel, Theme-Toggle und User-Identität. */
export function Topbar({ userEmail, userName }: TopbarProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 md:px-6">
      <div className="font-medium md:hidden">MAW Portal</div>
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
      </div>
    </header>
  );
}
