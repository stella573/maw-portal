-- ============================================================================
-- 0015 · Drei neue, einzeln steuerbare Rechte (erscheinen im Rechte-Raster)
-- ============================================================================
--   tickets.tag        – Tags am Ticket anwenden/entfernen
--   signatures.manage  – E-Mail-Signaturen ANDERER Mitarbeiter verwalten
--   mailboxes.send_as  – beim Antworten aus einem anderen als dem Ticket-Postfach
--                        senden
-- Das Raster liest alle Zeilen aus public.permissions → neue Keys erscheinen
-- automatisch.

-- 1) Permissions anlegen (idempotent) ----------------------------------------
insert into public.permissions (key, description) values
  ('tickets.tag',       'Tags am Ticket anwenden/entfernen'),
  ('signatures.manage', 'E-Mail-Signaturen anderer Mitarbeiter verwalten'),
  ('mailboxes.send_as', 'Beim Antworten aus einem anderen Postfach senden')
on conflict (key) do nothing;

-- 2) Sinnvolle Default-Zuordnung zu bestehenden Rollen -----------------------
--    owner/admin/location_manager: alle drei; employee: nur Tags anwenden
--    (damit Tagging wie bisher für Postfach-Mitglieder funktioniert).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in ('tickets.tag', 'signatures.manage', 'mailboxes.send_as')
where r.key in ('owner', 'admin', 'location_manager')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'tickets.tag'
where r.key = 'employee'
on conflict do nothing;

-- 3) ticket_tags-Schreibrecht zusätzlich an tickets.tag knüpfen --------------
drop policy if exists ticket_tags_write on public.ticket_tags;
create policy ticket_tags_write on public.ticket_tags
  for all using (
    exists (
      select 1 from public.tickets t
      where t.id = ticket_tags.ticket_id
        and (
          private.is_owner_or_admin()
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
          private.is_owner_or_admin()
          or (
            (t.assignee_id = private.auth_profile_id()
             or (t.mailbox_id is not null and private.is_mailbox_member(t.mailbox_id)))
            and private.has_permission('tickets.tag')
          )
        )
    )
  );

-- 4) Signatur ANDERER setzen: SECURITY-DEFINER-Funktion, prüft signatures.manage
--    und schreibt ausschließlich die signature_html-Spalte (kein breiter
--    profiles-Schreibzugriff über RLS nötig).
create or replace function public.set_user_signature(p_profile_id uuid, p_html text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.has_permission('signatures.manage') then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;
  update public.profiles
     set signature_html = nullif(btrim(p_html), '')
   where id = p_profile_id;
end;
$$;

revoke execute on function public.set_user_signature(uuid, text) from anon, public;
grant  execute on function public.set_user_signature(uuid, text) to authenticated;
