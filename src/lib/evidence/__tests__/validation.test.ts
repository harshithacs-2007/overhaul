import { describe, expect, it } from "vitest";
import { validateUploadBuffer, sniffMime } from "../validation";
import { NullAnalysisAdapter } from "../analysisAdapter";
import type { EvidenceItem } from "../types";

describe("evidence validation", () => {
  it("accepts a valid JPEG by magic bytes", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    expect(sniffMime(jpeg)).toBe("image/jpeg");
    const result = validateUploadBuffer({
      buffer: jpeg,
      claimedMime: "image/jpeg",
      filename: "wall.jpg",
      categoryRaw: "exterior",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects oversized payloads", () => {
    const jpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff]),
      Buffer.alloc(13 * 1024 * 1024),
    ]);
    const result = validateUploadBuffer({
      buffer: jpeg,
      claimedMime: "image/jpeg",
      filename: "big.jpg",
      categoryRaw: "exterior",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/exceeds/i);
  });

  it("rejects mismatched extension vs content", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const result = validateUploadBuffer({
      buffer: png,
      claimedMime: "image/png",
      filename: "fake.jpg",
      categoryRaw: "window",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects invalid category", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
    const result = validateUploadBuffer({
      buffer: jpeg,
      claimedMime: "image/jpeg",
      filename: "a.jpg",
      categoryRaw: "spaceship",
    });
    expect(result.ok).toBe(false);
  });
});

describe("NullAnalysisAdapter", () => {
  it("never returns detections", async () => {
    const adapter = new NullAnalysisAdapter();
    const evidence = {
      id: "e1",
      analysisState: "not_analyzed",
    } as EvidenceItem;
    const out = await adapter.analyze(evidence);
    expect(out.state).toBe("not_analyzed");
    expect(out.detections).toEqual([]);
  });
});
