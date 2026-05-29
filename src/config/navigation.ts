import {
  LayoutDashboard,
  Inbox,
  Users,
  CalendarDays,
  CheckSquare,
  ListChecks,
  BookOpen,
  Contact,
  Settings,
  UserCog,
  Mailbox,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/lib/auth/roles";

export type ModuleStatus = "active" | "planned";

export interface NavItem {
  /** Eindeutiger Schlüssel des Moduls. */
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  status: ModuleStatus;
  /** Optionales Recht, das zum Anzeigen nötig ist. */
  permission?: Permission;
}

/**
 * Zentrale Navigationsdefinition. `status: "planned"` erscheint als
 * ausgegrauter, nicht klickbarer Platzhalter.
 *
 * Phase 1 aktiv: Dashboard, MailDesk, Einstellungen.
 */
export const NAVIGATION: NavItem[] = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, status: "active" },
  { key: "maildesk", label: "MailDesk", href: "/maildesk", icon: Inbox, status: "active", permission: "tickets.read" },
  { key: "mailboxes", label: "Postfächer", href: "/mailboxes", icon: Mailbox, status: "active", permission: "mailboxes.manage" },
  { key: "employees", label: "Mitarbeiter", href: "/employees", icon: Users, status: "planned" },
  { key: "schedule", label: "Dienstplan", href: "/schedule", icon: CalendarDays, status: "planned" },
  { key: "tasks", label: "Aufgaben", href: "/tasks", icon: CheckSquare, status: "planned" },
  { key: "checklists", label: "Checklisten", href: "/checklists", icon: ListChecks, status: "planned" },
  { key: "knowledge", label: "Wissensdatenbank", href: "/knowledge", icon: BookOpen, status: "planned" },
  { key: "crm", label: "CRM", href: "/crm", icon: Contact, status: "planned" },
  { key: "users", label: "Benutzer", href: "/users", icon: UserCog, status: "active", permission: "users.read" },
  { key: "settings", label: "Einstellungen", href: "/settings", icon: Settings, status: "active" },
];
