-- ============================================================================
-- 0009 · Anhänge: Storage-Bucket + Spalten
-- ============================================================================
-- Eingehende (und später ausgehende) Mail-Anhänge werden dauerhaft in einem
-- PRIVATEN Storage-Bucket abgelegt. Der Zugriff läuft ausschließlich über die
-- App (Service-Role beim Schreiben, signierte URLs beim Lesen nach
-- Permission-Prüfung) – kein öffentlicher Bucket.

-- Privaten Bucket anlegen (idempotent).
insert into storage.buckets (id, name, public)
values ('mail-attachments', 'mail-attachments', false)
on conflict (id) do nothing;

-- attachments: provider-Referenz ergänzen (für Deduplizierung/Diagnose).
alter table public.attachments
  add column if not exists provider_attachment_id text;

-- Kein öffentlicher Storage-Zugriff: KEINE storage.objects-Policies für
-- anon/authenticated. Lesen erfolgt über signierte URLs (Service-Role in der
-- Download-Route nach App-seitiger Berechtigungsprüfung gegen public.attachments).
