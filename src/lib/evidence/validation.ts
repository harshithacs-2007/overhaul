/**
 * Server-side evidence upload validation — never trust client metadata.
 */

import { z } from "zod";
import type { EvidenceCategory } from "./types";
import { EVIDENCE_CATEGORIES } from "./types";

export const MAX_EVIDENCE_BYTES = 12 * 1024 * 1024; // 12 MB

export const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

export const ALLOWED_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".pdf",
]);

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

export const categorySchema = z.enum(EVIDENCE_CATEGORIES);

export function extensionOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  if (i < 0) return "";
  return filename.slice(i).toLowerCase();
}

/** Magic-byte sniff for common types — rejects obvious mismatches */
export function sniffMime(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (buffer.length >= 5 && buffer.toString("ascii", 0, 5) === "%PDF-") {
    return "application/pdf";
  }
  return null;
}

export interface ValidatedUpload {
  buffer: Buffer;
  mimeType: string;
  originalFilename: string;
  category: EvidenceCategory;
  sizeBytes: number;
}

export function validateUploadBuffer(opts: {
  buffer: Buffer;
  claimedMime: string;
  filename: string;
  categoryRaw: string;
}): { ok: true; value: ValidatedUpload } | { ok: false; error: string } {
  const { buffer, claimedMime, filename, categoryRaw } = opts;

  if (!buffer.length) {
    return { ok: false, error: "Empty file" };
  }
  if (buffer.length > MAX_EVIDENCE_BYTES) {
    return {
      ok: false,
      error: `File exceeds ${MAX_EVIDENCE_BYTES / (1024 * 1024)} MB limit`,
    };
  }

  const cat = categorySchema.safeParse(categoryRaw);
  if (!cat.success) {
    return { ok: false, error: "Invalid evidence category" };
  }

  const ext = extensionOf(filename);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      error: "Unsupported file extension. Use JPG, PNG, WebP, or PDF.",
    };
  }

  const sniffed = sniffMime(buffer);
  if (!sniffed) {
    return { ok: false, error: "Unrecognized or malformed file contents" };
  }

  const expectedFromExt = MIME_BY_EXT[ext];
  if (expectedFromExt && sniffed !== expectedFromExt) {
    return {
      ok: false,
      error: "File content does not match extension",
    };
  }

  const normalizedClaim = claimedMime === "image/jpg" ? "image/jpeg" : claimedMime;
  if (
    normalizedClaim &&
    ALLOWED_MIME.has(normalizedClaim) &&
    normalizedClaim !== sniffed &&
    !(normalizedClaim === "image/jpeg" && sniffed === "image/jpeg")
  ) {
    // Prefer sniffed; reject if client claims incompatible allowed type
    if (normalizedClaim.split("/")[0] !== sniffed.split("/")[0]) {
      return { ok: false, error: "Declared MIME type does not match file contents" };
    }
  }

  if (!ALLOWED_MIME.has(sniffed)) {
    return { ok: false, error: "Unsupported media type" };
  }

  return {
    ok: true,
    value: {
      buffer,
      mimeType: sniffed,
      originalFilename: filename,
      category: cat.data,
      sizeBytes: buffer.length,
    },
  };
}
