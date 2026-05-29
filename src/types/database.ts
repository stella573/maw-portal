/**
 * Datenbank-Typen für den typisierten Supabase-Client.
 *
 * Hand-gepflegt für Phase 1. Sobald die Migrationen produktiv laufen, kann
 * diese Datei durch `supabase gen types typescript --linked` ersetzt werden.
 * Struktur folgt dem von @supabase/ssr erwarteten Schema.
 */

export type TicketStatus = "open" | "pending" | "resolved";
export type TicketPriority = "low" | "normal" | "high" | "urgent";
export type MessageDirection = "inbound" | "outbound";
export type MessageChannel = "email" | "internal";
export type AuditAction =
  | "auth.login"
  | "auth.logout"
  | "ticket.created"
  | "ticket.updated"
  | "ticket.status_changed"
  | "ticket.assigned"
  | "ticket.deleted"
  | "message.reply_sent"
  | "message.inbound_received"
  | "note.created"
  | "role.assigned"
  | "role.revoked"
  | "entity.deleted";

type Timestamps = { created_at: string; updated_at: string };

export interface Database {
  public: {
    Tables: {
      locations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          city: string | null;
          address: string | null;
          is_active: boolean;
        } & Timestamps;
        Insert: {
          id?: string;
          name: string;
          slug: string;
          city?: string | null;
          address?: string | null;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["locations"]["Insert"]>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          is_active: boolean;
        } & Timestamps;
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      roles: {
        Row: {
          id: string;
          key: string;
          name: string;
          description: string | null;
          rank: number;
          is_system: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          key: string;
          name: string;
          description?: string | null;
          rank?: number;
          is_system?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["roles"]["Insert"]>;
        Relationships: [];
      };
      permissions: {
        Row: { id: string; key: string; description: string | null; created_at: string };
        Insert: { id?: string; key: string; description?: string | null };
        Update: Partial<Database["public"]["Tables"]["permissions"]["Insert"]>;
        Relationships: [];
      };
      role_permissions: {
        Row: { role_id: string; permission_id: string };
        Insert: { role_id: string; permission_id: string };
        Update: Partial<{ role_id: string; permission_id: string }>;
        Relationships: [];
      };
      user_roles: {
        Row: {
          id: string;
          profile_id: string;
          role_id: string;
          location_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          role_id: string;
          location_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["user_roles"]["Insert"]>;
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          phone: string | null;
          metadata: Record<string, unknown>;
        } & Timestamps;
        Insert: {
          id?: string;
          email: string;
          full_name?: string | null;
          phone?: string | null;
          metadata?: Record<string, unknown>;
        };
        Update: Partial<Database["public"]["Tables"]["customers"]["Insert"]>;
        Relationships: [];
      };
      tags: {
        Row: { id: string; name: string; color: string; created_at: string };
        Insert: { id?: string; name: string; color?: string };
        Update: Partial<Database["public"]["Tables"]["tags"]["Insert"]>;
        Relationships: [];
      };
      tickets: {
        Row: {
          id: string;
          reference: string;
          subject: string;
          status: TicketStatus;
          priority: TicketPriority;
          customer_id: string | null;
          location_id: string | null;
          assignee_id: string | null;
          created_by: string | null;
          last_message_at: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          reference?: string;
          subject: string;
          status?: TicketStatus;
          priority?: TicketPriority;
          customer_id?: string | null;
          location_id?: string | null;
          assignee_id?: string | null;
          created_by?: string | null;
          last_message_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["tickets"]["Insert"]>;
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          ticket_id: string;
          direction: MessageDirection;
          channel: MessageChannel;
          author_id: string | null;
          from_email: string | null;
          to_email: string | null;
          subject: string | null;
          body_text: string | null;
          body_html: string | null;
          is_draft: boolean;
          provider_id: string | null;
          raw: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          ticket_id: string;
          direction: MessageDirection;
          channel?: MessageChannel;
          author_id?: string | null;
          from_email?: string | null;
          to_email?: string | null;
          subject?: string | null;
          body_text?: string | null;
          body_html?: string | null;
          is_draft?: boolean;
          provider_id?: string | null;
          raw?: Record<string, unknown> | null;
        };
        Update: Partial<Database["public"]["Tables"]["messages"]["Insert"]>;
        Relationships: [];
      };
      notes: {
        Row: {
          id: string;
          ticket_id: string;
          author_id: string | null;
          body: string;
          created_at: string;
        };
        Insert: { id?: string; ticket_id: string; author_id?: string | null; body: string };
        Update: Partial<Database["public"]["Tables"]["notes"]["Insert"]>;
        Relationships: [];
      };
      ticket_tags: {
        Row: { ticket_id: string; tag_id: string };
        Insert: { ticket_id: string; tag_id: string };
        Update: Partial<{ ticket_id: string; tag_id: string }>;
        Relationships: [];
      };
      templates: {
        Row: {
          id: string;
          name: string;
          subject: string | null;
          body: string;
          location_id: string | null;
          created_by: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          name: string;
          subject?: string | null;
          body: string;
          location_id?: string | null;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["templates"]["Insert"]>;
        Relationships: [];
      };
      attachments: {
        Row: {
          id: string;
          message_id: string | null;
          ticket_id: string | null;
          storage_path: string;
          file_name: string;
          content_type: string | null;
          size_bytes: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          message_id?: string | null;
          ticket_id?: string | null;
          storage_path: string;
          file_name: string;
          content_type?: string | null;
          size_bytes?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["attachments"]["Insert"]>;
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          actor_profile_id: string | null;
          action: AuditAction;
          entity_type: string | null;
          entity_id: string | null;
          location_id: string | null;
          metadata: Record<string, unknown>;
          ip: string | null;
          created_at: string;
        };
        Insert: never; // nur über public.log_audit() schreiben
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      log_audit: {
        Args: {
          p_action: AuditAction;
          p_entity_type?: string | null;
          p_entity_id?: string | null;
          p_location_id?: string | null;
          p_metadata?: Record<string, unknown>;
        };
        Returns: string;
      };
    };
    Enums: {
      ticket_status: TicketStatus;
      ticket_priority: TicketPriority;
      message_direction: MessageDirection;
      message_channel: MessageChannel;
      audit_action: AuditAction;
    };
    CompositeTypes: Record<never, never>;
  };
}

// Komfort-Aliase
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type InsertDto<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type UpdateDto<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
