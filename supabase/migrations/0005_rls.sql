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
