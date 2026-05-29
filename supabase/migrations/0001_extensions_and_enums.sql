-- ============================================================================
-- 0001 · Extensions, Enums & gemeinsame Helfer
-- ============================================================================
-- Grundlage für alle weiteren Migrationen. Reihenfolge der Dateien = Reihenfolge
-- der Ausführung.

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "citext";         -- case-insensitive E-Mail

-- ----------------------------------------------------------------------------
-- Privates Schema für interne Helfer (nicht über die API exponiert)
-- ----------------------------------------------------------------------------
create schema if not exists private;

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
create type public.ticket_status as enum ('open', 'pending', 'resolved');

create type public.ticket_priority as enum ('low', 'normal', 'high', 'urgent');

create type public.message_direction as enum ('inbound', 'outbound');

create type public.message_channel as enum ('email', 'internal');

create type public.audit_action as enum (
  'auth.login',
  'auth.logout',
  'ticket.created',
  'ticket.updated',
  'ticket.status_changed',
  'ticket.assigned',
  'ticket.deleted',
  'message.reply_sent',
  'message.inbound_received',
  'note.created',
  'role.assigned',
  'role.revoked',
  'entity.deleted'
);

-- ----------------------------------------------------------------------------
-- Gemeinsame Trigger-Funktion: updated_at pflegen
-- ----------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
