import type { Tables } from "@/types/database";

/**
 * Fachliche Typen des MailDesk-Moduls. Bauen auf den DB-Row-Typen auf und
 * kapseln Aggregate (z. B. Ticket inkl. Kunde, Tags, letzter Nachricht), die
 * von Services/Komponenten innerhalb des Moduls verwendet werden.
 */

export type Ticket = Tables<"tickets">;
export type Message = Tables<"messages">;
export type Customer = Tables<"customers">;
export type Note = Tables<"notes">;
export type Tag = Tables<"tags">;
export type Template = Tables<"templates">;

/** Ticket-Listeneintrag mit den für die Inbox nötigen Joins. */
export interface TicketListItem extends Ticket {
  customer: Pick<Customer, "id" | "email" | "full_name"> | null;
  tags: Pick<Tag, "id" | "name" | "color">[];
}

/** Vollständiges Ticket-Aggregat für die Detailansicht. */
export interface TicketDetail extends Ticket {
  customer: Customer | null;
  messages: Message[];
  notes: Note[];
  tags: Tag[];
}

export const TICKET_STATUS_LABELS: Record<Ticket["status"], string> = {
  open: "Offen",
  pending: "Wartend",
  resolved: "Erledigt",
};

export const TICKET_PRIORITY_LABELS: Record<Ticket["priority"], string> = {
  low: "Niedrig",
  normal: "Normal",
  high: "Hoch",
  urgent: "Dringend",
};
