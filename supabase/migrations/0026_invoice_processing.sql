-- ============================================================================
-- 0026 · Automatische Rechnungsverarbeitung (Claude → GetMyInvoices)
-- ============================================================================
-- Erweitert die einfache Rechnungserkennung (0025) zu einer vollständigen
-- Verarbeitungs-Pipeline:
--   1. Datei-Hash (Duplikaterkennung / Cache)
--   2. KI-Erkennung + strukturierte Extraktion (Claude, Tool-Use)
--   3. Lieferanten-Matching gegen GetMyInvoices-Companies
--   4. Upload zu GetMyInvoices
--
-- Die einfache Tabelle attachment_ai_analysis (0025) wird durch die beiden
-- neuen Tabellen ersetzt (sie hatte noch keine Produktivdaten). So gibt es nur
-- EINE Quelle der Wahrheit für die Rechnungsverarbeitung.
--
-- Schreiben erfolgt ausschließlich serverseitig (Service-Role); Lesen ist – wie
-- bei attachments – an die Ticket-Sichtbarkeit gekoppelt. KI-/GMI-API-Keys
-- bleiben serverseitig.

drop table if exists public.attachment_ai_analysis cascade;

-- ----------------------------------------------------------------------------
-- invoice_processing_jobs · ein Verarbeitungs-Job je Anhang
-- ----------------------------------------------------------------------------
create table public.invoice_processing_jobs (
  id                         uuid primary key default gen_random_uuid(),
  attachment_id              uuid not null unique
                               references public.attachments(id) on delete cascade,
  -- SHA-256 des Datei-Inhalts (Duplikaterkennung).
  file_hash                  text,
  status                     text not null default 'uploaded'
                               check (status in (
                                 'uploaded',
                                 'ai_check_started',
                                 'unsupported_file_type',
                                 'not_invoice',
                                 'invoice_detected',
                                 'extraction_started',
                                 'extraction_completed',
                                 'supplier_matching_started',
                                 'supplier_matched',
                                 'supplier_match_unclear',
                                 'needs_manual_supplier_review',
                                 'getmyinvoices_upload_started',
                                 'getmyinvoices_upload_completed',
                                 'getmyinvoices_upload_failed',
                                 'error'
                               )),
  is_invoice                 boolean not null default false,
  invoice_confidence         numeric not null default 0
                               check (invoice_confidence >= 0 and invoice_confidence <= 1),
  classification             text not null default 'unclear'
                               check (classification in (
                                 'invoice', 'not_invoice', 'unclear',
                                 'unsupported_file_type', 'error'
                               )),
  supplier_match_score       numeric not null default 0
                               check (supplier_match_score >= 0 and supplier_match_score <= 1),
  matched_supplier_id        text,
  matched_supplier_name      text,
  supplier_match_reason      text,
  -- Wurde der Lieferant manuell vom Nutzer bestätigt?
  manual_supplier_confirmed  boolean not null default false,
  getmyinvoices_document_id  text,
  -- Welches KI-Modell die Extraktion letztlich geliefert hat (Haiku/Sonnet).
  model_used                 text,
  error_message              text,
  raw_claude_response        jsonb,
  raw_getmyinvoices_response jsonb,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create index idx_ipj_attachment   on public.invoice_processing_jobs(attachment_id);
create index idx_ipj_file_hash    on public.invoice_processing_jobs(file_hash);
create index idx_ipj_status       on public.invoice_processing_jobs(status);
create index idx_ipj_classification on public.invoice_processing_jobs(classification);
create index idx_ipj_created      on public.invoice_processing_jobs(created_at desc);

create trigger trg_ipj_updated_at
  before update on public.invoice_processing_jobs
  for each row execute function private.set_updated_at();

-- ----------------------------------------------------------------------------
-- extracted_invoice_data · strukturierte Extraktion je Job
-- ----------------------------------------------------------------------------
create table public.extracted_invoice_data (
  id                       uuid primary key default gen_random_uuid(),
  attachment_id            uuid not null
                             references public.attachments(id) on delete cascade,
  invoice_processing_job_id uuid not null unique
                             references public.invoice_processing_jobs(id) on delete cascade,
  -- Lieferant
  vendor_name              text,
  vendor_address           text,
  vendor_vat_id            text,
  vendor_tax_number        text,
  vendor_iban              text,
  vendor_email             text,
  vendor_website           text,
  vendor_country           text,
  -- Rechnung
  invoice_number           text,
  invoice_date             date,
  service_date             date,
  due_date                 date,
  net_amount               numeric,
  tax_amount               numeric,
  gross_amount             numeric,
  currency                 text,
  customer_number          text,
  order_reference          text,
  description              text,
  payment_status           text,
  document_language        text,
  -- Positionen
  line_items               jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index idx_eid_attachment on public.extracted_invoice_data(attachment_id);
create index idx_eid_job        on public.extracted_invoice_data(invoice_processing_job_id);

create trigger trg_eid_updated_at
  before update on public.extracted_invoice_data
  for each row execute function private.set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS: Lesen an Ticket-Sichtbarkeit gekoppelt; Schreiben nur Service-Role.
-- ----------------------------------------------------------------------------
alter table public.invoice_processing_jobs enable row level security;
alter table public.invoice_processing_jobs force row level security;
alter table public.extracted_invoice_data  enable row level security;
alter table public.extracted_invoice_data  force row level security;

create policy ipj_select on public.invoice_processing_jobs
  for select using (
    exists (
      select 1
      from public.attachments a
      join public.tickets t on t.id = a.ticket_id
      where a.id = invoice_processing_jobs.attachment_id
        and (
          private.has_permission('tickets.read', t.location_id)
          or t.assignee_id = private.auth_profile_id()
        )
    )
  );

create policy eid_select on public.extracted_invoice_data
  for select using (
    exists (
      select 1
      from public.attachments a
      join public.tickets t on t.id = a.ticket_id
      where a.id = extracted_invoice_data.attachment_id
        and (
          private.has_permission('tickets.read', t.location_id)
          or t.assignee_id = private.auth_profile_id()
        )
    )
  );
