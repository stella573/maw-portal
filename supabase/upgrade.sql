-- ============================================================================
-- upgrade.sql · Nachträgliche Migrationen für eine BESTEHENDE Datenbank
-- ============================================================================
-- Verwende DIESE Datei (nicht full_setup.sql), wenn deine DB bereits die
-- Migrationen 0001–0005 enthält. full_setup.sql ist ausschließlich für eine
-- komplett leere DB.
--
-- Vollständig idempotent: kann gefahrlos mehrfach ausgeführt werden.
--
-- Hinweis: ALTER TYPE ... ADD VALUE kann in manchen Editor-Kontexten nicht in
-- einer Transaktion mit Nutzung laufen. Hier werden Werte nur angelegt (mit
-- IF NOT EXISTS), nicht genutzt – unkritisch. Falls der SQL-Editor dennoch
-- meckert, führe die acht ALTER-TYPE-Zeilen einzeln aus.

-- ===== 0006: neue Audit-Aktionen ===========================================
alter type public.audit_action add value if not exists 'mfa.enrolled';
alter type public.audit_action add value if not exists 'mfa.verified';
alter type public.audit_action add value if not exists 'mfa.unenrolled';
alter type public.audit_action add value if not exists 'mfa.challenge_failed';
alter type public.audit_action add value if not exists 'user.created';
alter type public.audit_action add value if not exists 'user.updated';
alter type public.audit_action add value if not exists 'mfa.reset_by_admin';
alter type public.audit_action add value if not exists 'auth.password_changed';
alter type public.audit_action add value if not exists 'mailbox.created';
alter type public.audit_action add value if not exists 'mailbox.updated';
alter type public.audit_action add value if not exists 'mailbox.member_added';
alter type public.audit_action add value if not exists 'mailbox.member_removed';
alter type public.audit_action add value if not exists 'role.permission_granted';
alter type public.audit_action add value if not exists 'role.permission_revoked';

-- ===== 0007: Postfächer + Mitgliedschaften =================================

create table if not exists public.mailboxes (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  email        citext not null unique,
  location_id  uuid references public.locations(id) on delete set null,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_mailboxes_location on public.mailboxes(location_id);

drop trigger if exists trg_mailboxes_updated_at on public.mailboxes;
create trigger trg_mailboxes_updated_at
  before update on public.mailboxes
  for each row execute function private.set_updated_at();

create table if not exists public.mailbox_members (
  mailbox_id  uuid not null references public.mailboxes(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (mailbox_id, profile_id)
);

create index if not exists idx_mailbox_members_profile
  on public.mailbox_members(profile_id);

-- tickets.mailbox_id (idempotent)
alter table public.tickets
  add column if not exists mailbox_id uuid references public.mailboxes(id) on delete set null;

create index if not exists idx_tickets_mailbox on public.tickets(mailbox_id);

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

alter table public.mailboxes       enable row level security;
alter table public.mailbox_members enable row level security;
alter table public.mailboxes       force row level security;
alter table public.mailbox_members force row level security;

drop policy if exists mailboxes_select on public.mailboxes;
create policy mailboxes_select on public.mailboxes
  for select using (
    private.is_owner_or_admin()
    or private.has_permission('mailboxes.manage')
    or private.is_mailbox_member(id)
  );

drop policy if exists mailboxes_write on public.mailboxes;
create policy mailboxes_write on public.mailboxes
  for all using (private.has_permission('mailboxes.manage'))
  with check (private.has_permission('mailboxes.manage'));

drop policy if exists mailbox_members_select on public.mailbox_members;
create policy mailbox_members_select on public.mailbox_members
  for select using (
    profile_id = private.auth_profile_id()
    or private.has_permission('mailboxes.manage')
  );

drop policy if exists mailbox_members_write on public.mailbox_members;
create policy mailbox_members_write on public.mailbox_members
  for all using (private.has_permission('mailboxes.manage'))
  with check (private.has_permission('mailboxes.manage'));

-- Tickets-Policies auf Postfach-Mitgliedschaft umstellen
drop policy if exists tickets_select on public.tickets;
create policy tickets_select on public.tickets
  for select using (
    private.is_owner_or_admin()
    or assignee_id = private.auth_profile_id()
    or (mailbox_id is not null and private.is_mailbox_member(mailbox_id))
  );

drop policy if exists tickets_insert on public.tickets;
create policy tickets_insert on public.tickets
  for insert with check (
    private.is_owner_or_admin()
    or (mailbox_id is not null and private.is_mailbox_member(mailbox_id))
  );

drop policy if exists tickets_update on public.tickets;
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

drop policy if exists tickets_delete on public.tickets;
create policy tickets_delete on public.tickets
  for delete using (
    private.is_owner_or_admin()
    or private.has_permission('tickets.delete', location_id)
  );

drop policy if exists messages_select on public.messages;
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

drop policy if exists messages_insert on public.messages;
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

drop policy if exists messages_delete on public.messages;
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

drop policy if exists notes_insert on public.notes;
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

-- ===== Neue Permission im Seed ============================================
insert into public.permissions (key, description) values
  ('mailboxes.manage', 'Postfächer & Zuweisungen verwalten')
on conflict (key) do update set description = excluded.description;

-- owner/admin: alle Rechte (auch das neue)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key in ('owner', 'admin')
on conflict do nothing;

-- location_manager: mailboxes.manage ergänzen
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'mailboxes.manage'
where r.key = 'location_manager'
on conflict do nothing;

-- ===== 0008: Security-Härtung =============================================
revoke execute on function public.log_audit(public.audit_action, text, uuid, uuid, jsonb) from anon, public;
grant  execute on function public.log_audit(public.audit_action, text, uuid, uuid, jsonb) to authenticated;
do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='rls_auto_enable') then
    revoke execute on function public.rls_auto_enable() from anon, authenticated, public;
  end if;
end $$;
alter function private.auth_profile_id() set search_path = public;
alter function private.set_updated_at() set search_path = public;
alter function private.touch_ticket_last_message() set search_path = public;
alter function private.audit_ticket_status_change() set search_path = public;
alter function private.handle_new_user() set search_path = public;

-- ===== 0009: Anhänge (Storage-Bucket + Spalte) ============================
insert into storage.buckets (id, name, public)
values ('mail-attachments', 'mail-attachments', false)
on conflict (id) do nothing;

alter table public.attachments
  add column if not exists provider_attachment_id text;
