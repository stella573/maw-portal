import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env";
import { fileHash } from "@/lib/ai/attachment-media";
import { isGoogleDriveConfigured } from "@/lib/google-drive/auth";
import {
  ensureGoogleDriveFolderPath,
  uploadAttachmentToGoogleDrive,
  moveGoogleDriveFile,
} from "@/lib/google-drive/client";
import {
  buildGoogleDriveStoragePath,
  type DrivePathInvoiceData,
  type DrivePathJob,
} from "@/lib/google-drive/path";
import type { DriveRecord } from "@/lib/ai/invoice-types";
import type { Database, Tables, Json } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Orchestriert die Google-Drive-Ablage eines Anhangs: Duplikaterkennung per
 * Hash → Pfad bestimmen → Ordner sicherstellen → Datei hochladen. Robust und
 * nicht-blockierend: Fehler werden als Status gespeichert, ohne die übrige
 * Verarbeitung (KI/GetMyInvoices) zu beeinträchtigen.
 */

type Admin = SupabaseClient<Database>;
type Row = Tables<"google_drive_storage_records">;
type JobRow = Tables<"invoice_processing_jobs">;
type ExtractedRow = Tables<"extracted_invoice_data">;

const BUCKET = "mail-attachments";

export function mapDriveRecord(row: Row): DriveRecord {
  return {
    attachmentId: row.attachment_id,
    status: row.upload_status,
    category: row.storage_category,
    path: row.google_drive_path,
    storedFilename: row.stored_filename,
    webViewLink: row.google_drive_web_view_link,
    fileId: row.google_drive_file_id,
    errorMessage: row.error_message,
    updatedAt: row.updated_at,
  };
}

export async function getDriveRecordsForAttachments(
  supabase: Admin,
  attachmentIds: string[],
): Promise<Map<string, DriveRecord>> {
  const map = new Map<string, DriveRecord>();
  if (attachmentIds.length === 0) return map;
  const { data } = await supabase
    .from("google_drive_storage_records")
    .select("*")
    .in("attachment_id", attachmentIds);
  for (const row of (data ?? []) as Row[]) {
    map.set(row.attachment_id, mapDriveRecord(row));
  }
  return map;
}

async function patch(admin: Admin, attachmentId: string, patch: Database["public"]["Tables"]["google_drive_storage_records"]["Update"]): Promise<Row> {
  const { data, error } = await admin
    .from("google_drive_storage_records")
    .update(patch)
    .eq("attachment_id", attachmentId)
    .select("*")
    .single();
  if (error || !data) throw new Error(`Drive-Record-Update fehlgeschlagen: ${error?.message ?? "?"}`);
  return data as Row;
}

async function ensureRecord(admin: Admin, attachmentId: string): Promise<void> {
  await admin
    .from("google_drive_storage_records")
    .upsert({ attachment_id: attachmentId }, { onConflict: "attachment_id" });
}

async function getRecord(admin: Admin, attachmentId: string): Promise<Row | null> {
  const { data } = await admin
    .from("google_drive_storage_records")
    .select("*")
    .eq("attachment_id", attachmentId)
    .maybeSingle();
  return (data as Row) ?? null;
}

async function loadContext(admin: Admin, attachmentId: string) {
  const { data: attachment } = await admin
    .from("attachments")
    .select("id, storage_path, file_name, content_type, created_at")
    .eq("id", attachmentId)
    .maybeSingle();
  const { data: job } = await admin
    .from("invoice_processing_jobs")
    .select("*")
    .eq("attachment_id", attachmentId)
    .maybeSingle();
  const { data: extracted } = await admin
    .from("extracted_invoice_data")
    .select("*")
    .eq("attachment_id", attachmentId)
    .maybeSingle();
  return {
    attachment,
    job: (job as JobRow) ?? null,
    extracted: (extracted as ExtractedRow) ?? null,
  };
}

function buildPathInputs(job: JobRow | null, extracted: ExtractedRow | null) {
  const supplierName = job?.matched_supplier_name ?? extracted?.vendor_name ?? null;
  const invoiceData: DrivePathInvoiceData = {
    invoiceDate: extracted?.invoice_date ?? null,
    vendorName: supplierName,
    invoiceNumber: extracted?.invoice_number ?? null,
    grossAmount: extracted?.gross_amount == null ? null : Number(extracted.gross_amount),
    currency: extracted?.currency ?? null,
  };
  const jobInput: DrivePathJob = {
    status: job?.status ?? "uploaded",
    classification: job?.classification ?? "unclear",
    isInvoice: job?.is_invoice ?? false,
    matchedSupplierName: job?.matched_supplier_name ?? null,
  };
  return { invoiceData, jobInput };
}

const DONE_STATUSES = new Set(["uploaded", "duplicate_skipped"]);

