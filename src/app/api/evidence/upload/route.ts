import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { getEvidenceStorage, sanitizeFilename } from "@/lib/evidence/storage";
import { validateUploadBuffer } from "@/lib/evidence/validation";
import {
  createEvidenceId,
  mediaTypeFromMime,
  type EvidenceItem,
} from "@/lib/evidence/types";
import { getAnalysisAdapter } from "@/lib/evidence/analysisAdapter";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    const rl = rateLimit(`evidence-upload:${ip}`, 40, 60_000);
    if (!rl.ok) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const form = await req.formData();
    const file = form.get("file");
    const categoryRaw = String(form.get("category") ?? "other");
    const sourceRaw = String(form.get("source") ?? "upload");
    const source =
      sourceRaw === "camera" || sourceRaw === "manual" ? sourceRaw : "upload";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = sanitizeFilename(file.name || "capture.jpg");
    const validated = validateUploadBuffer({
      buffer,
      claimedMime: file.type || "",
      filename,
      categoryRaw,
    });

    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const storage = getEvidenceStorage();
    const stored = await storage.put(validated.value.buffer, {
      mimeType: validated.value.mimeType,
      originalFilename: validated.value.originalFilename,
    });

    const id = createEvidenceId();
    const item: EvidenceItem = {
      id,
      source,
      mediaType: mediaTypeFromMime(validated.value.mimeType),
      category: validated.value.category,
      file: {
        storageKey: stored.storageKey,
        previewUrl: `/api/evidence/file/${encodeURIComponent(stored.storageKey)}`,
        originalFilename: stored.originalFilename,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        persistence: stored.persistence,
      },
      captureTimestamp: new Date().toISOString(),
      status: stored.persistence === "temporary" ? "temporary" : "stored",
      reviewState: "needs_review",
      analysisState: "not_analyzed",
    };

    // Explicit Phase 2: run null adapter (no detections)
    const analysis = await getAnalysisAdapter().analyze(item);
    item.analysisState = analysis.state;

    return NextResponse.json({ evidence: item });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Upload failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
