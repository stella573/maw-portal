-- ============================================================================
-- 0017 · Standorte (Dorsten/Hamm) + Admin-Sichtbarkeit auf Owner einschränken
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Standorte: Dorsten + Hamm (Global = location_id IS NULL, kein eigener Satz)
--    Den vorhandenen Seed-Standort zu „Dorsten" machen (id bleibt → bestehende
--    Verknüpfungen bleiben gültig), „Hamm" ergänzen.
-- ----------------------------------------------------------------------------
update public.locations
   set name = 'Dorsten', slug = 'dorsten', city = 'Dorsten'
 where slug = 'hauptstandort';

insert into public.locations (name, slug, city, is_active)
values ('Dorsten', 'dorsten', 'Dorsten', true)
on conflict (slug) do nothing;

insert into public.locations (name, slug, city, is_active)
values ('Hamm', 'hamm', 'Hamm', true)
on conflict (slug) do nothing;

-- ----------------------------------------------------------------------------
-- 2) Helper: ausschließlich Owner (global). Admin zählt hier NICHT mehr mit.
-- ----------------------------------------------------------------------------
create or replace function private.is_owner()
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
      and r.key = 'owner'
  );
$$;

-- ----------------------------------------------------------------------------
-- 3) Postfach-/Ticket-Sichtbarkeit: „alles sehen" nur noch für OWNER.
--    Admin greift wie alle übrigen über Postfach-Mitgliedschaft / Assignee zu.
--    (Postfach-Verwaltung in den Einstellungen bleibt über mailboxes.manage.)
-- ----------------------------------------------------------------------------

-- mailboxes: sichtbar für Owner, Verwalter (mailboxes.manage) und Mitglieder
drop policy if exists mailboxes_select on public.mailboxes;
create policy mailboxes_select on public.mailboxes
  for select using (
    private.is_owner()
    or private.has_permission('mailboxes.manage')
    or private.is_mailbox_member(id)
  );

-- tickets
drop policy if exists tickets_select on public.tickets;
create policy tickets_select on public.tickets
  for select using (
    private.is_owner()
    or assignee_id = private.auth_profile_id()
    or (mailbox_id is not null and private.is_mailbox_member(mailbox_id))
  );

drop policy if exists tickets_insert on public.tickets;
create policy tickets_insert on public.tickets
  for insert with check (
    private.is_owner()
    or (mailbox_id is not null and private.is_mailbox_member(mailbox_id))
  );

drop policy if exists tickets_update on public.tickets;
create policy tickets_update on public.tickets
  for update using (
    private.is_owner()
    or assignee_id = private.auth_profile_id()
    or (mailbox_id is not null and private.is_mailbox_member(mailbox_id))
  )
  with check (
    private.is_owner()
    or assignee_id = private.auth_profile_id()
    or (mailbox_id is not null and private.is_mailbox_member(mailbox_id))
  );

drop policy if exists tickets_delete on public.tickets;
create policy tickets_delete on public.tickets
  for delete using (
    private.is_owner()
    or private.has_permission('tickets.delete', location_id)
  );

-- messages
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select using (
    exists (
      select 1 from public.tickets t
      where t.id = messages.ticket_id
        and (
          private.is_owner()
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
          private.is_owner()
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
        and (private.is_owner()
             or private.has_permission('tickets.delete', t.location_id))
    )
  );

-- notes
drop policy if exists notes_select on public.notes;
create policy notes_select on public.notes
  for select using (
    exists (
      select 1 from public.tickets t
      where t.id = notes.ticket_id
        and (
          private.is_owner()
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
          private.is_owner()
          or t.assignee_id = private.auth_profile_id()
          or (t.mailbox_id is not null and private.is_mailbox_member(t.mailbox_id))
        )
    )
  );

-- attachments
drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments
  for select using (
    exists (
      select 1 from public.tickets t
      where t.id = attachments.ticket_id
        and (
          private.is_owner()
          or t.assignee_id = private.auth_profile_id()
          or (t.mailbox_id is not null and private.is_mailbox_member(t.mailbox_id))
        )
    )
  );

-- ticket_tags (select + write, write zusätzlich an tickets.tag gebunden – 0015)
drop policy if exists ticket_tags_select on public.ticket_tags;
create policy ticket_tags_select on public.ticket_tags
  for select using (
    exists (
      select 1 from public.tickets t
      where t.id = ticket_tags.ticket_id
        and (
          private.is_owner()
          or t.assignee_id = private.auth_profile_id()
          or (t.mailbox_id is not null and private.is_mailbox_member(t.mailbox_id))
        )
    )
  );

drop policy if exists ticket_tags_write on public.ticket_tags;
create policy ticket_tags_write on public.ticket_tags
  for all using (
    exists (
      select 1 from public.tickets t
      where t.id = ticket_tags.ticket_id
        and (
          private.is_owner()
          or (
            (t.assignee_id = private.auth_profile_id()
             or (t.mailbox_id is not null and private.is_mailbox_member(t.mailbox_id)))
            and private.has_permission('tickets.tag')
          )
        )
    )
  )
  with check (
    exists (
      select 1 from public.tickets t
      where t.id = ticket_tags.ticket_id
        and (
          private.is_owner()
          or (
            (t.assignee_id = private.auth_profile_id()
             or (t.mailbox_id is not null and private.is_mailbox_member(t.mailbox_id)))
            and private.has_permission('tickets.tag')
          )
        )
    )
  );

-- ----------------------------------------------------------------------------
-- 4) Label-Korrektur: employees.manage = nur Synchronisieren (Zugänge anlegen
--    läuft über users.manage).
-- ----------------------------------------------------------------------------
update public.permissions
   set description = 'Mitarbeiter aus Personio synchronisieren'
 where key = 'employees.manage';
