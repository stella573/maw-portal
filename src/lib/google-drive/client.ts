import "server-only";
import { getDriveAccessToken } from "@/lib/google-drive/auth";

/**
 * Schlanker Google-Drive-REST-Client (Drive v3) – ohne externe Abhängigkeit.
 * Unterstützt Shared Drives (supportsAllDrives). Nur serverseitig verwenden.
 */

const FILES_URL = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER_MIME = "application/vnd.google-apps.folder";

const COMMON_QS = "supportsAllDrives=true&includeItemsFromAllDrives=true";

async function driveFetch(url: string, init: RequestInit): Promise<Response> {
  const token = await getDriveAccessToken();
  return fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    cache: "no-store",
  });
}

/** Escapet einen Wert für die Drive-Query (q-Parameter). */
function escapeQ(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export interface DriveFile {
  id: string;
  name: string;
  webViewLink?: string;
  parents?: string[];
}

/** Sucht einen Unterordner gegebenen Namens im Eltern-Ordner. */
async function findFolder(parentId: string, name: string): Promise<string | null> {
  const q =
    `'${escapeQ(parentId)}' in parents and ` +
    `name = '${escapeQ(name)}' and ` +
    `mimeType = '${FOLDER_MIME}' and trashed = false`;
  const url = `${FILES_URL}?q=${encodeURIComponent(q)}&fields=files(id,name)&${COMMON_QS}&pageSize=1`;
  const res = await driveFetch(url, { method: "GET" });
  if (!res.ok) {
    throw new Error(`Drive findFolder → HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as { files?: DriveFile[] };
  return data.files?.[0]?.id ?? null;
}

/** Erstellt einen Unterordner im Eltern-Ordner und gibt seine ID zurück. */
async function createFolder(parentId: string, name: string): Promise<string> {
  const res = await driveFetch(`${FILES_URL}?fields=id&${COMMON_QS}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
  if (!res.ok) {
    throw new Error(`Drive createFolder → HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as { id: string };
  return data.id;
}

// Prozessweiter Cache für Ordner-IDs (parentId/name → folderId).
const folderCache = new Map<string, string>();

/**
 * Stellt den kompletten Ordnerpfad unterhalb von `rootFolderId` sicher
 * (vorhandene Ordner werden wiederverwendet, fehlende erstellt) und gibt die
 * finale Ordner-ID zurück.
 */
export async function ensureGoogleDriveFolderPath(
  rootFolderId: string,
  folderPath: string[],
): Promise<string> {
  let parentId = rootFolderId;
  for (const rawSegment of folderPath) {
    const segment = rawSegment.trim();
    if (!segment) continue;
    const cacheKey = `${parentId}/${segment}`;
    const cached = folderCache.get(cacheKey);
    if (cached) {
      parentId = cached;
      continue;
    }
    let id = await findFolder(parentId, segment);
    if (!id) id = await createFolder(parentId, segment);
    folderCache.set(cacheKey, id);
    parentId = id;
  }
  return parentId;
}

export interface UploadResult {
  fileId: string;
  webViewLink: string | null;
  raw: unknown;
}

/**
 * Lädt eine Datei in den Zielordner hoch (multipart). `parents: [folderId]`.
 */
export async function uploadAttachmentToGoogleDrive(
  fileBuffer: Uint8Array,
  filename: string,
  mimeType: string,
  folderId: string,
): Promise<UploadResult> {
  const boundary = `maw-${crypto.randomUUID()}`;
  const metadata = { name: filename, parents: [folderId] };

  const pre =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType || "application/octet-stream"}\r\n\r\n`;
  const post = `\r\n--${boundary}--`;

  const body = Buffer.concat([
    Buffer.from(pre, "utf8"),
    Buffer.from(fileBuffer),
    Buffer.from(post, "utf8"),
  ]);

  const res = await driveFetch(
    `${UPLOAD_URL}?uploadType=multipart&fields=id,webViewLink&${COMMON_QS}`,
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  if (!res.ok) {
    throw new Error(`Drive upload → HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as { id: string; webViewLink?: string };
  return { fileId: data.id, webViewLink: data.webViewLink ?? null, raw: data };
}

/**
 * Verschiebt eine Datei in einen anderen Ordner (für „Neu einsortieren") und
 * benennt sie optional um.
 */
export async function moveGoogleDriveFile(
  fileId: string,
  newParentId: string,
  oldParentId: string | null,
  newName?: string,
): Promise<void> {
  const params = new URLSearchParams({ addParents: newParentId, fields: "id,parents" });
  if (oldParentId && oldParentId !== newParentId) params.set("removeParents", oldParentId);
  const url = `${FILES_URL}/${encodeURIComponent(fileId)}?${params.toString()}&${COMMON_QS}`;
  const res = await driveFetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(newName ? { name: newName } : {}),
  });
  if (!res.ok) {
    throw new Error(`Drive move → HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
}
