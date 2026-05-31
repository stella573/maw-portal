import {
  User,
  Users,
  Mailbox,
  ShieldCheck,
  PenLine,
  Tag,
  FileText,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/lib/auth/roles";

/**
 * Unterpunkte des Einstellungsbereichs. `permission` steuert Sichtbarkeit
 * (UI-Gating); fehlt sie, ist der Punkt für jeden eingeloggten User sichtbar.
 */
export interface SettingsNavItem {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  permission?: Permission;
  description: string;
}

export const SETTINGS_NAV: SettingsNavItem[] = [
  {
    key: "account",
    label: "Konto & Sicherheit",
    href: "/settings",
    icon: User,
    description: "Eigene Daten, 2FA-Status",
  },
  {
    key: "signature",
    label: "E-Mail-Signatur",
    href: "/settings/signature",
    icon: PenLine,
    description: "Persönliche Signatur für ausgehende Mails",
  },
  {
    key: "users",
    label: "Benutzer & Rollen",
    href: "/settings/users",
    icon: Users,
    permission: "users.read",
    description: "Mitarbeiter anlegen, Rollen vergeben",
  },
  {
    key: "mailboxes",
    label: "Postfächer",
    href: "/settings/mailboxes",
    icon: Mailbox,
    permission: "mailboxes.manage",
    description: "Funktions-/Team-Postfächer & Zuweisungen",
  },
  {
    key: "templates",
    label: "Antwortvorlagen",
    href: "/settings/templates",
    icon: FileText,
    permission: "templates.manage",
    description: "Textbausteine für wiederkehrende Antworten",
  },
  {
    key: "tags",
    label: "Tags / Kategorien",
    href: "/settings/tags",
    icon: Tag,
    permission: "tags.manage",
    description: "Schlagworte zum Kategorisieren von Tickets",
  },
  {
    key: "roles",
    label: "Rechteübersicht",
    href: "/settings/roles",
    icon: ShieldCheck,
    permission: "roles.manage",
    description: "Welche Rolle welche Rechte hat",
  },
];
