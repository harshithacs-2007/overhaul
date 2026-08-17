import { describe, expect, it, beforeEach } from "vitest";
import {
  MemoryEvidenceStorage,
  HybridEvidenceStorage,
  buildInlinePreviewUrl,
  sanitizeFilename,
} from "../storage";

describe("sanitizeFilename", () => {
  it("strips path and dangerous chars", () => {
    expect(sanitizeFilename("../../x.png")).toBe("x.png");
  });
});

describe("MemoryEvidenceStorage", () => {
  it("put/get/remove round-trip", async () => {
    const s = new MemoryEvidenceStorage();
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const stored = await s.put(buf, {
      mimeType: "image/jpeg",
      originalFilename: "shot.jpg",
    });
    expect(stored.persistence).toBe("temporary");
    const got = await s.get(stored.storageKey);
    expect(got?.buffer.equals(buf)).toBe(true);
    expect(await s.remove(stored.storageKey)).toBe(true);
    expect(await s.get(stored.storageKey)).toBeNull();
  });
});

describe("buildInlinePreviewUrl", () => {
  it("builds data URL for small images", () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );
    const url = buildInlinePreviewUrl(png, "image/png");
    expect(url?.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("skips non-images", () => {
    expect(buildInlinePreviewUrl(Buffer.from("%PDF"), "application/pdf")).toBeNull();
  });
});

describe("HybridEvidenceStorage", () => {
  beforeEach(() => {
    delete process.env.OVERHAUL_EVIDENCE_DIR;
  });

  it("stores on put without throwing", async () => {
    const s = new HybridEvidenceStorage();
    const stored = await s.put(Buffer.from("hello"), {
      mimeType: "text/plain",
      originalFilename: "note.txt",
    });
    expect(stored.storageKey.length).toBeGreaterThan(0);
    const got = await s.get(stored.storageKey);
    // May be file or memory depending on env; get should work after put in same process
    expect(got?.buffer.toString()).toBe("hello");
  });
});
