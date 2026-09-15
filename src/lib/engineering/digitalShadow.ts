/**
 * Digital Shadow core.
 *
 * The shadow is an expected-vs-observed engineering state model. It does not
 * manufacture missing measurements: every signal carries provenance and
 * confidence, and numerical deviation is only evaluated when an expected
 * reference is available.
 */

export type ShadowSubject = "building" | "facility" | "equipment";
export type EvidenceSource =
  | "measured"
  | "document"
  | "ocr"
  | "vision"
  | "inferred"
  | "unknown";
export type ShadowState =
  | "insufficient-evidence"
  | "within-expected"
  | "deviating"
  | "critical-deviation";

export interface ShadowObservation {
  key: string;
  value: number;
  unit: string;
  source: EvidenceSource;
  confidence: number;
  timestamp?: string;
}

export interface ExpectedSignal {
  key: string;
  expected: number;
  unit: string;
  toleranceRelative: number;
  basis: string;
}

export interface ShadowSignalResult {
  key: string;
  observed: number;
  expected: number;
  unit: string;
  relativeResidual: number;
  absoluteResidual: number;
  withinTolerance: boolean;
  severity: "normal" | "warning" | "critical";
  source: EvidenceSource;
  confidence: number;
  basis: string;
}

export interface DigitalShadowResult {
  schemaVersion: "1.0";
  subject: ShadowSubject;
  state: ShadowState;
  score: number;
  observationsUsed: number;
  expectedSignalsMatched: number;
  signals: ShadowSignalResult[];
  unknowns: string[];
  nextEvidence: string[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function relativeResidual(observed: number, expected: number): number {
  const denominator = Math.max(Math.abs(expected), 1e-9);
  return (observed - expected) / denominator;
}

function severityForResidual(
  residual: number,
  tolerance: number
): "normal" | "warning" | "critical" {
  const magnitude = Math.abs(residual);
  if (magnitude <= tolerance) return "normal";
  if (magnitude <= tolerance * 2) return "warning";
  return "critical";
}

function nextEvidenceForUnknown(subject: ShadowSubject, key: string): string {
  const prompts: Record<string, string> = {
    power_kw: "Provide a measured electrical power reading for the asset during operation.",
    load_kw: "Provide the current thermal/process load or an equivalent operating measurement.",
    flow_m3h: "Provide a flow reading or a photo/export of the installed flow measurement.",
    supply_temp_c: "Provide a supply-temperature reading from the operating system.",
    return_temp_c: "Provide a return-temperature reading from the operating system.",
    model: "Take a clear photo of the equipment nameplate/model label.",
    rated_capacity_kw: "Take a clear photo of the equipment nameplate showing rated capacity.",
  };
  if (prompts[key]) return prompts[key];
  return subject === "building"
    ? "Provide the missing building operating measurement that controls this calculation."
    : "Provide one additional measured operating value for this asset.";
}

export function buildDigitalShadow(
  subject: ShadowSubject,
  observations: ShadowObservation[],
  expectedSignals: ExpectedSignal[]
): DigitalShadowResult {
  const validObservations = observations.filter(
    (item) => Number.isFinite(item.value) && item.value >= -1e9 && item.value <= 1e9
  );

  const byKey = new Map<string, ShadowObservation>();
  for (const observation of validObservations) {
    const existing = byKey.get(observation.key);
    if (!existing || observation.confidence > existing.confidence) {
      byKey.set(observation.key, observation);
    }
  }

  const signals: ShadowSignalResult[] = [];
  const unknowns: string[] = [];
  const nextEvidence: string[] = [];

  for (const expected of expectedSignals) {
    const observed = byKey.get(expected.key);
    if (!observed) {
      unknowns.push(expected.key);
      nextEvidence.push(nextEvidenceForUnknown(subject, expected.key));
      continue;
    }

    const residual = relativeResidual(observed.value, expected.expected);
    const severity = severityForResidual(residual, expected.toleranceRelative);
    const confidence = clamp(observed.confidence, 0, 1);
    signals.push({
      key: expected.key,
      observed: observed.value,
      expected: expected.expected,
      unit: expected.unit,
      relativeResidual: residual,
      absoluteResidual: observed.value - expected.expected,
      withinTolerance: severity === "normal",
      severity,
      source: observed.source,
      confidence,
      basis: expected.basis,
    });
  }

  const matched = signals.length;
  const sufficientlyTrusted = signals.filter((item) => item.confidence >= 0.75).length;
  const criticalCount = signals.filter((item) => item.severity === "critical").length;
  const warningCount = signals.filter((item) => item.severity === "warning").length;

  let state: ShadowState = "insufficient-evidence";
  if (matched > 0 && sufficientlyTrusted === matched) {
    state = criticalCount > 0 ? "critical-deviation" : warningCount > 0 ? "deviating" : "within-expected";
  } else if (matched > 0) {
    state = criticalCount > 0 ? "critical-deviation" : "deviating";
  }

  const deviationPenalty = signals.reduce((sum, signal) => {
    const magnitude = Math.min(Math.abs(signal.relativeResidual), 2);
    const trust = clamp(signal.confidence, 0, 1);
    return sum + magnitude * trust;
  }, 0);
  const completeness = expectedSignals.length
    ? matched / expectedSignals.length
    : validObservations.length > 0
      ? 1
      : 0;
  const score = clamp(
    100 * completeness * Math.exp(-deviationPenalty * 0.35),
    0,
    100
  );

  return {
    schemaVersion: "1.0",
    subject,
    state,
    score,
    observationsUsed: byKey.size,
    expectedSignalsMatched: matched,
    signals,
    unknowns: [...new Set(unknowns)],
    nextEvidence: [...new Set(nextEvidence)].slice(0, 3),
  };
}

export function buildEquipmentExpectations(input: {
  ratedCapacityKW?: number;
  expectedEfficiency?: number;
  expectedPowerKW?: number;
  toleranceRelative?: number;
}): ExpectedSignal[] {
  const tolerance = input.toleranceRelative ?? 0.1;
  const expectations: ExpectedSignal[] = [];

  if (typeof input.expectedPowerKW === "number" && input.expectedPowerKW > 0) {
    expectations.push({
      key: "power_kw",
      expected: input.expectedPowerKW,
      unit: "kW",
      toleranceRelative: tolerance,
      basis: "validated equipment operating reference",
    });
  }

  if (
    typeof input.ratedCapacityKW === "number" &&
    input.ratedCapacityKW > 0 &&
    typeof input.expectedEfficiency === "number" &&
    input.expectedEfficiency > 0
  ) {
    const expectedPower = input.ratedCapacityKW / input.expectedEfficiency;
    expectations.push({
      key: "power_kw",
      expected: expectedPower,
      unit: "kW",
      toleranceRelative: tolerance,
      basis: "rated capacity divided by expected efficiency",
    });
  }

  return expectations;
}
