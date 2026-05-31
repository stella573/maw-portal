-- ============================================================================
-- 0016 · Mitarbeiter-Modul: Personio-Verzeichnis + Rechte
-- ============================================================================
-- personio_employees ist das aus Personio synchronisierte Verzeichnis ALLER
-- aktuellen Mitarbeiter – unabhängig davon, ob sie schon einen Portal-Zugang
-- (profiles/auth) haben. Quelle der Wahrheit für "wer arbeitet hier" + Status.
-- Portal-Konten (profiles) sind die Teilmenge mit Login; Verknüpfung per E-Mail
-- bzw. profile_id.

create table public.personio_employees (
  personio_id  bigint primary key,
  email        citext unique,
  first_name   text,
  last_name    text,
  position     text,
  department   text,
  office       text,
  -- Personio-Status: active | inactive | onboarding | leave …
  status       text not null default 'active',
  -- Verknüpftes Portal-Profil (falls Zugang existiert).
  profile_id   uuid references public.profiles(id) on delete set null,
  synced_at    timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create index idx_personio_employees_email   on public.personio_employees(email);
create index idx_personio_employees_status  on public.personio_employees(status);
create index idx_personio_employees_profile on public.personio_employees(profile_id);

alter table public.personio_employees enable row level security;
alter table public.personio_employees force row level security;

-- Lesen: alle mit employees.read (Verzeichnis). Schreiben (Sync) läuft über die
-- Service-Role (umgeht RLS); die Policy deckt direkte Verwaltung mit ab.
create policy personio_employees_select on public.personio_employees
  for select using (private.has_permission('employees.read'));

create policy personio_employees_write on public.personio_employees
  for all using (private.has_permission('employees.manage'))
  with check (private.has_permission('employees.manage'));

-- ----------------------------------------------------------------------------
-- Rechte: Verzeichnis lesen / Mitarbeiter-Sync & Zugänge verwalten
-- ----------------------------------------------------------------------------
insert into public.permissions (key, description) values
  ('employees.read',   'Mitarbeiter-Verzeichnis ansehen'),
  ('employees.manage', 'Mitarbeiter aus Personio synchronisieren & Zugänge anlegen')
on conflict (key) do nothing;

-- employees.read: alle Rollen (Verzeichnis ist für jede/n sichtbar)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'employees.read'
where r.key in ('owner', 'admin', 'location_manager', 'employee')
on conflict do nothing;

-- employees.manage: Verwaltungsrollen
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'employees.manage'
where r.key in ('owner', 'admin', 'location_manager')
on conflict do nothing;