/** Legt den Anhang in Google Drive ab (oder gibt das vorhandene Ergebnis zurück). */
export async function storeAttachmentInGoogleDrive(
  attachmentId: string,
  opts: { force?: boolean } = {},
): Promise<DriveRecord> {
  const admin = createAdminClient();
  await ensureRecord(admin, attachmentId);

  if (!isGoogleDriveConfigured()) {
    const row = await patch(admin, attachmentId, {
      upload_status: "failed",
      error_message: "Google Drive ist nicht konfiguriert (Service-Account/Root-Ordner fehlen).",
    });
    return mapDriveRecord(row);
  }

  if (!opts.force) {
    const existing = await getRecord(admin, attachmentId);
    if (existing && DONE_STATUSES.has(existing.upload_status)) {
      return mapDriveRecord(existing);
    }
  }

  const { attachment, job, extracted } = await loadContext(admin, attachmentId);
  if (!attachment) {
    const row = await patch(admin, attachmentId, {
      upload_status: "failed",
      error_message: "Anhang nicht gefunden.",
    });
    return mapDriveRecord(row);
  }

  // Datei laden + Hash.
  const { data: blob, error: dlErr } = await admin.storage.from(BUCKET).download(attachment.storage_path);
  if (dlErr || !blob) {
    const row = await patch(admin, attachmentId, {
      upload_status: "failed",
      error_message: "Datei konnte nicht geladen werden.",
    });
    return mapDriveRecord(row);
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const hash = fileHash(bytes);

  const { invoiceData, jobInput } = buildPathInputs(job, extracted);
  const { category, folderPath, filename } = buildGoogleDriveStoragePath(
    { fileName: attachment.file_name, createdAt: attachment.created_at },
    invoiceData,
    jobInput,
  );
  const pathString = `/${folderPath.join("/")}/${filename}`;

  // Duplikaterkennung: gleiche Datei bereits in Drive → referenzieren, nicht erneut hochladen.
  if (!opts.force) {
    const { data: dup } = await admin
      .from("google_drive_storage_records")
      .select("*")
      .eq("file_hash", hash)
      .neq("attachment_id", attachmentId)
      .in("upload_status", ["uploaded", "duplicate_skipped"])
      .not("google_drive_file_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (dup) {
      const d = dup as Row;
      const row = await patch(admin, attachmentId, {
        upload_status: "duplicate_skipped",
        file_hash: hash,
        invoice_processing_job_id: job?.id ?? null,
        original_filename: attachment.file_name,
        stored_filename: d.stored_filename,
        mime_type: attachment.content_type,
        storage_category: category,
        google_drive_file_id: d.google_drive_file_id,
        google_drive_folder_id: d.google_drive_folder_id,
        google_drive_web_view_link: d.google_drive_web_view_link,
        google_drive_path: d.google_drive_path,
        error_message: null,
      });
      return mapDriveRecord(row);
    }
  }

  const { GOOGLE_DRIVE_ROOT_FOLDER_ID } = getServerEnv();
  const rootId = GOOGLE_DRIVE_ROOT_FOLDER_ID!;

  try {
    await patch(admin, attachmentId, {
      upload_status: "folder_creation_started",
      file_hash: hash,
      invoice_processing_job_id: job?.id ?? null,
      original_filename: attachment.file_name,
      mime_type: attachment.content_type,
      storage_category: category,
      google_drive_path: pathString,
      error_message: null,
    });

    const folderId = await ensureGoogleDriveFolderPath(rootId, folderPath);
    await patch(admin, attachmentId, { upload_status: "upload_started", google_drive_folder_id: folderId });

    const result = await uploadAttachmentToGoogleDrive(
      bytes,
      filename,
      attachment.content_type ?? "application/octet-stream",
      folderId,
    );

    const row = await patch(admin, attachmentId, {
      upload_status: "uploaded",
      stored_filename: filename,
      google_drive_file_id: result.fileId,
      google_drive_folder_id: folderId,
      google_drive_web_view_link: result.webViewLink,
      google_drive_path: pathString,
      raw_google_drive_response: (result.raw ?? null) as Json,
      error_message: null,
    });
    return mapDriveRecord(row);
  } catch (err) {
    console.error("[drive-storage]", err);
    const row = await patch(admin, attachmentId, {
      upload_status: "failed",
      error_message: err instanceof Error ? err.message.slice(0, 500) : "Drive-Ablage fehlgeschlagen.",
    });
    return mapDriveRecord(row);
  }
}

/**
 * Sortiert eine bereits abgelegte Datei neu ein (z. B. nach Korrektur des
 * Lieferanten): berechnet den Zielpfad neu und verschiebt/benennt die Datei.
 */
export async function resortAttachmentInGoogleDrive(attachmentId: string): Promise<DriveRecord> {
  const admin = createAdminClient();
  const record = await getRecord(admin, attachmentId);

  // Noch nicht (erfolgreich) abgelegt → normale Ablage durchführen.
  if (!record || !record.google_drive_file_id) {
    return storeAttachmentInGoogleDrive(attachmentId, { force: true });
  }
  if (!isGoogleDriveConfigured()) {
    const row = await patch(admin, attachmentId, {
      upload_status: "failed",
      error_message: "Google Drive ist nicht konfiguriert.",
    });
    return mapDriveRecord(row);
  }

  const { attachment, job, extracted } = await loadContext(admin, attachmentId);
  if (!attachment) return mapDriveRecord(record);

  const { invoiceData, jobInput } = buildPathInputs(job, extracted);
  const { category, folderPath, filename } = buildGoogleDriveStoragePath(
    { fileName: attachment.file_name, createdAt: attachment.created_at },
    invoiceData,
    jobInput,
  );
  const pathString = `/${folderPath.join("/")}/${filename}`;
  const { GOOGLE_DRIVE_ROOT_FOLDER_ID } = getServerEnv();

  try {
    const folderId = await ensureGoogleDriveFolderPath(GOOGLE_DRIVE_ROOT_FOLDER_ID!, folderPath);
    await moveGoogleDriveFile(
      record.google_drive_file_id,
      folderId,
      record.google_drive_folder_id,
      filename,
    );
    const row = await patch(admin, attachmentId, {
      upload_status: "uploaded",
      storage_category: category,
      stored_filename: filename,
      google_drive_folder_id: folderId,
      google_drive_path: pathString,
      error_message: null,
    });
    return mapDriveRecord(row);
  } catch (err) {
    console.error("[drive-storage:resort]", err);
    const row = await patch(admin, attachmentId, {
      upload_status: "failed",
      error_message: err instanceof Error ? err.message.slice(0, 500) : "Neu einsortieren fehlgeschlagen.",
    });
    return mapDriveRecord(row);
  }
}
