-- ============================================================================
-- 0008 · Security-Härtung (Advisor-Befunde)
-- ============================================================================
-- Idempotent. Wird auch direkt über den Supabase-Konnektor angewandt.

-- log_audit darf NICHT mehr von anon (nicht eingeloggt) aufgerufen werden –
-- verhindert gefälschte Audit-Einträge über die öffentliche REST-API.
-- authenticated behält EXECUTE (App schreibt das Log mit User-Session).
revoke execute on function public.log_audit(public.audit_action, text, uuid, uuid, jsonb) from anon, public;
grant  execute on function public.log_audit(public.audit_action, text, uuid, uuid, jsonb) to authenticated;

-- rls_auto_enable() ist eine Event-Trigger-Funktion (läuft automatisch bei
-- CREATE TABLE) und wird nie direkt aufgerufen → EXECUTE für alle entziehen.
revoke execute on function public.rls_auto_enable() from anon, authenticated, public;

-- search_path auf allen SECURITY-relevanten Funktionen fixieren (Härtung gegen
-- search_path-Injection).
alter function private.auth_profile_id() set search_path = public;
alter function private.set_updated_at() set search_path = public;
alter function private.touch_ticket_last_message() set search_path = public;
alter function private.audit_ticket_status_change() set search_path = public;
alter function private.handle_new_user() set search_path = public;
