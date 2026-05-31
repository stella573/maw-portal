-- ============================================================================
-- 0014 · Tags & Vorlagen: Zugriff an das Postfach-Modell (0007) angleichen
-- ============================================================================
-- 0007 stellte tickets/messages/notes auf Postfach-Mitgliedschaft um, ließ aber
-- ticket_tags und templates beim alten standortbasierten has_permission(...).
-- Folge: normale Postfach-Mitglieder (ohne tickets.update/templates.read am
-- Standort) könnten Tickets nicht taggen und keine Vorlagen lesen.
--
-- Diese Migration:
--  1. ticket_tags select/write → Owner/Admin ODER Assignee ODER Postfach-Mitglied
--     des zugehörigen Tickets (analog tickets-Policies aus 0007).
--  2. templates select → für alle eingeloggten User (interne Textbausteine).
--     Verwaltung (write) bleibt bei templates.manage.

-- 1) ticket_tags ---------------------------------------------------------------
drop policy if exists ticket_tags_select on public.ticket_tags;
drop policy if exists ticket_tags_write  on public.ticket_tags;

create policy ticket_tags_select on public.ticket_tags
  for select using (
    exists (
      select 1 from public.tickets t
      where t.id = ticket_tags.ticket_id
        and (
          private.is_owner_or_admin()
          or t.assignee_id = private.auth_profile_id()
          or (t.mailbox_id is not null and private.is_mailbox_member(t.mailbox_id))
        )
    )
  );

create policy ticket_tags_write on public.ticket_tags
  for all using (
    exists (
      select 1 from public.tickets t
      where t.id = ticket_tags.ticket_id
        and (
          private.is_owner_or_admin()
          or t.assignee_id = private.auth_profile_id()
          or (t.mailbox_id is not null and private.is_mailbox_member(t.mailbox_id))
        )
    )
  )
  with check (
    exists (
      select 1 from public.tickets t
      where t.id = ticket_tags.ticket_id
        and (
          private.is_owner_or_admin()
          or t.assignee_id = private.auth_profile_id()
          or (t.mailbox_id is not null and private.is_mailbox_member(t.mailbox_id))
        )
    )
  );

-- 2) templates -----------------------------------------------------------------
drop policy if exists templates_select on public.templates;
create policy templates_select on public.templates
  for select using (private.auth_profile_id() is not null);
