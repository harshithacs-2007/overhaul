/**
 * Analysis adapter boundary — CV-ready architecture.
 *
 * Evidence → Analysis Adapter → Detection Results → Building Model
 *
 * Phase 2: NullAnalysisAdapter always returns not_analyzed / empty detections.
 * Real CV plugs in by implementing AnalysisAdapter — no product redesign.
 */

import type { EvidenceItem } from "./types";

/** Future CV may identify these — never fabricated in Phase 2 */
export type DetectionLabel =
  | "window"
  | "door"
  | "roof"
  | "wall"
  | "hvac_equipment"
  | "hvac_nameplate"
  | "building_component";

export interface DetectionResult {
  id: string;
  evidenceId: string;
  label: DetectionLabel;
  /** 0–1 from a real detector only */
  confidence: number;
  /** Normalized bounding box if provided by detector */
  bbox?: { x: number; y: number; w: number; h: number };
  producedBy: string;
  producedAt: string;
}

export interface AnalysisOutput {
  evidenceId: string;
  state: EvidenceItem["analysisState"];
  detections: DetectionResult[];
  message?: string;
}

export interface AnalysisAdapter {
  readonly name: string;
  analyze(evidence: EvidenceItem): Promise<AnalysisOutput>;
}

/**
 * Phase 2 stub — explicitly does not analyze.
 * Swap for a real CV adapter later without changing Evidence → Building Model flow.
 */
export class NullAnalysisAdapter implements AnalysisAdapter {
  readonly name = "null-phase2";

  async analyze(evidence: EvidenceItem): Promise<AnalysisOutput> {
    return {
      evidenceId: evidence.id,
      state: "not_analyzed",
      detections: [],
      message: "Not analyzed — no detector configured (Phase 2)",
    };
  }
}

let activeAdapter: AnalysisAdapter = new NullAnalysisAdapter();

export function getAnalysisAdapter(): AnalysisAdapter {
  return activeAdapter;
}

/** For future wiring of a real detector */
export function setAnalysisAdapter(adapter: AnalysisAdapter): void {
  activeAdapter = adapter;
}
