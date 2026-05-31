-- ============================================================================
-- 0020 · ROLLER-API-Anbindung: Verbindungen je Standort
-- ============================================================================
-- ROLLER (Venue-Management) wird pro Standort separat angebunden (eigene
-- OAuth-Client-Credentials je Venue). Die Secrets liegen in einer streng
-- abgeschotteten Tabelle: RLS aktiv OHNE Policies → kein Zugriff über die
-- öffentliche API; gelesen/geschrieben wird ausschließlich serverseitig über
-- die Service-Role (nach Permission-Prüfung integrations.manage).

create table public.roller_connections (
  location_id      uuid primary key references public.locations(id) on delete cascade,
  base_url         text not null default 'https://api.play.roller.app',
  client_id        text not null,
  client_secret    text not null,
  is_active        boolean not null default true,
  venue_name       text,
  last_verified_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger trg_roller_connections_updated_at
  before update on public.roller_connections
  for each row execute function private.set_updated_at();

-- RLS an, KEINE Policies → nur Service-Role (umgeht RLS) hat Zugriff.
alter table public.roller_connections enable row level security;
alter table public.roller_connections force row level security;

-- Recht zum Verwalten von Integrationen/API-Zugängen.
insert into public.permissions (key, description) values
  ('integrations.manage', 'Integrationen/API-Zugänge (z. B. ROLLER) verwalten')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'integrations.manage'
where r.key in ('owner', 'admin')
on conflict do nothing;
