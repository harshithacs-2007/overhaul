/**
 * Evidence storage abstraction.
 * Local/dev: filesystem under .data or OVERHAUL_EVIDENCE_DIR.
 * Vercel/serverless: in-memory (read-only FS) — temporary, stated honestly.
 */

import { mkdir, writeFile, readFile, unlink, access } from "fs/promises";
import path from "path";
import { createEvidenceId } from "./types";

export interface StoredObject {
  storageKey: string;
  absolutePath: string;
  persistence: "temporary" | "permanent";
  mimeType: string;
  sizeBytes: number;
  originalFilename: string;
  createdAt: string;
}

export interface EvidenceStorage {
  put(
    buffer: Buffer,
    meta: { mimeType: string; originalFilename: string }
  ): Promise<StoredObject>;
  get(storageKey: string): Promise<{ buffer: Buffer; meta: StoredObject } | null>;
  remove(storageKey: string): Promise<boolean>;
}

const META_SUFFIX = ".meta.json";

function sanitizeKeySegment(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}

function resolveUnderRoot(root: string, storageKey: string): string | null {
  const base = path.basename(storageKey);
  if (!base || base.includes("..")) return null;
  const absolutePath = path.resolve(root, base);
  const resolvedRoot = path.resolve(root);
  if (
    absolutePath !== resolvedRoot &&
    !absolutePath.startsWith(resolvedRoot + path.sep)
  ) {
    return null;
  }
  return absolutePath;
}

export function sanitizeFilename(name: string): string {
  const base = path.basename(name).replace(/[\0\r\n]/g, "");
  const cleaned = base.replace(/[^a-zA-Z0-9._\-\s()]/g, "_").trim();
  return cleaned.slice(0, 120) || "upload.bin";
}

function isServerlessRuntime(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.VERCEL_ENV
  );
}

function resolveRoot(): { root: string; persistence: "temporary" | "permanent" } {
  const configured = process.env.OVERHAUL_EVIDENCE_DIR?.trim();
  if (configured) {
    return { root: path.resolve(configured), persistence: "permanent" };
  }
  if (isServerlessRuntime()) {
    // Writable scratch only — still temporary across instances
    return {
      root: path.join("/tmp", "overhaul-evidence"),
      persistence: "temporary",
    };
  }
  return {
    root: path.join(process.cwd(), ".data", "overhaul-evidence"),
    persistence: "temporary",
  };
}

type MemEntry = { buffer: Buffer; meta: StoredObject };

function globalMemoryStore(): Map<string, MemEntry> {
  const g = globalThis as unknown as { __overhaulEvidenceMem?: Map<string, MemEntry> };
  if (!g.__overhaulEvidenceMem) g.__overhaulEvidenceMem = new Map();
  return g.__overhaulEvidenceMem;
}

/** In-process store for serverless where durable FS is unavailable */
export class MemoryEvidenceStorage implements EvidenceStorage {
  async put(
    buffer: Buffer,
    meta: { mimeType: string; originalFilename: string }
  ): Promise<StoredObject> {
    const id = createEvidenceId();
    const safeName = sanitizeFilename(meta.originalFilename);
    const storageKey = `${sanitizeKeySegment(id)}_${sanitizeKeySegment(safeName)}`;
    const stored: StoredObject = {
      storageKey,
      absolutePath: `memory://${storageKey}`,
      persistence: "temporary",
      mimeType: meta.mimeType,
      sizeBytes: buffer.length,
      originalFilename: safeName,
      createdAt: new Date().toISOString(),
    };
    globalMemoryStore().set(storageKey, {
      buffer: Buffer.from(buffer),
      meta: stored,
    });
    return stored;
  }

  async get(
    storageKey: string
  ): Promise<{ buffer: Buffer; meta: StoredObject } | null> {
    const key = path.basename(storageKey);
    const hit = globalMemoryStore().get(key);
    if (!hit) return null;
    return { buffer: hit.buffer, meta: hit.meta };
  }

  async remove(storageKey: string): Promise<boolean> {
    const key = path.basename(storageKey);
    return globalMemoryStore().delete(key);
  }
}

export class FileEvidenceStorage implements EvidenceStorage {
  private root: string;
  private persistence: "temporary" | "permanent";

  constructor() {
    const r = resolveRoot();
    this.root = r.root;
    this.persistence = r.persistence;
  }

  private async ensureRoot(): Promise<void> {
    await mkdir(/*turbopackIgnore: true*/ this.root, { recursive: true });
  }

