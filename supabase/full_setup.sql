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
-- ============================================================================
-- 0002 · Kern-Identität: Standorte, Profile, Rollen, Rechte, Zuweisungen
-- ============================================================================

-- ----------------------------------------------------------------------------
-- locations · Standorte (Basis für Scoping, CRM, Dienstplan)
-- ----------------------------------------------------------------------------
create table public.locations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  city        text,
  address     text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_locations_updated_at
  before update on public.locations
  for each row execute function private.set_updated_at();

-- ----------------------------------------------------------------------------
-- profiles · 1:1 zu auth.users
-- ----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       citext not null unique,
  full_name   text,
  avatar_url  text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- Auto-Provisioning: bei neuem auth.users-Eintrag ein Profil anlegen
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger trg_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ----------------------------------------------------------------------------
-- roles · Rollendefinition
-- ----------------------------------------------------------------------------
create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,         -- owner | admin | location_manager | employee
  name        text not null,
  description text,
  rank        int  not null default 0,      -- höhere Zahl = mehr Reichweite (nur informativ)
  is_system   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- permissions · atomare Rechte
-- ----------------------------------------------------------------------------
create table public.permissions (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,         -- z.B. tickets.read, tickets.reply
  description text,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- role_permissions · n:m Rolle ↔ Recht
-- ----------------------------------------------------------------------------
create table public.role_permissions (
  role_id        uuid not null references public.roles(id) on delete cascade,
  permission_id  uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create index idx_role_permissions_permission on public.role_permissions(permission_id);

-- ----------------------------------------------------------------------------
-- user_roles · n:m Profil ↔ Rolle, optional pro Standort
--   location_id NULL = global wirksame Rolle
-- ----------------------------------------------------------------------------
create table public.user_roles (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  role_id      uuid not null references public.roles(id) on delete cascade,
  location_id  uuid references public.locations(id) on delete cascade,
  created_at   timestamptz not null default now(),
  -- gleiche Rolle pro (Profil, Standort) nur einmal; NULL-Standort separat behandelt
  unique nulls not distinct (profile_id, role_id, location_id)
);

create index idx_user_roles_profile  on public.user_roles(profile_id);
create index idx_user_roles_location on public.user_roles(location_id);
create index idx_user_roles_role     on public.user_roles(role_id);
-- ============================================================================
-- 0003 · MailDesk · Ticketsystem
-- ============================================================================

-- ----------------------------------------------------------------------------
-- customers · Kontakte / Absender (über E-Mail dedupliziert)
-- ----------------------------------------------------------------------------
create table public.customers (
  id          uuid primary key default gen_random_uuid(),
  email       citext not null unique,
  full_name   text,
  phone       text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_customers_updated_at
  before update on public.customers
  for each row execute function private.set_updated_at();

-- ----------------------------------------------------------------------------
-- tags · frei definierbare Schlagworte
-- ----------------------------------------------------------------------------
create table public.tags (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  color       text not null default '#64748b',
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- tickets · Vorgang
-- ----------------------------------------------------------------------------
create table public.tickets (
  id              uuid primary key default gen_random_uuid(),
  reference       text not null unique default ('MAW-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  subject         text not null,
  status          public.ticket_status   not null default 'open',
  priority        public.ticket_priority not null default 'normal',
  customer_id     uuid references public.customers(id) on delete set null,
  location_id     uuid references public.locations(id) on delete set null,
  assignee_id     uuid references public.profiles(id) on delete set null,
  created_by      uuid references public.profiles(id) on delete set null,
  last_message_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_tickets_status        on public.tickets(status);
create index idx_tickets_priority      on public.tickets(priority);
create index idx_tickets_location      on public.tickets(location_id);
create index idx_tickets_assignee      on public.tickets(assignee_id);
create index idx_tickets_customer      on public.tickets(customer_id);
create index idx_tickets_last_message  on public.tickets(last_message_at desc);
-- Volltext-Suche über Betreff (einfacher Start; FTS-Ausbau in Phase 1.3)
create index idx_tickets_subject_trgm  on public.tickets using gin (to_tsvector('simple', subject));

create trigger trg_tickets_updated_at
  before update on public.tickets
  for each row execute function private.set_updated_at();

-- ----------------------------------------------------------------------------
-- messages · Nachrichten eines Tickets (inbound/outbound)
-- ----------------------------------------------------------------------------
create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  ticket_id       uuid not null references public.tickets(id) on delete cascade,
  direction       public.message_direction not null,
  channel         public.message_channel   not null default 'email',
  author_id       uuid references public.profiles(id) on delete set null, -- bei outbound
  from_email      citext,
  to_email        citext,
  subject         text,
  body_text       text,
  body_html       text,
  is_draft        boolean not null default false,
  provider_id     text,        -- Resend message id
  raw             jsonb,       -- Rohdaten des eingehenden Webhooks
  created_at      timestamptz not null default now()
);

create index idx_messages_ticket    on public.messages(ticket_id, created_at);
create index idx_messages_direction on public.messages(direction);
create index idx_messages_draft     on public.messages(ticket_id) where is_draft = true;

-- Ticket.last_message_at bei neuer (nicht-Entwurf) Nachricht aktualisieren
create or replace function private.touch_ticket_last_message()
returns trigger
language plpgsql
as $$
begin
  if new.is_draft is false then
    update public.tickets
      set last_message_at = new.created_at,
          updated_at = now()
    where id = new.ticket_id;
  end if;
  return new;
end;
$$;

create trigger trg_messages_touch_ticket
  after insert on public.messages
  for each row execute function private.touch_ticket_last_message();

-- ----------------------------------------------------------------------------
-- notes · interne Notizen (nie für Kunden sichtbar)
-- ----------------------------------------------------------------------------
create table public.notes (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.tickets(id) on delete cascade,
  author_id   uuid references public.profiles(id) on delete set null,
  body        text not null,
  created_at  timestamptz not null default now()
);

create index idx_notes_ticket on public.notes(ticket_id, created_at);

-- ----------------------------------------------------------------------------
-- ticket_tags · n:m Ticket ↔ Tag
-- ----------------------------------------------------------------------------
create table public.ticket_tags (
  ticket_id   uuid not null references public.tickets(id) on delete cascade,
  tag_id      uuid not null references public.tags(id) on delete cascade,
  primary key (ticket_id, tag_id)
);

create index idx_ticket_tags_tag on public.ticket_tags(tag_id);

-- ----------------------------------------------------------------------------
-- templates · Antwortvorlagen
-- ----------------------------------------------------------------------------
create table public.templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  subject     text,
  body        text not null,
  location_id uuid references public.locations(id) on delete cascade, -- NULL = global
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_templates_location on public.templates(location_id);

create trigger trg_templates_updated_at
  before update on public.templates
  for each row execute function private.set_updated_at();

-- ----------------------------------------------------------------------------
-- attachments · Metadaten zu Anhängen (Supabase Storage), vorbereitet
-- ----------------------------------------------------------------------------
create table public.attachments (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid references public.messages(id) on delete cascade,
  ticket_id    uuid references public.tickets(id) on delete cascade,
  storage_path text not null,         -- Pfad im Storage-Bucket
  file_name    text not null,
  content_type text,
  size_bytes   bigint,
  created_at   timestamptz not null default now()
);

create index idx_attachments_message on public.attachments(message_id);
create index idx_attachments_ticket  on public.attachments(ticket_id);
-- ============================================================================
-- 0004 · Audit-Log (append-only)
-- ============================================================================

create table public.audit_logs (
  id                uuid primary key default gen_random_uuid(),
  actor_profile_id  uuid references public.profiles(id) on delete set null,
  action            public.audit_action not null,
  entity_type       text,
  entity_id         uuid,
  location_id       uuid references public.locations(id) on delete set null,
  metadata          jsonb not null default '{}'::jsonb,
  ip                inet,
  created_at        timestamptz not null default now()
);

create index idx_audit_actor    on public.audit_logs(actor_profile_id);
create index idx_audit_action   on public.audit_logs(action);
create index idx_audit_entity   on public.audit_logs(entity_type, entity_id);
create index idx_audit_location on public.audit_logs(location_id);
create index idx_audit_created  on public.audit_logs(created_at desc);

-- ----------------------------------------------------------------------------
-- Schreib-Helfer (SECURITY DEFINER): erlaubt kontrolliertes Insert aus dem
-- Service-Layer/Triggern, ohne ein generisches INSERT-Recht zu öffnen.
-- ----------------------------------------------------------------------------
create or replace function public.log_audit(
  p_action       public.audit_action,
  p_entity_type  text default null,
  p_entity_id    uuid default null,
  p_location_id  uuid default null,
  p_metadata     jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_id    uuid;
begin
  -- aktuelles Profil aus dem JWT (NULL bei Service-Role/System)
  v_actor := nullif(auth.uid()::text, '')::uuid;

  insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id, location_id, metadata)
  values (v_actor, p_action, p_entity_type, p_entity_id, p_location_id, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- DB-seitiger Trigger: Ticket-Statuswechsel automatisch protokollieren.
-- (Service-Layer protokolliert zusätzlich fachliche Aktionen.)
-- ----------------------------------------------------------------------------
create or replace function private.audit_ticket_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    perform public.log_audit(
      'ticket.status_changed',
      'ticket',
      new.id,
      new.location_id,
      jsonb_build_object('from', old.status, 'to', new.status)
    );
  end if;
  return new;
end;
$$;

create trigger trg_tickets_audit_status
  after update on public.tickets
  for each row execute function private.audit_ticket_status_change();
-- ============================================================================
-- 0005 · Row Level Security · Helfer-Funktionen & Policies
-- ============================================================================
-- Prinzip: Default-Deny. RLS auf allen Tabellen ENABLE + FORCE.
-- Helfer sind SECURITY DEFINER (Eigentümer = postgres → BYPASSRLS in Supabase),
-- dadurch keine Policy-Rekursion bei Abfragen auf user_roles/role_permissions.

-- ----------------------------------------------------------------------------
-- Helfer-Funktionen
-- ----------------------------------------------------------------------------

-- Aktuelle Profil-UUID (== auth.uid()); NULL wenn nicht eingeloggt.
create or replace function private.auth_profile_id()
returns uuid
language sql
stable
as $$
  select nullif(auth.uid()::text, '')::uuid;
$$;

-- Hat der eingeloggte User das Recht `perm`?
--   loc = NULL  → "irgendwo" (global oder an einem beliebigen Standort)
--   loc gesetzt → global ODER für genau diesen Standort
create or replace function private.has_permission(perm text, loc uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    where ur.profile_id = private.auth_profile_id()
      and p.key = perm
      and (
        ur.location_id is null   -- global wirksame Rolle
        or loc is null           -- Aufrufer fragt "irgendwo"
        or ur.location_id = loc   -- standortgebundene Rolle passt
      )
  );
$$;

-- Globale Verwaltungsrolle (owner/admin, location_id IS NULL)?
create or replace function private.is_owner_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.profile_id = private.auth_profile_id()
      and ur.location_id is null
      and r.key in ('owner', 'admin')
  );
$$;

-- Verwaltet der User den Standort (owner/admin global ODER location_manager)?
create or replace function private.manages_location(loc uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.is_owner_or_admin()
      or exists (
        select 1
        from public.user_roles ur
        join public.roles r on r.id = ur.role_id
        where ur.profile_id = private.auth_profile_id()
          and r.key = 'location_manager'
          and ur.location_id = loc
      );
$$;

-- ============================================================================
-- RLS aktivieren (ENABLE + FORCE) auf allen fachlichen Tabellen
-- ============================================================================
alter table public.locations        enable row level security;
alter table public.profiles         enable row level security;
alter table public.roles            enable row level security;
alter table public.permissions      enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles       enable row level security;
alter table public.customers        enable row level security;
alter table public.tags             enable row level security;
alter table public.tickets          enable row level security;
alter table public.messages         enable row level security;
alter table public.notes            enable row level security;
alter table public.ticket_tags      enable row level security;
alter table public.templates        enable row level security;
alter table public.attachments      enable row level security;
alter table public.audit_logs       enable row level security;

alter table public.locations        force row level security;
alter table public.profiles         force row level security;
alter table public.roles            force row level security;
alter table public.permissions      force row level security;
alter table public.role_permissions force row level security;
alter table public.user_roles       force row level security;
alter table public.customers        force row level security;
alter table public.tags             force row level security;
alter table public.tickets          force row level security;
alter table public.messages         force row level security;
alter table public.notes            force row level security;
alter table public.ticket_tags      force row level security;
alter table public.templates        force row level security;
alter table public.attachments      force row level security;
alter table public.audit_logs       force row level security;

-- ============================================================================
-- Policies
-- ============================================================================

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
create policy profiles_select on public.profiles
  for select using (
    id = private.auth_profile_id()
    or private.has_permission('users.read')
  );

create policy profiles_update_self on public.profiles
  for update using (id = private.auth_profile_id())
  with check (id = private.auth_profile_id());

create policy profiles_update_admin on public.profiles
  for update using (private.has_permission('users.manage'))
  with check (private.has_permission('users.manage'));

create policy profiles_delete on public.profiles
  for delete using (private.has_permission('users.manage'));
-- INSERT: nur über SECURITY-DEFINER-Trigger (handle_new_user) → keine Policy.

-- ----------------------------------------------------------------------------
-- locations · jeder eingeloggte User darf lesen; Verwaltung gesondert
-- ----------------------------------------------------------------------------
create policy locations_select on public.locations
  for select using (private.auth_profile_id() is not null);

create policy locations_write on public.locations
  for all using (private.has_permission('locations.manage'))
  with check (private.has_permission('locations.manage'));

-- ----------------------------------------------------------------------------
-- roles / permissions / role_permissions
--   Lesen: alle eingeloggten User (für UI-Gating). Schreiben: roles.manage.
-- ----------------------------------------------------------------------------
create policy roles_select on public.roles
  for select using (private.auth_profile_id() is not null);
create policy roles_write on public.roles
  for all using (private.has_permission('roles.manage'))
  with check (private.has_permission('roles.manage'));

create policy permissions_select on public.permissions
  for select using (private.auth_profile_id() is not null);
create policy permissions_write on public.permissions
  for all using (private.has_permission('roles.manage'))
  with check (private.has_permission('roles.manage'));

create policy role_permissions_select on public.role_permissions
  for select using (private.auth_profile_id() is not null);
create policy role_permissions_write on public.role_permissions
  for all using (private.has_permission('roles.manage'))
  with check (private.has_permission('roles.manage'));

-- ----------------------------------------------------------------------------
-- user_roles · eigene sehen; Vergabe nur mit roles.manage
-- ----------------------------------------------------------------------------
create policy user_roles_select on public.user_roles
  for select using (
    profile_id = private.auth_profile_id()
    or private.has_permission('users.read')
  );

create policy user_roles_write on public.user_roles
  for all using (private.has_permission('roles.manage'))
  with check (private.has_permission('roles.manage'));

-- ----------------------------------------------------------------------------
-- customers
-- ----------------------------------------------------------------------------
create policy customers_select on public.customers
  for select using (private.has_permission('customers.read'));
create policy customers_write on public.customers
  for all using (private.has_permission('customers.manage'))
  with check (private.has_permission('customers.manage'));

-- ----------------------------------------------------------------------------
-- tags · lesen für alle eingeloggten; Verwaltung mit tags.manage
-- ----------------------------------------------------------------------------
create policy tags_select on public.tags
  for select using (private.auth_profile_id() is not null);
create policy tags_write on public.tags
  for all using (private.has_permission('tags.manage'))
  with check (private.has_permission('tags.manage'));

-- ----------------------------------------------------------------------------
-- tickets · standortbezogenes Scoping
-- ----------------------------------------------------------------------------
create policy tickets_select on public.tickets
  for select using (
    private.has_permission('tickets.read', location_id)
    or assignee_id = private.auth_profile_id()
  );

create policy tickets_insert on public.tickets
  for insert with check (private.has_permission('tickets.create', location_id));

create policy tickets_update on public.tickets
  for update using (private.has_permission('tickets.update', location_id))
  with check (private.has_permission('tickets.update', location_id));

create policy tickets_delete on public.tickets
  for delete using (private.has_permission('tickets.delete', location_id));

-- ----------------------------------------------------------------------------
-- messages · an Ticket-Berechtigung gekoppelt
-- ----------------------------------------------------------------------------
create policy messages_select on public.messages
  for select using (
    exists (
      select 1 from public.tickets t
      where t.id = messages.ticket_id
        and (private.has_permission('tickets.read', t.location_id)
             or t.assignee_id = private.auth_profile_id())
    )
  );

create policy messages_insert on public.messages
  for insert with check (
    exists (
      select 1 from public.tickets t
      where t.id = messages.ticket_id
        and private.has_permission('tickets.reply', t.location_id)
    )
  );

create policy messages_update on public.messages
  for update using (
    -- Entwürfe des eigenen Users dürfen bearbeitet werden
    author_id = private.auth_profile_id() and is_draft = true
  )
  with check (author_id = private.auth_profile_id());

create policy messages_delete on public.messages
  for delete using (
    exists (
      select 1 from public.tickets t
      where t.id = messages.ticket_id
        and private.has_permission('tickets.delete', t.location_id)
    )
  );

-- ----------------------------------------------------------------------------
-- notes · interne Notizen
-- ----------------------------------------------------------------------------
create policy notes_select on public.notes
  for select using (
    exists (
      select 1 from public.tickets t
      where t.id = notes.ticket_id
        and (private.has_permission('tickets.read', t.location_id)
             or t.assignee_id = private.auth_profile_id())
    )
  );

create policy notes_insert on public.notes
  for insert with check (
    exists (
      select 1 from public.tickets t
      where t.id = notes.ticket_id
        and private.has_permission('notes.create', t.location_id)
    )
  );

create policy notes_delete on public.notes
  for delete using (
    author_id = private.auth_profile_id()
    or exists (
      select 1 from public.tickets t
      where t.id = notes.ticket_id
        and private.has_permission('tickets.delete', t.location_id)
    )
  );

-- ----------------------------------------------------------------------------
-- ticket_tags
-- ----------------------------------------------------------------------------
create policy ticket_tags_select on public.ticket_tags
  for select using (
    exists (
      select 1 from public.tickets t
      where t.id = ticket_tags.ticket_id
        and (private.has_permission('tickets.read', t.location_id)
             or t.assignee_id = private.auth_profile_id())
    )
  );

create policy ticket_tags_write on public.ticket_tags
  for all using (
    exists (
      select 1 from public.tickets t
      where t.id = ticket_tags.ticket_id
        and private.has_permission('tickets.update', t.location_id)
    )
  )
  with check (
    exists (
      select 1 from public.tickets t
      where t.id = ticket_tags.ticket_id
        and private.has_permission('tickets.update', t.location_id)
    )
  );

-- ----------------------------------------------------------------------------
-- templates · lesen mit templates.read; Verwaltung mit templates.manage
-- ----------------------------------------------------------------------------
create policy templates_select on public.templates
  for select using (private.has_permission('templates.read'));
create policy templates_write on public.templates
  for all using (private.has_permission('templates.manage'))
  with check (private.has_permission('templates.manage'));

-- ----------------------------------------------------------------------------
-- attachments · an Ticket-Berechtigung gekoppelt
-- ----------------------------------------------------------------------------
create policy attachments_select on public.attachments
  for select using (
    exists (
      select 1 from public.tickets t
      where t.id = attachments.ticket_id
        and (private.has_permission('tickets.read', t.location_id)
             or t.assignee_id = private.auth_profile_id())
    )
  );

create policy attachments_write on public.attachments
  for all using (
    exists (
      select 1 from public.tickets t
      where t.id = attachments.ticket_id
        and private.has_permission('tickets.reply', t.location_id)
    )
  )
  with check (
    exists (
      select 1 from public.tickets t
      where t.id = attachments.ticket_id
        and private.has_permission('tickets.reply', t.location_id)
    )
  );

-- ----------------------------------------------------------------------------
-- audit_logs · append-only. Lesen: audit.read. Schreiben: nur via log_audit().
--   Kein INSERT/UPDATE/DELETE-Policy → über RLS gesperrt.
-- ----------------------------------------------------------------------------
create policy audit_select on public.audit_logs
  for select using (private.has_permission('audit.read'));
-- ============================================================================
-- 0006 · MFA-bezogene Audit-Aktionen
-- ============================================================================
-- Erweitert das audit_action-Enum um Zwei-Faktor-Ereignisse.
-- ALTER TYPE ... ADD VALUE ist idempotent über IF NOT EXISTS.

alter type public.audit_action add value if not exists 'mfa.enrolled';
alter type public.audit_action add value if not exists 'mfa.verified';
alter type public.audit_action add value if not exists 'mfa.unenrolled';
alter type public.audit_action add value if not exists 'mfa.challenge_failed';

-- Benutzerverwaltung
alter type public.audit_action add value if not exists 'user.created';
alter type public.audit_action add value if not exists 'user.updated';
alter type public.audit_action add value if not exists 'mfa.reset_by_admin';
alter type public.audit_action add value if not exists 'auth.password_changed';
-- ============================================================================
-- 0007 · MailDesk: Postfächer (Funktions-/Team-Postfächer) + Mitgliedschaften
-- ============================================================================
-- Modell:
--   - mailboxes:        Funktionsadressen (info@, support@, lasertag@ …)
--   - mailbox_members:  explizite Zuweisung, WER ein Postfach sehen/bearbeiten darf
--   - tickets.mailbox_id: jedes Ticket gehört zu genau einem Postfach
--
-- Zugriffsmodell (Tickets):
--   owner/admin  → alle Postfächer
--   Mitglied     → nur zugewiesene Postfächer
--   assignee     → eigene Tickets
-- Standortbezug bleibt informativ erhalten, ist aber NICHT mehr die
-- Zugriffsgrenze (explizite Postfach-Zuweisung gewünscht).

-- ----------------------------------------------------------------------------
-- mailboxes
-- ----------------------------------------------------------------------------
create table public.mailboxes (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,                 -- Anzeigename, z. B. "Support"
  email        citext not null unique,        -- Inbound-/Absenderadresse
  location_id  uuid references public.locations(id) on delete set null,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index idx_mailboxes_location on public.mailboxes(location_id);

create trigger trg_mailboxes_updated_at
  before update on public.mailboxes
  for each row execute function private.set_updated_at();

-- ----------------------------------------------------------------------------
-- mailbox_members · explizite Zuweisung Profil ↔ Postfach
-- ----------------------------------------------------------------------------
create table public.mailbox_members (
  mailbox_id  uuid not null references public.mailboxes(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (mailbox_id, profile_id)
);

create index idx_mailbox_members_profile on public.mailbox_members(profile_id);

-- ----------------------------------------------------------------------------
-- tickets.mailbox_id
-- ----------------------------------------------------------------------------
alter table public.tickets
  add column mailbox_id uuid references public.mailboxes(id) on delete set null;

create index idx_tickets_mailbox on public.tickets(mailbox_id);

-- ----------------------------------------------------------------------------
-- Helfer: ist der eingeloggte User Mitglied des Postfachs?
--   SECURITY DEFINER → keine Policy-Rekursion.
-- ----------------------------------------------------------------------------
create or replace function private.is_mailbox_member(mb uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.mailbox_members m
    where m.mailbox_id = mb
      and m.profile_id = private.auth_profile_id()
  );
$$;

-- ----------------------------------------------------------------------------
-- RLS aktivieren
-- ----------------------------------------------------------------------------
alter table public.mailboxes       enable row level security;
alter table public.mailbox_members enable row level security;
alter table public.mailboxes       force row level security;
alter table public.mailbox_members force row level security;

-- mailboxes: sichtbar für Mitglieder + Verwalter; Verwaltung via mailboxes.manage
create policy mailboxes_select on public.mailboxes
  for select using (
    private.is_owner_or_admin()
    or private.has_permission('mailboxes.manage')
    or private.is_mailbox_member(id)
  );

create policy mailboxes_write on public.mailboxes
  for all using (private.has_permission('mailboxes.manage'))
  with check (private.has_permission('mailboxes.manage'));

-- mailbox_members: eigene Mitgliedschaft sichtbar; Verwaltung via mailboxes.manage
create policy mailbox_members_select on public.mailbox_members
  for select using (
    profile_id = private.auth_profile_id()
    or private.has_permission('mailboxes.manage')
  );

create policy mailbox_members_write on public.mailbox_members
  for all using (private.has_permission('mailboxes.manage'))
  with check (private.has_permission('mailboxes.manage'));

-- ----------------------------------------------------------------------------
-- Tickets-Policies neu fassen: Zugriff über Postfach-Mitgliedschaft.
-- ----------------------------------------------------------------------------
drop policy if exists tickets_select on public.tickets;
drop policy if exists tickets_insert on public.tickets;
drop policy if exists tickets_update on public.tickets;
drop policy if exists tickets_delete on public.tickets;

create policy tickets_select on public.tickets
  for select using (
    private.is_owner_or_admin()
    or assignee_id = private.auth_profile_id()
    or (mailbox_id is not null and private.is_mailbox_member(mailbox_id))
  );

create policy tickets_insert on public.tickets
  for insert with check (
    private.is_owner_or_admin()
    or (mailbox_id is not null and private.is_mailbox_member(mailbox_id))
  );

create policy tickets_update on public.tickets
  for update using (
    private.is_owner_or_admin()
    or assignee_id = private.auth_profile_id()
    or (mailbox_id is not null and private.is_mailbox_member(mailbox_id))
  )
  with check (
    private.is_owner_or_admin()
    or assignee_id = private.auth_profile_id()
    or (mailbox_id is not null and private.is_mailbox_member(mailbox_id))
  );

create policy tickets_delete on public.tickets
  for delete using (
    private.is_owner_or_admin()
    or private.has_permission('tickets.delete', location_id)
  );

-- ----------------------------------------------------------------------------
-- Messages/Notes/Attachments folgen automatisch der neuen tickets_select-Logik
-- (sie referenzieren has_permission('tickets.read', t.location_id)). Wir fassen
-- ihre SELECT/INSERT-Policies ebenfalls auf Postfach-Mitgliedschaft um.
-- ----------------------------------------------------------------------------
drop policy if exists messages_select on public.messages;
drop policy if exists messages_insert on public.messages;
drop policy if exists messages_delete on public.messages;

create policy messages_select on public.messages
  for select using (
    exists (
      select 1 from public.tickets t
      where t.id = messages.ticket_id
        and (
          private.is_owner_or_admin()
          or t.assignee_id = private.auth_profile_id()
          or (t.mailbox_id is not null and private.is_mailbox_member(t.mailbox_id))
        )
    )
  );

create policy messages_insert on public.messages
  for insert with check (
    exists (
      select 1 from public.tickets t
      where t.id = messages.ticket_id
        and (
          private.is_owner_or_admin()
          or t.assignee_id = private.auth_profile_id()
          or (t.mailbox_id is not null and private.is_mailbox_member(t.mailbox_id))
        )
    )
  );

create policy messages_delete on public.messages
  for delete using (
    exists (
      select 1 from public.tickets t
      where t.id = messages.ticket_id
        and (private.is_owner_or_admin()
             or private.has_permission('tickets.delete', t.location_id))
    )
  );

drop policy if exists notes_select on public.notes;
drop policy if exists notes_insert on public.notes;

create policy notes_select on public.notes
  for select using (
    exists (
      select 1 from public.tickets t
      where t.id = notes.ticket_id
        and (
          private.is_owner_or_admin()
          or t.assignee_id = private.auth_profile_id()
          or (t.mailbox_id is not null and private.is_mailbox_member(t.mailbox_id))
        )
    )
  );

create policy notes_insert on public.notes
  for insert with check (
    exists (
      select 1 from public.tickets t
      where t.id = notes.ticket_id
        and (
          private.is_owner_or_admin()
          or t.assignee_id = private.auth_profile_id()
          or (t.mailbox_id is not null and private.is_mailbox_member(t.mailbox_id))
        )
    )
  );

drop policy if exists attachments_select on public.attachments;

create policy attachments_select on public.attachments
  for select using (
    exists (
      select 1 from public.tickets t
      where t.id = attachments.ticket_id
        and (
          private.is_owner_or_admin()
          or t.assignee_id = private.auth_profile_id()
          or (t.mailbox_id is not null and private.is_mailbox_member(t.mailbox_id))
        )
    )
  );
-- ============================================================================
-- Seed · Rollen, Rechte, Rollen-Rechte-Matrix, Demo-Standort
-- Idempotent: kann mehrfach ausgeführt werden.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Rollen
-- ----------------------------------------------------------------------------
insert into public.roles (key, name, description, rank) values
  ('owner',            'Owner',            'Voller Zugriff inkl. Rollenvergabe',        100),
  ('admin',            'Administrator',    'Operative Verwaltung aller Module',          80),
  ('location_manager', 'Standortleitung',  'Verwaltung der zugewiesenen Standorte',      50),
  ('employee',         'Mitarbeiter',      'Bearbeitung von Tickets am eigenen Standort', 20)
on conflict (key) do update
  set name = excluded.name, description = excluded.description, rank = excluded.rank;

-- ----------------------------------------------------------------------------
-- Rechte (atomar)
-- ----------------------------------------------------------------------------
insert into public.permissions (key, description) values
  ('tickets.read',      'Tickets lesen'),
  ('tickets.create',    'Tickets erstellen'),
  ('tickets.update',    'Tickets bearbeiten (Status, Priorität, Tags)'),
  ('tickets.reply',     'Auf Tickets antworten / Nachrichten senden'),
  ('tickets.assign',    'Tickets zuweisen'),
  ('tickets.delete',    'Tickets löschen'),
  ('customers.read',    'Kundeninformationen lesen'),
  ('customers.manage',  'Kunden anlegen/bearbeiten'),
  ('notes.create',      'Interne Notizen erstellen'),
  ('tags.manage',       'Tags verwalten'),
  ('templates.read',    'Vorlagen lesen'),
  ('templates.manage',  'Vorlagen verwalten'),
  ('audit.read',        'Audit-Log einsehen'),
  ('users.read',        'Benutzer/Profile lesen'),
  ('users.manage',      'Benutzer/Profile verwalten'),
  ('roles.manage',      'Rollen & Rechte verwalten'),
  ('locations.manage',  'Standorte verwalten'),
  ('mailboxes.manage',  'Postfächer & Zuweisungen verwalten')
on conflict (key) do update set description = excluded.description;

-- ----------------------------------------------------------------------------
-- Rollen-Rechte-Matrix
-- ----------------------------------------------------------------------------

-- owner & admin: ALLE Rechte
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key in ('owner', 'admin')
on conflict do nothing;

-- location_manager: Ticketverwaltung + Kunden/Tags/Templates am Standort
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'tickets.read', 'tickets.create', 'tickets.update', 'tickets.reply',
  'tickets.assign', 'tickets.delete',
  'customers.read', 'customers.manage',
  'notes.create', 'tags.manage',
  'templates.read', 'templates.manage',
  'mailboxes.manage'
)
where r.key = 'location_manager'
on conflict do nothing;

-- employee: Tickets bearbeiten/beantworten am eigenen Standort
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'tickets.read', 'tickets.create', 'tickets.update', 'tickets.reply',
  'customers.read', 'notes.create', 'templates.read'
)
where r.key = 'employee'
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- Demo-Standort (optional – kann entfernt werden)
-- ----------------------------------------------------------------------------
insert into public.locations (name, slug, city) values
  ('MAW Hauptstandort', 'hauptstandort', 'Deutschland')
on conflict (slug) do nothing;
