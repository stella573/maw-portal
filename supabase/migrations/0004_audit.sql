-- ============================================================================
-- 0004 · Audit-Log (append-only)
-- ============================================================================

create table public.audit_logs (
  id                uuid primary key default gen_random_uuid(),
  actor_profile_id  uuid references public.profiles(id) on delete set null,
  action            public.audit_action not null,
  entity_type       text,
  entity_id         uuid,
  location_id       uuid references public.locations(id) on delete set null,
  metadata          jsonb not null default '{}'::jsonb,
  ip                inet,
  created_at        timestamptz not null default now()
);

create index idx_audit_actor    on public.audit_logs(actor_profile_id);
create index idx_audit_action   on public.audit_logs(action);
create index idx_audit_entity   on public.audit_logs(entity_type, entity_id);
create index idx_audit_location on public.audit_logs(location_id);
create index idx_audit_created  on public.audit_logs(created_at desc);

-- ----------------------------------------------------------------------------
-- Schreib-Helfer (SECURITY DEFINER): erlaubt kontrolliertes Insert aus dem
-- Service-Layer/Triggern, ohne ein generisches INSERT-Recht zu öffnen.
-- ----------------------------------------------------------------------------
create or replace function public.log_audit(
  p_action       public.audit_action,
  p_entity_type  text default null,
  p_entity_id    uuid default null,
  p_location_id  uuid default null,
  p_metadata     jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_id    uuid;
begin
  -- aktuelles Profil aus dem JWT (NULL bei Service-Role/System)
  v_actor := nullif(auth.uid()::text, '')::uuid;

  insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id, location_id, metadata)
  values (v_actor, p_action, p_entity_type, p_entity_id, p_location_id, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- DB-seitiger Trigger: Ticket-Statuswechsel automatisch protokollieren.
-- (Service-Layer protokolliert zusätzlich fachliche Aktionen.)
-- ----------------------------------------------------------------------------
create or replace function private.audit_ticket_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    perform public.log_audit(
      'ticket.status_changed',
      'ticket',
      new.id,
      new.location_id,
      jsonb_build_object('from', old.status, 'to', new.status)
    );
  end if;
  return new;
end;
$$;

create trigger trg_tickets_audit_status
  after update on public.tickets
  for each row execute function private.audit_ticket_status_change();
