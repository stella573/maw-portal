-- ============================================================================
-- 0010 · MailDesk · Realtime (Live-Inbox + Multi-User-Kollaboration)
-- ============================================================================
-- Aktiviert Postgres-Changes für tickets/messages, damit die Inbox live
-- aktualisiert (erledigte Tickets verschwinden sofort, neue erscheinen) und
-- mehrere Bearbeiter denselben Stand sehen. RLS bleibt wirksam: Realtime
-- liefert einem Client nur Zeilen, die er laut tickets_select sehen darf.
--
-- Presence/„wer tippt gerade?" läuft über öffentliche Realtime-Channels
-- (kein DB-Objekt nötig) und ist daher nicht Teil dieser Migration.
--
-- Idempotent: Tabellen nur hinzufügen, wenn sie noch nicht in der Publikation
-- supabase_realtime stehen.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tickets'
  ) then
    alter publication supabase_realtime add table public.tickets;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
