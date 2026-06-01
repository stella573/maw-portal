-- ============================================================================
-- 0025 · KI-Anhang-Analyse: automatische Rechnungserkennung
-- ============================================================================
-- Zu jedem Anhang (public.attachments) wird serverseitig per KI (Claude)
-- entschieden, ob es sich um eine Rechnung handelt. Das Ergebnis – inkl. der
-- extrahierten Eckdaten (Rechnungsnummer, Datum, Lieferant, Betrag, Währung) –
-- wird hier dauerhaft gespeichert und dient zugleich als Cache: pro Anhang
-- existiert höchstens EINE Analyse (UNIQUE attachment_id), sodass derselbe
-- Anhang nicht mehrfach analysiert wird (Re-Analyse überschreibt die Zeile).
--
-- `status`  beschreibt den Verarbeitungs-Lebenszyklus (processing/completed/
--           error), `classification` das fachliche KI-Urteil.
-- Schreiben erfolgt ausschließlich serverseitig (Service-Role) – der KI-Aufruf
-- darf NIE aus dem Browser kommen. Der API-Key bleibt damit serverseitig.

create table public.attachment_ai_analysis (
  id                       uuid primary key default gen_random_uuid(),
  attachment_id            uuid not null unique
                             references public.attachments(id) on delete cascade,
  -- Verarbeitungsstatus (Lebenszyklus der Analyse).
  status                   text not null default 'processing'
                             check (status in ('processing', 'completed', 'error')),
  is_invoice               boolean not null default false,
  -- Sicherheit des Urteils, 0..1.
  confidence               numeric not null default 0
                             check (confidence >= 0 and confidence <= 1),
  -- Fachliches Urteil der KI.
  classification           text not null default 'unclear'
                             check (classification in (
                               'invoice',
                               'not_invoice',
                               'unclear',
                               'unsupported_file_type',
                               'error'
                             )),
  reason                   text,
  extracted_invoice_number text,
  extracted_invoice_date   date,
  extracted_vendor_name    text,
  extracted_total_amount   numeric,
  extracted_currency       text,
  -- Roh-Antwort der KI (zur Diagnose / Nachvollziehbarkeit).
  raw_ai_response          jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index idx_attachment_ai_analysis_attachment
  on public.attachment_ai_analysis(attachment_id);
create index idx_attachment_ai_analysis_classification
  on public.attachment_ai_analysis(classification);
create index idx_attachment_ai_analysis_invoice
  on public.attachment_ai_analysis(is_invoice) where is_invoice = true;
create index idx_attachment_ai_analysis_created
  on public.attachment_ai_analysis(created_at desc);

-- updated_at automatisch pflegen (Helper aus 0001/0023).
create trigger trg_attachment_ai_analysis_updated_at
  before update on public.attachment_ai_analysis
  for each row execute function private.set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS: lesen darf, wer den zugehörigen Anhang (über dessen Ticket) sehen darf –
-- exakt gekoppelt an die bestehende attachments-/tickets-Berechtigung.
-- Schreiben (insert/update/delete) hat KEINE Policy → ausschließlich die
-- Service-Role (umgeht RLS) in den geprüften Server-Pfaden darf schreiben.
-- ----------------------------------------------------------------------------
alter table public.attachment_ai_analysis enable row level security;
alter table public.attachment_ai_analysis force row level security;

create policy attachment_ai_analysis_select on public.attachment_ai_analysis
  for select using (
    exists (
      select 1
      from public.attachments a
      join public.tickets t on t.id = a.ticket_id
      where a.id = attachment_ai_analysis.attachment_id
        and (
          private.has_permission('tickets.read', t.location_id)
          or t.assignee_id = private.auth_profile_id()
        )
    )
  );
