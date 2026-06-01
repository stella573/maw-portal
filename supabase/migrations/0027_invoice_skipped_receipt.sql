-- ============================================================================
-- 0027 · Job-Status "skipped_receipt"
-- ============================================================================
-- Wenn eine E-Mail sowohl eine Rechnung (Invoice) als auch einen Beleg
-- (Receipt) als Anhang enthält, soll nur die Rechnung zu GetMyInvoices
-- übertragen werden. Der Beleg wird mit dem Status "skipped_receipt" markiert
-- und NICHT hochgeladen.

alter table public.invoice_processing_jobs
  drop constraint if exists invoice_processing_jobs_status_check;

alter table public.invoice_processing_jobs
  add constraint invoice_processing_jobs_status_check
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
    'skipped_receipt',
    'error'
  ));
