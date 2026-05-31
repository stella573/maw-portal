-- ============================================================================
-- 0018 · Personio-Standort-Sync: personio_employees.location_id
-- ============================================================================
-- Der Sync ordnet das Personio-„Office" einem Standort (locations) zu (Dorsten/
-- Hamm; unbekannt/leer = NULL = Global). Verknüpfung über location_id, damit
-- die Übersicht den echten Standort zeigt und „Zugang anlegen" ihn vorbelegen
-- kann.

alter table public.personio_employees
  add column if not exists location_id uuid references public.locations(id) on delete set null;

create index if not exists idx_personio_employees_location
  on public.personio_employees(location_id);
