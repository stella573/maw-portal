-- ============================================================================
-- 0011 · MailDesk: Postfach-Aliase (weitere Empfangsadressen je Postfach)
-- ============================================================================
-- Ein Postfach hat eine primäre Adresse (mailboxes.email) und beliebig viele
-- Alias-Adressen. Eingehende Mails an einen Alias landen im selben Postfach.
-- Der Versand erfolgt weiterhin über die primäre Postfach-Adresse.

create table public.mailbox_aliases (
  id          uuid primary key default gen_random_uuid(),
  mailbox_id  uuid not null references public.mailboxes(id) on delete cascade,
  email       citext not null unique,
  created_at  timestamptz not null default now()
);

create index idx_mailbox_aliases_mailbox on public.mailbox_aliases(mailbox_id);

-- RLS analog zu mailboxes: Mitglieder/Verwalter dürfen lesen, Verwaltung via
-- mailboxes.manage.
alter table public.mailbox_aliases enable row level security;
alter table public.mailbox_aliases force row level security;

create policy mailbox_aliases_select on public.mailbox_aliases
  for select using (
    private.is_owner_or_admin()
    or private.has_permission('mailboxes.manage')
    or private.is_mailbox_member(mailbox_id)
  );

create policy mailbox_aliases_write on public.mailbox_aliases
  for all using (private.has_permission('mailboxes.manage'))
  with check (private.has_permission('mailboxes.manage'));
