-- ============================================================================
-- 0028 · Kennzeichnung "bereits in GetMyInvoices vorhanden"
-- ============================================================================
-- Wenn GetMyInvoices beim Upload feststellt, dass das Dokument bereits
-- existiert (Code 127), werten wir das als Erfolg. Dieses Flag unterscheidet
-- den Fall in der UI ("Bereits in GMI vorhanden", grün) von einem frisch
-- übertragenen Dokument.

alter table public.invoice_processing_jobs
  add column if not exists getmyinvoices_already_existed boolean not null default false;
