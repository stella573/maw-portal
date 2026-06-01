-- ============================================================================
-- 0024 · GetMyInvoices: Account-Kennung (für den User-Agent)
-- ============================================================================
-- Die GMI Accounts API v3 verlangt zusätzlich zum X-API-KEY einen User-Agent,
-- der die Account-Kennung im Format G-{Nummer} enthält. Diese Kennung wird je
-- Verbindung gespeichert.

alter table public.getmyinvoices_connection
  add column if not exists account_id text;
