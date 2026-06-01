-- ============================================================================
-- 0013 · Inbox-Performance: letzte Nachricht je Ticket als kurze Vorschau
-- ============================================================================
-- Die Inbox brauchte bisher pro Ticket die neueste Nachricht. Der App-Code lud
-- dafür ALLE Nachrichten (inkl. voller HTML-Bodies) der gelisteten Tickets und
-- bestimmte clientseitig die neueste – langsam, sobald viele/große Mails
-- existieren (besonders im „Alle"-Tab).
--
-- Diese Funktion liefert per DISTINCT ON nur EINE Zeile je Ticket (die neueste)
-- mit einer bereits bereinigten, gekürzten Vorschau (≤200 Zeichen, ohne HTML).
-- SECURITY INVOKER → RLS auf messages greift weiterhin (nur sichtbare Tickets).

create or replace function public.ticket_last_messages(p_ticket_ids uuid[])
returns table (
  ticket_id uuid,
  direction public.message_direction,
  preview   text
)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (m.ticket_id)
    m.ticket_id,
    m.direction,
    left(
      btrim(
        regexp_replace(
          coalesce(
            nullif(btrim(m.body_text), ''),
            regexp_replace(coalesce(m.body_html, ''), '<[^>]+>', ' ', 'g')
          ),
          '\s+', ' ', 'g'
        )
      ),
      200
    ) as preview
  from public.messages m
  where m.ticket_id = any(p_ticket_ids)
  order by m.ticket_id, m.created_at desc;
$$;
