-- ============================================================================
-- 0012 · Mitarbeiter-Signatur (HTML) je Profil
-- ============================================================================
-- Jede/r Mitarbeiter/in kann eine eigene HTML-Signatur hinterlegen. Beim
-- Versand einer Antwort wird sie unter den Nachrichtentext (im MAW-Template)
-- gesetzt. Self-Service über die bestehende RLS-Policy profiles_update_self.

alter table public.profiles
  add column if not exists signature_html text;
