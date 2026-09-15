/**
 * Ranks the next measurement that is most likely to resolve an engineering
 * decision block. This is an information-value layer, not a source of new
 * physical measurements.
 */

import type { DiagnosticResult } from "./diagnosisEngine";

export type MeasurementPriority = "low" | "medium" | "high" | "critical";

export interface MeasurementCandidate {
  id: string;
  label: string;
  method: string;
  signals: string[];
  why: string;
  expectedUncertaintyReduction: number;
  decisionImpact: boolean;
  priority: MeasurementPriority;
}

export interface NextBestMeasurementInput {
  diagnostic: DiagnosticResult;
  availableSignals?: string[];
  blockedDecisions?: string[];
}

export interface NextBestMeasurementResult {
  status: "measurement-needed" | "no-measurement-needed";
  recommendation: MeasurementCandidate | null;
  alternatives: MeasurementCandidate[];
}

const DEFAULT_MEASUREMENTS: MeasurementCandidate[] = [
  {
    id: "stable-operating-power",
    label: "Stable operating power",
    method: "Record true electrical input power over a stable operating interval.",
    signals: ["power_kw"],
    why: "Separates an isolated instantaneous observation from a repeatable operating condition.",
    expectedUncertaintyReduction: 0.35,
    decisionImpact: true,
    priority: "high",
  },
  {
    id: "flow-rate",
    label: "Delivered flow",
    method: "Measure air, water, or process flow at the relevant operating point.",
    signals: ["flow_m3h"],
    why: "Distinguishes restriction/low-flow behavior from efficiency degradation when power is abnormal.",
    expectedUncertaintyReduction: 0.72,
    decisionImpact: true,
    priority: "critical",
  },
  {
    id: "pressure-differential",
    label: "Pressure differential",
    method: "Measure upstream/downstream or suction/discharge pressure at the same operating point.",
    signals: ["pressure_bar"],
    why: "Tests whether excess work is associated with hydraulic, airflow, or process resistance.",
    expectedUncertaintyReduction: 0.64,
    decisionImpact: true,
    priority: "high",
  },
  {
    id: "supply-return-temperature",
    label: "Supply/return temperatures",
    method: "Capture entering and leaving temperatures with calibrated sensors under the same load.",
    signals: ["supply_temp_c", "return_temp_c"],
    why: "Separates thermal-transfer degradation from a changed process/load condition.",
    expectedUncertaintyReduction: 0.68,
    decisionImpact: true,
    priority: "high",
  },
  {
    id: "command-vs-feedback-speed",
    label: "Command vs actual speed",
    method: "Capture commanded and measured VFD/drive speed together with process demand.",
    signals: ["speed_rpm"],
    why: "Tests whether control limits or mechanical resistance are preventing the expected operating point.",
    expectedUncertaintyReduction: 0.61,
    decisionImpact: true,
    priority: "high",
  },
  {
    id: "indoor-outdoor-condition",
    label: "Indoor/outdoor operating conditions",
    method: "Capture indoor condition, outdoor condition, and active setpoint at the measurement time.",
    signals: ["indoor_temp_c", "outdoor_temp_c"],
    why: "Prevents comparison of an observed load or power value against a reference at a materially different boundary condition.",
    expectedUncertaintyReduction: 0.55,
    decisionImpact: true,
    priority: "medium",
  },
];

function score(candidate: MeasurementCandidate, diagnostic: DiagnosticResult): number {
  const requestedText = diagnostic.evidenceRequests.join(" ").toLowerCase();
  const matchingRequest = candidate.signals.some((signal) => requestedText.includes(signal.replaceAll("_", " ")))
    || candidate.signals.some((signal) => requestedText.includes(signal));
  const priorityWeight: Record<MeasurementPriority, number> = {
    low: 0.2,
    medium: 0.5,
    high: 0.8,
    critical: 1,
  };
  return candidate.expectedUncertaintyReduction * 0.65
    + (candidate.decisionImpact ? 0.2 : 0)
    + priorityWeight[candidate.priority] * 0.1
    + (matchingRequest ? 0.25 : 0);
}

export function rankNextBestMeasurement(input: NextBestMeasurementInput): NextBestMeasurementResult {
  if (input.diagnostic.status !== "diagnostic" && input.diagnostic.status !== "insufficient-evidence") {
    return { status: "no-measurement-needed", recommendation: null, alternatives: [] };
  }

  const available = new Set(input.availableSignals ?? []);
  const candidates = DEFAULT_MEASUREMENTS
    .filter((candidate) => candidate.signals.some((signal) => !available.has(signal)))
    .map((candidate) => ({ candidate, score: score(candidate, input.diagnostic) }))
    .sort((a, b) => b.score - a.score || b.candidate.expectedUncertaintyReduction - a.candidate.expectedUncertaintyReduction)
    .map(({ candidate }) => candidate);

  if (!candidates.length) {
    return { status: "no-measurement-needed", recommendation: null, alternatives: [] };
  }

  return {
    status: "measurement-needed",
    recommendation: candidates[0],
    alternatives: candidates.slice(1, 4),
  };
}
