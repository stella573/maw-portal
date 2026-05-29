-- ============================================================================
-- 0002 · Kern-Identität: Standorte, Profile, Rollen, Rechte, Zuweisungen
-- ============================================================================

-- ----------------------------------------------------------------------------
-- locations · Standorte (Basis für Scoping, CRM, Dienstplan)
-- ----------------------------------------------------------------------------
create table public.locations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  city        text,
  address     text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_locations_updated_at
  before update on public.locations
  for each row execute function private.set_updated_at();

-- ----------------------------------------------------------------------------
-- profiles · 1:1 zu auth.users
-- ----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       citext not null unique,
  full_name   text,
  avatar_url  text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- Auto-Provisioning: bei neuem auth.users-Eintrag ein Profil anlegen
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger trg_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ----------------------------------------------------------------------------
-- roles · Rollendefinition
-- ----------------------------------------------------------------------------
create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,         -- owner | admin | location_manager | employee
  name        text not null,
  description text,
  rank        int  not null default 0,      -- höhere Zahl = mehr Reichweite (nur informativ)
  is_system   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- permissions · atomare Rechte
-- ----------------------------------------------------------------------------
create table public.permissions (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,         -- z.B. tickets.read, tickets.reply
  description text,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- role_permissions · n:m Rolle ↔ Recht
-- ----------------------------------------------------------------------------
create table public.role_permissions (
  role_id        uuid not null references public.roles(id) on delete cascade,
  permission_id  uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create index idx_role_permissions_permission on public.role_permissions(permission_id);

-- ----------------------------------------------------------------------------
-- user_roles · n:m Profil ↔ Rolle, optional pro Standort
--   location_id NULL = global wirksame Rolle
-- ----------------------------------------------------------------------------
create table public.user_roles (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  role_id      uuid not null references public.roles(id) on delete cascade,
  location_id  uuid references public.locations(id) on delete cascade,
  created_at   timestamptz not null default now(),
  -- gleiche Rolle pro (Profil, Standort) nur einmal; NULL-Standort separat behandelt
  unique nulls not distinct (profile_id, role_id, location_id)
);

create index idx_user_roles_profile  on public.user_roles(profile_id);
create index idx_user_roles_location on public.user_roles(location_id);
create index idx_user_roles_role     on public.user_roles(role_id);
