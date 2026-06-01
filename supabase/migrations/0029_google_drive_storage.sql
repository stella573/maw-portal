-- ============================================================================
-- 0029 · Google-Drive-Ablage: google_drive_storage_records
-- ============================================================================
-- Jeder Anhang wird zusätzlich sortiert in Google Drive abgelegt. Diese Tabelle
-- protokolliert die Ablage (Pfad, Datei-/Ordner-IDs, Status) und dient der
-- Duplikaterkennung über den Datei-Hash.
--
-- Schreiben nur serverseitig (Service-Role); Lesen an Ticket-Sichtbarkeit
-- gekoppelt (wie attachments).

create table public.google_drive_storage_records (
  id                          uuid primary key default gen_random_uuid(),
  attachment_id               uuid not null unique
                                references public.attachments(id) on delete cascade,
  invoice_processing_job_id   uuid
                                references public.invoice_processing_jobs(id) on delete set null,
  file_hash                   text,
  original_filename           text,
  stored_filename             text,
  mime_type                   text,
  google_drive_file_id        text,
  google_drive_folder_id      text,
  google_drive_web_view_link  text,
  google_drive_path           text,
  storage_category            text not null default 'unclear'
                                check (storage_category in (
                                  'invoice',
                                  'invoice_supplier_unclear',
                                  'not_invoice',
                                  'unclear',
                                  'unsupported_file_type',
                                  'error'
                                )),
  upload_status               text not null default 'pending'
                                check (upload_status in (
                                  'pending',
                                  'folder_creation_started',
                                  'folder_ready',
                                  'upload_started',
                                  'uploaded',
                                  'duplicate_skipped',
                                  'failed'
                                )),
  error_message               text,
  raw_google_drive_response   jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index idx_gdsr_attachment on public.google_drive_storage_records(attachment_id);
create index idx_gdsr_file_hash  on public.google_drive_storage_records(file_hash);
create index idx_gdsr_status     on public.google_drive_storage_records(upload_status);

create trigger trg_gdsr_updated_at
  before update on public.google_drive_storage_records
  for each row execute function private.set_updated_at();

alter table public.google_drive_storage_records enable row level security;
alter table public.google_drive_storage_records force row level security;

create policy gdsr_select on public.google_drive_storage_records
  for select using (
    exists (
      select 1
      from public.attachments a
      join public.tickets t on t.id = a.ticket_id
      where a.id = google_drive_storage_records.attachment_id
        and (
          private.has_permission('tickets.read', t.location_id)
          or t.assignee_id = private.auth_profile_id()
        )
    )
  );
