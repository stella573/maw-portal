import "server-only";
import { createHash } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * Helfer rund um Anhang-Dateien für die KI-Verarbeitung (serverseitig):
 * MIME-Auflösung, Anthropic-Content-Block und SHA-256-Hash (Duplikaterkennung).
 */

export interface ResolvedMedia {
  kind: "image" | "pdf";
  mediaType: "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
}

/** Bestimmt den Medientyp aus Dateiname/Content-Type, oder null (unsupported). */
export function resolveMedia(
  fileName: string,
  contentType: string | null,
): ResolvedMedia | null {
  const mime = (contentType ?? "").toLowerCase().split(";")[0]?.trim() ?? "";
  const ext = fileName.toLowerCase().split(".").pop() ?? "";

  if (mime === "application/pdf" || ext === "pdf") {
    return { kind: "pdf", mediaType: "application/pdf" };
  }
  if (mime === "image/png" || ext === "png") {
    return { kind: "image", mediaType: "image/png" };
  }
  if (mime === "image/webp" || ext === "webp") {
    return { kind: "image", mediaType: "image/webp" };
  }
  if (mime === "image/jpeg" || mime === "image/jpg" || ext === "jpg" || ext === "jpeg") {
    return { kind: "image", mediaType: "image/jpeg" };
  }
  return null;
}

/** Baut den Anthropic-Content-Block (document/image) aus rohen Bytes. */
export function buildFileBlock(
  media: ResolvedMedia,
  bytes: Uint8Array,
): Anthropic.ContentBlockParam {
  const data = Buffer.from(bytes).toString("base64");
  if (media.kind === "pdf") {
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data },
    };
  }
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: media.mediaType as "image/jpeg" | "image/png" | "image/webp",
      data,
    },
  };
}

/** SHA-256-Hex-Hash des Datei-Inhalts (Duplikaterkennung / Cache-Key). */
export function fileHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
