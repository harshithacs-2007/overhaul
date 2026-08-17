/**
 * Evidence domain model — Phase 2.
 * No fabricated detections. Analysis starts as "not_analyzed".
 */

export const EVIDENCE_CATEGORIES = [
  "exterior",
  "interior",
  "window",
  "roof",
  "hvac",
  "floor_plan",
  "energy_bill",
  "other",
] as const;

export type EvidenceCategory = (typeof EVIDENCE_CATEGORIES)[number];

export const EVIDENCE_CATEGORY_LABELS: Record<EvidenceCategory, string> = {
  exterior: "Exterior",
  interior: "Interior",
  window: "Window",
  roof: "Roof",
  hvac: "HVAC",
  floor_plan: "Floor Plan",
  energy_bill: "Energy Bill",
  other: "Other",
};

export type EvidenceSource = "camera" | "upload" | "manual";

export type EvidenceMediaType = "image" | "pdf" | "unknown";

export type EvidenceStatus =
  | "pending"
  | "uploading"
  | "stored"
  | "temporary"
  | "error";

export type EvidenceReviewState =
  | "uploaded"
  | "needs_review"
  | "confirmed"
  | "unclassified";

/** Phase 2: always start not_analyzed. Never invent detections. */
export type EvidenceAnalysisState =
  | "not_analyzed"
  | "analyzing"
  | "analyzed"
  | "analysis_failed";

export interface EvidenceFileRef {
  /** Server-side storage key or path token — not a secret */
  storageKey: string;
  /** Client preview URL (blob: or /api/evidence/file/…) */
  previewUrl: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  /** Honest storage mode */
  persistence: "temporary" | "permanent";
}

export interface EvidenceItem {
  id: string;
  source: EvidenceSource;
  mediaType: EvidenceMediaType;
  category: EvidenceCategory;
  file: EvidenceFileRef;
  captureTimestamp: string;
  status: EvidenceStatus;
  reviewState: EvidenceReviewState;
  analysisState: EvidenceAnalysisState;
  errorMessage?: string;
}

export function createEvidenceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `ev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function mediaTypeFromMime(mime: string): EvidenceMediaType {
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  return "unknown";
}
