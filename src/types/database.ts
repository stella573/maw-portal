/**
 * Datenbank-Typen für den typisierten Supabase-Client.
 *
 * Hand-gepflegt für Phase 1, in der Struktur, die `supabase gen types
 * typescript` erzeugt (inkl. `__InternalSupabase`, inline Timestamp-Spalten,
 * explizite Insert/Update). Sobald die Migrationen produktiv laufen, kann die
 * Datei durch `supabase gen types typescript --linked` ersetzt werden.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type TicketStatus = "open" | "pending" | "resolved";
export type TicketPriority = "low" | "normal" | "high" | "urgent";
export type MessageDirection = "inbound" | "outbound";
export type MessageChannel = "email" | "internal";
/** Fachliches KI-Urteil zu einem Anhang (siehe attachment_ai_analysis). */
export type InvoiceClassification =
  | "invoice"
  | "not_invoice"
  | "unclear"
  | "unsupported_file_type"
  | "error";
/** Status-Lebenszyklus eines Rechnungsverarbeitungs-Jobs. */
export type InvoiceJobStatus =
  | "uploaded"
  | "ai_check_started"
  | "unsupported_file_type"
  | "not_invoice"
  | "invoice_detected"
  | "extraction_started"
  | "extraction_completed"
  | "supplier_matching_started"
  | "supplier_matched"
  | "supplier_match_unclear"
  | "needs_manual_supplier_review"
  | "getmyinvoices_upload_started"
  | "getmyinvoices_upload_completed"
  | "getmyinvoices_upload_failed"
  | "skipped_receipt"
  | "error";
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
  | "entity.deleted"
  | "mfa.enrolled"
  | "mfa.verified"
  | "mfa.unenrolled"
  | "mfa.challenge_failed"
  | "user.created"
  | "user.updated"
  | "mfa.reset_by_admin"
  | "auth.password_changed"
  | "mailbox.created"
  | "mailbox.updated"
  | "mailbox.member_added"
  | "mailbox.member_removed"
  | "role.permission_granted"
  | "role.permission_revoked";

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
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
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          city?: string | null;
          address?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          city?: string | null;
          address?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          signature_html: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          signature_html?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          signature_html?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
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
          created_at?: string;
        };
        Update: {
          id?: string;
          key?: string;
          name?: string;
          description?: string | null;
          rank?: number;
          is_system?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      permissions: {
        Row: {
          id: string;
          key: string;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          key: string;
          description?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          key?: string;
          description?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      role_permissions: {
        Row: {
          role_id: string;
          permission_id: string;
        };
        Insert: {
          role_id: string;
          permission_id: string;
        };
        Update: {
          role_id?: string;
          permission_id?: string;
        };
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
          created_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          role_id?: string;
          location_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          phone: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          full_name?: string | null;
          phone?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          phone?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tags: {
        Row: {
          id: string;
          name: string;
          color: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          color?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          color?: string;
          created_at?: string;
        };
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
          mailbox_id: string | null;
          assignee_id: string | null;
          created_by: string | null;
          last_message_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          reference?: string;
          subject: string;
          status?: TicketStatus;
          priority?: TicketPriority;
          customer_id?: string | null;
          location_id?: string | null;
          mailbox_id?: string | null;
          assignee_id?: string | null;
          created_by?: string | null;
          last_message_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          reference?: string;
          subject?: string;
          status?: TicketStatus;
          priority?: TicketPriority;
          customer_id?: string | null;
          location_id?: string | null;
          mailbox_id?: string | null;
          assignee_id?: string | null;
          created_by?: string | null;
          last_message_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      mailboxes: {
        Row: {
          id: string;
          name: string;
          email: string;
          location_id: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          email: string;
          location_id?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          email?: string;
          location_id?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      mailbox_members: {
        Row: {
          mailbox_id: string;
          profile_id: string;
          created_at: string;
        };
        Insert: {
          mailbox_id: string;
          profile_id: string;
          created_at?: string;
        };
        Update: {
          mailbox_id?: string;
          profile_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      getmyinvoices_connection: {
        Row: {
          id: boolean;
          base_url: string;
          api_key: string;
          account_id: string | null;
          is_active: boolean;
          last_verified_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: boolean;
          base_url?: string;
          api_key: string;
          account_id?: string | null;
          is_active?: boolean;
          last_verified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: boolean;
          base_url?: string;
          api_key?: string;
          account_id?: string | null;
          is_active?: boolean;
          last_verified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      roller_connections: {
        Row: {
          location_id: string;
          base_url: string;
          client_id: string;
          client_secret: string;
          is_active: boolean;
          venue_name: string | null;
          last_verified_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          location_id: string;
          base_url?: string;
          client_id: string;
          client_secret: string;
          is_active?: boolean;
          venue_name?: string | null;
          last_verified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          location_id?: string;
          base_url?: string;
          client_id?: string;
          client_secret?: string;
          is_active?: boolean;
          venue_name?: string | null;
          last_verified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      personio_employees: {
        Row: {
          personio_id: number;
          email: string | null;
          first_name: string | null;
          last_name: string | null;
          position: string | null;
          department: string | null;
          office: string | null;
          status: string;
          profile_id: string | null;
          location_id: string | null;
          synced_at: string;
          created_at: string;
        };
        Insert: {
          personio_id: number;
          email?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          position?: string | null;
          department?: string | null;
          office?: string | null;
          status?: string;
          profile_id?: string | null;
          location_id?: string | null;
          synced_at?: string;
          created_at?: string;
        };
        Update: {
          personio_id?: number;
          email?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          position?: string | null;
          department?: string | null;
          office?: string | null;
          status?: string;
          profile_id?: string | null;
          location_id?: string | null;
          synced_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      mailbox_aliases: {
        Row: {
          id: string;
          mailbox_id: string;
          email: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          mailbox_id: string;
          email: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          mailbox_id?: string;
          email?: string;
          created_at?: string;
        };
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
          raw: Json | null;
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
          raw?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          ticket_id?: string;
          direction?: MessageDirection;
          channel?: MessageChannel;
          author_id?: string | null;
          from_email?: string | null;
          to_email?: string | null;
          subject?: string | null;
          body_text?: string | null;
          body_html?: string | null;
          is_draft?: boolean;
          provider_id?: string | null;
          raw?: Json | null;
          created_at?: string;
        };
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
        Insert: {
          id?: string;
          ticket_id: string;
          author_id?: string | null;
          body: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          ticket_id?: string;
          author_id?: string | null;
          body?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      ticket_tags: {
        Row: {
          ticket_id: string;
          tag_id: string;
        };
        Insert: {
          ticket_id: string;
          tag_id: string;
        };
        Update: {
          ticket_id?: string;
          tag_id?: string;
        };
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
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          subject?: string | null;
          body: string;
          location_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          subject?: string | null;
          body?: string;
          location_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
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
          provider_attachment_id: string | null;
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
          provider_attachment_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          message_id?: string | null;
          ticket_id?: string | null;
          storage_path?: string;
          file_name?: string;
          content_type?: string | null;
          size_bytes?: number | null;
          provider_attachment_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      invoice_processing_jobs: {
        Row: {
          id: string;
          attachment_id: string;
          file_hash: string | null;
          status: InvoiceJobStatus;
          is_invoice: boolean;
          invoice_confidence: number;
          classification: InvoiceClassification;
          supplier_match_score: number;
          matched_supplier_id: string | null;
          matched_supplier_name: string | null;
          supplier_match_reason: string | null;
          manual_supplier_confirmed: boolean;
          getmyinvoices_document_id: string | null;
          getmyinvoices_already_existed: boolean;
          model_used: string | null;
          error_message: string | null;
          raw_claude_response: Json | null;
          raw_getmyinvoices_response: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          attachment_id: string;
          file_hash?: string | null;
          status?: InvoiceJobStatus;
          is_invoice?: boolean;
          invoice_confidence?: number;
          classification?: InvoiceClassification;
          supplier_match_score?: number;
          matched_supplier_id?: string | null;
          matched_supplier_name?: string | null;
          supplier_match_reason?: string | null;
          manual_supplier_confirmed?: boolean;
          getmyinvoices_document_id?: string | null;
          getmyinvoices_already_existed?: boolean;
          model_used?: string | null;
          error_message?: string | null;
          raw_claude_response?: Json | null;
          raw_getmyinvoices_response?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          attachment_id?: string;
          file_hash?: string | null;
          status?: InvoiceJobStatus;
          is_invoice?: boolean;
          invoice_confidence?: number;
          classification?: InvoiceClassification;
          supplier_match_score?: number;
          matched_supplier_id?: string | null;
          matched_supplier_name?: string | null;
          supplier_match_reason?: string | null;
          manual_supplier_confirmed?: boolean;
          getmyinvoices_document_id?: string | null;
          getmyinvoices_already_existed?: boolean;
          model_used?: string | null;
          error_message?: string | null;
          raw_claude_response?: Json | null;
          raw_getmyinvoices_response?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invoice_processing_jobs_attachment_id_fkey";
            columns: ["attachment_id"];
            referencedRelation: "attachments";
            referencedColumns: ["id"];
          },
        ];
      };
      extracted_invoice_data: {
        Row: {
          id: string;
          attachment_id: string;
          invoice_processing_job_id: string;
          vendor_name: string | null;
          vendor_address: string | null;
          vendor_vat_id: string | null;
          vendor_tax_number: string | null;
          vendor_iban: string | null;
          vendor_email: string | null;
          vendor_website: string | null;
          vendor_country: string | null;
          invoice_number: string | null;
          invoice_date: string | null;
          service_date: string | null;
          due_date: string | null;
          net_amount: number | null;
          tax_amount: number | null;
          gross_amount: number | null;
          currency: string | null;
          customer_number: string | null;
          order_reference: string | null;
          description: string | null;
          payment_status: string | null;
          document_language: string | null;
          line_items: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          attachment_id: string;
          invoice_processing_job_id: string;
          vendor_name?: string | null;
          vendor_address?: string | null;
          vendor_vat_id?: string | null;
          vendor_tax_number?: string | null;
          vendor_iban?: string | null;
          vendor_email?: string | null;
          vendor_website?: string | null;
          vendor_country?: string | null;
          invoice_number?: string | null;
          invoice_date?: string | null;
          service_date?: string | null;
          due_date?: string | null;
          net_amount?: number | null;
          tax_amount?: number | null;
          gross_amount?: number | null;
          currency?: string | null;
          customer_number?: string | null;
          order_reference?: string | null;
          description?: string | null;
          payment_status?: string | null;
          document_language?: string | null;
          line_items?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          attachment_id?: string;
          invoice_processing_job_id?: string;
          vendor_name?: string | null;
          vendor_address?: string | null;
          vendor_vat_id?: string | null;
          vendor_tax_number?: string | null;
          vendor_iban?: string | null;
          vendor_email?: string | null;
          vendor_website?: string | null;
          vendor_country?: string | null;
          invoice_number?: string | null;
          invoice_date?: string | null;
          service_date?: string | null;
          due_date?: string | null;
          net_amount?: number | null;
          tax_amount?: number | null;
          gross_amount?: number | null;
          currency?: string | null;
          customer_number?: string | null;
          order_reference?: string | null;
          description?: string | null;
          payment_status?: string | null;
          document_language?: string | null;
          line_items?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "extracted_invoice_data_attachment_id_fkey";
            columns: ["attachment_id"];
            referencedRelation: "attachments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "extracted_invoice_data_invoice_processing_job_id_fkey";
            columns: ["invoice_processing_job_id"];
            referencedRelation: "invoice_processing_jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          id: string;
          actor_profile_id: string | null;
          action: AuditAction;
          entity_type: string | null;
          entity_id: string | null;
          location_id: string | null;
          metadata: Json;
          ip: string | null;
          created_at: string;
        };
        // Direkte Inserts/Updates sind per RLS gesperrt – ausschließlich über
        // public.log_audit() schreiben. Die Typen beschreiben die Spalten nur
        // der Vollständigkeit halber.
        Insert: {
          id?: string;
          actor_profile_id?: string | null;
          action: AuditAction;
          entity_type?: string | null;
          entity_id?: string | null;
          location_id?: string | null;
          metadata?: Json;
          ip?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          actor_profile_id?: string | null;
          action?: AuditAction;
          entity_type?: string | null;
          entity_id?: string | null;
          location_id?: string | null;
          metadata?: Json;
          ip?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      log_audit: {
        Args: {
          p_action: AuditAction;
          p_entity_type?: string | null;
          p_entity_id?: string | null;
          p_location_id?: string | null;
          p_metadata?: Json;
        };
        Returns: string;
      };
      ticket_last_messages: {
        Args: {
          p_ticket_ids: string[];
        };
        Returns: {
          ticket_id: string;
          direction: MessageDirection;
          preview: string | null;
        }[];
      };
      set_user_signature: {
        Args: {
          p_profile_id: string;
          p_html: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      ticket_status: TicketStatus;
      ticket_priority: TicketPriority;
      message_direction: MessageDirection;
      message_channel: MessageChannel;
      audit_action: AuditAction;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type PublicSchema = Database["public"];

// Komfort-Aliase
export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];
export type InsertDto<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];
export type UpdateDto<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];
