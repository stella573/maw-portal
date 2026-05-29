-- ============================================================================
-- 0003 · MailDesk · Ticketsystem
-- ============================================================================

-- ----------------------------------------------------------------------------
-- customers · Kontakte / Absender (über E-Mail dedupliziert)
-- ----------------------------------------------------------------------------
create table public.customers (
  id          uuid primary key default gen_random_uuid(),
  email       citext not null unique,
  full_name   text,
  phone       text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_customers_updated_at
  before update on public.customers
  for each row execute function private.set_updated_at();

-- ----------------------------------------------------------------------------
-- tags · frei definierbare Schlagworte
-- ----------------------------------------------------------------------------
create table public.tags (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  color       text not null default '#64748b',
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- tickets · Vorgang
-- ----------------------------------------------------------------------------
create table public.tickets (
  id              uuid primary key default gen_random_uuid(),
  reference       text not null unique default ('MAW-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  subject         text not null,
  status          public.ticket_status   not null default 'open',
  priority        public.ticket_priority not null default 'normal',
  customer_id     uuid references public.customers(id) on delete set null,
  location_id     uuid references public.locations(id) on delete set null,
  assignee_id     uuid references public.profiles(id) on delete set null,
  created_by      uuid references public.profiles(id) on delete set null,
  last_message_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_tickets_status        on public.tickets(status);
create index idx_tickets_priority      on public.tickets(priority);
create index idx_tickets_location      on public.tickets(location_id);
create index idx_tickets_assignee      on public.tickets(assignee_id);
create index idx_tickets_customer      on public.tickets(customer_id);
create index idx_tickets_last_message  on public.tickets(last_message_at desc);
-- Volltext-Suche über Betreff (einfacher Start; FTS-Ausbau in Phase 1.3)
create index idx_tickets_subject_trgm  on public.tickets using gin (to_tsvector('simple', subject));

create trigger trg_tickets_updated_at
  before update on public.tickets
  for each row execute function private.set_updated_at();

-- ----------------------------------------------------------------------------
-- messages · Nachrichten eines Tickets (inbound/outbound)
-- ----------------------------------------------------------------------------
create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  ticket_id       uuid not null references public.tickets(id) on delete cascade,
  direction       public.message_direction not null,
  channel         public.message_channel   not null default 'email',
  author_id       uuid references public.profiles(id) on delete set null, -- bei outbound
  from_email      citext,
  to_email        citext,
  subject         text,
  body_text       text,
  body_html       text,
  is_draft        boolean not null default false,
  provider_id     text,        -- Resend message id
  raw             jsonb,       -- Rohdaten des eingehenden Webhooks
  created_at      timestamptz not null default now()
);

create index idx_messages_ticket    on public.messages(ticket_id, created_at);
create index idx_messages_direction on public.messages(direction);
create index idx_messages_draft     on public.messages(ticket_id) where is_draft = true;

-- Ticket.last_message_at bei neuer (nicht-Entwurf) Nachricht aktualisieren
create or replace function private.touch_ticket_last_message()
returns trigger
language plpgsql
as $$
begin
  if new.is_draft is false then
    update public.tickets
      set last_message_at = new.created_at,
          updated_at = now()
    where id = new.ticket_id;
  end if;
  return new;
end;
$$;

create trigger trg_messages_touch_ticket
  after insert on public.messages
  for each row execute function private.touch_ticket_last_message();

-- ----------------------------------------------------------------------------
-- notes · interne Notizen (nie für Kunden sichtbar)
-- ----------------------------------------------------------------------------
create table public.notes (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.tickets(id) on delete cascade,
  author_id   uuid references public.profiles(id) on delete set null,
  body        text not null,
  created_at  timestamptz not null default now()
);

create index idx_notes_ticket on public.notes(ticket_id, created_at);

-- ----------------------------------------------------------------------------
-- ticket_tags · n:m Ticket ↔ Tag
-- ----------------------------------------------------------------------------
create table public.ticket_tags (
  ticket_id   uuid not null references public.tickets(id) on delete cascade,
  tag_id      uuid not null references public.tags(id) on delete cascade,
  primary key (ticket_id, tag_id)
);

create index idx_ticket_tags_tag on public.ticket_tags(tag_id);

-- ----------------------------------------------------------------------------
-- templates · Antwortvorlagen
-- ----------------------------------------------------------------------------
create table public.templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  subject     text,
  body        text not null,
  location_id uuid references public.locations(id) on delete cascade, -- NULL = global
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_templates_location on public.templates(location_id);

create trigger trg_templates_updated_at
  before update on public.templates
  for each row execute function private.set_updated_at();

-- ----------------------------------------------------------------------------
-- attachments · Metadaten zu Anhängen (Supabase Storage), vorbereitet
-- ----------------------------------------------------------------------------
create table public.attachments (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid references public.messages(id) on delete cascade,
  ticket_id    uuid references public.tickets(id) on delete cascade,
  storage_path text not null,         -- Pfad im Storage-Bucket
  file_name    text not null,
  content_type text,
  size_bytes   bigint,
  created_at   timestamptz not null default now()
);

create index idx_attachments_message on public.attachments(message_id);
create index idx_attachments_ticket  on public.attachments(ticket_id);
