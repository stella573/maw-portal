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
