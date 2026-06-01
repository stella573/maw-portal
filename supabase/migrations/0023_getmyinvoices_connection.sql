-- ============================================================================
-- 0023 · GetMyInvoices-API-Anbindung: globale Verbindung (Singleton)
-- ============================================================================
-- GetMyInvoices (GMI) ist account-basiert: ein zentraler Firmen-Account sammelt
-- alle Rechnungen. Daher EINE globale Verbindung (kein Bezug zu Standorten oder
-- ROLLER). Genutzt wird sie, um später Rechnungen aus den HUB-E-Mails nach GMI
-- zu übertragen (Import/Push).
--
-- Auth: API-Key (POST-JSON-Feld `api_key`). Der Key liegt – wie die ROLLER-
-- Secrets – in einer streng abgeschotteten Tabelle: RLS aktiv OHNE Policies →
-- Zugriff ausschließlich serverseitig über die Service-Role nach Permission-
-- Prüfung (integrations.manage).

create table public.getmyinvoices_connection (
  id               boolean primary key default true,
  base_url         text not null default 'https://api.getmyinvoices.com/accounts/v3',
  api_key          text not null,
  is_active        boolean not null default true,
  last_verified_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- Singleton: nur eine einzige Zeile (id ist immer true).
  constraint getmyinvoices_singleton check (id = true)
);

create trigger trg_getmyinvoices_connection_updated_at
  before update on public.getmyinvoices_connection
  for each row execute function private.set_updated_at();

-- RLS an, KEINE Policies → nur Service-Role (umgeht RLS) hat Zugriff.
alter table public.getmyinvoices_connection enable row level security;
alter table public.getmyinvoices_connection force row level security;

-- Beschreibung des bestehenden Rechts erweitern (GMI nutzt dieselbe Permission).
update public.permissions
  set description = 'Integrationen/API-Zugänge (z. B. ROLLER, GetMyInvoices) verwalten'
  where key = 'integrations.manage';
