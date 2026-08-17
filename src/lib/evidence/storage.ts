/**
 * Evidence storage abstraction.
 * Without permanent object storage configured, files are temporary — stated honestly.
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

function resolveRoot(): { root: string; persistence: "temporary" | "permanent" } {
  const configured = process.env.OVERHAUL_EVIDENCE_DIR?.trim();
  if (configured) {
    return { root: path.resolve(configured), persistence: "permanent" };
  }
  // Scoped under cwd/.data so Turbopack tracing stays bounded
  return {
    root: path.join(process.cwd(), ".data", "overhaul-evidence"),
    persistence: "temporary",
  };
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

let singleton: EvidenceStorage | null = null;

export function getEvidenceStorage(): EvidenceStorage {
  if (!singleton) singleton = new FileEvidenceStorage();
  return singleton;
}