  async put(
    buffer: Buffer,
    meta: { mimeType: string; originalFilename: string }
  ): Promise<StoredObject> {
    await this.ensureRoot();
    const id = createEvidenceId();
    const safeName = sanitizeFilename(meta.originalFilename);
    const storageKey = `${sanitizeKeySegment(id)}_${sanitizeKeySegment(safeName)}`;
    const absolutePath = resolveUnderRoot(this.root, storageKey);
    if (!absolutePath) throw new Error("Invalid storage path");
    await writeFile(/*turbopackIgnore: true*/ absolutePath, buffer);
    const stored: StoredObject = {
      storageKey,
      absolutePath,
      persistence: this.persistence,
      mimeType: meta.mimeType,
      sizeBytes: buffer.length,
      originalFilename: safeName,
      createdAt: new Date().toISOString(),
    };
    await writeFile(
      /*turbopackIgnore: true*/ absolutePath + META_SUFFIX,
      JSON.stringify(stored),
      "utf8"
    );
    return stored;
  }

  async get(
    storageKey: string
  ): Promise<{ buffer: Buffer; meta: StoredObject } | null> {
    const absolutePath = resolveUnderRoot(this.root, storageKey);
    if (!absolutePath) return null;
    try {
      await access(/*turbopackIgnore: true*/ absolutePath);
      const buffer = await readFile(/*turbopackIgnore: true*/ absolutePath);
      let meta: StoredObject;
      try {
        meta = JSON.parse(
          await readFile(/*turbopackIgnore: true*/ absolutePath + META_SUFFIX, "utf8")
        ) as StoredObject;
      } catch {
        meta = {
          storageKey: path.basename(storageKey),
          absolutePath,
          persistence: this.persistence,
          mimeType: "application/octet-stream",
          sizeBytes: buffer.length,
          originalFilename: path.basename(storageKey),
          createdAt: new Date().toISOString(),
        };
      }
      return { buffer, meta };
    } catch {
      return null;
    }
  }

  async remove(storageKey: string): Promise<boolean> {
    const absolutePath = resolveUnderRoot(this.root, storageKey);
    if (!absolutePath) return false;
    try {
      await unlink(/*turbopackIgnore: true*/ absolutePath);
      try {
        await unlink(/*turbopackIgnore: true*/ absolutePath + META_SUFFIX);
      } catch {
        /* meta optional */
      }
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Tries filesystem; on failure (e.g. read-only serverless root) uses memory.
 * Prefer memory on known serverless hosts without OVERHAUL_EVIDENCE_DIR.
 */
export class HybridEvidenceStorage implements EvidenceStorage {
  private primary: EvidenceStorage;
  private fallback: MemoryEvidenceStorage;
  private useMemory = false;

  constructor() {
    const configured = Boolean(process.env.OVERHAUL_EVIDENCE_DIR?.trim());
    this.fallback = new MemoryEvidenceStorage();
    if (!configured && isServerlessRuntime()) {
      this.primary = this.fallback;
      this.useMemory = true;
    } else {
      this.primary = new FileEvidenceStorage();
    }
  }

  async put(
    buffer: Buffer,
    meta: { mimeType: string; originalFilename: string }
  ): Promise<StoredObject> {
    if (this.useMemory) return this.fallback.put(buffer, meta);
    try {
      return await this.primary.put(buffer, meta);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        /ENOENT|EROFS|EACCES|read-only|mkdir/i.test(msg) ||
        isServerlessRuntime()
      ) {
        this.useMemory = true;
        return this.fallback.put(buffer, meta);
      }
      throw err;
    }
  }

  async get(
    storageKey: string
  ): Promise<{ buffer: Buffer; meta: StoredObject } | null> {
    const fromPrimary = await this.primary.get(storageKey);
    if (fromPrimary) return fromPrimary;
    return this.fallback.get(storageKey);
  }

  async remove(storageKey: string): Promise<boolean> {
    const a = await this.primary.remove(storageKey);
    const b = await this.fallback.remove(storageKey);
    return a || b;
  }
}

let singleton: EvidenceStorage | null = null;

export function getEvidenceStorage(): EvidenceStorage {
  if (!singleton) singleton = new HybridEvidenceStorage();
  return singleton;
}

/** Build a data-URL preview for session UX when object storage is temporary */
export function buildInlinePreviewUrl(
  buffer: Buffer,
  mimeType: string,
  maxBytes = 1_500_000
): string | null {
  if (!mimeType.startsWith("image/")) return null;
  if (buffer.length > maxBytes) return null;
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

export function userFacingStorageError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/ENOENT|EROFS|EACCES|mkdir|read-only/i.test(msg)) {
    return "Upload could not be completed. Storage is temporarily unavailable.";
  }
  if (/too large|size|limit/i.test(msg)) {
    return "This file exceeds the allowed upload size.";
  }
  return msg || "Upload failed";
}
