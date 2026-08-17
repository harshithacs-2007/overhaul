import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import {
  buildInlinePreviewUrl,
  getEvidenceStorage,
  sanitizeFilename,
  userFacingStorageError,
} from "@/lib/evidence/storage";
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
      return NextResponse.json(
        { error: "Too many uploads. Wait a moment and retry." },
        { status: 429 }
      );
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

    const apiPreview = `/api/evidence/file/${encodeURIComponent(stored.storageKey)}`;
    const inline =
      stored.persistence === "temporary"
        ? buildInlinePreviewUrl(
            validated.value.buffer,
            validated.value.mimeType
          )
        : null;

    const id = createEvidenceId();
    const item: EvidenceItem = {
      id,
      source,
      mediaType: mediaTypeFromMime(validated.value.mimeType),
      category: validated.value.category,
      file: {
        storageKey: stored.storageKey,
        previewUrl: inline ?? apiPreview,
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

    const analysis = await getAnalysisAdapter().analyze(item);
    item.analysisState = analysis.state;

    return NextResponse.json({ evidence: item });
  } catch (err) {
    const message = userFacingStorageError(err);
    return NextResponse.json(
      {
        error: message,
        message,
      },
      { status: 500 }
    );
  }
}
