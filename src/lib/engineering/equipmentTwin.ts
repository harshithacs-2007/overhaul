/**
 * Equipment performance twin.
 *
 * Purpose: represent the healthy expected operating behaviour of a scanned
 * appliance/machine, then compare that reference with measured observations.
 *
 * The reference is NEVER inferred by copying the observed value. A reference
 * must come from one of:
 *   1. verified manufacturer/performance data,
 *   2. a validated engineering equation/curve, or
 *   3. a trained surrogate whose training dataset and metrics are recorded.
 */

export type EquipmentClass =
  | "air-conditioner"
  | "chiller"
  | "compressor"
  | "pump"
  | "fan-motor"
  | "boiler"
  | "refrigeration"
  | "other";

export type EquipmentSignalKey =
  | "power_kw"
  | "capacity_kw"
  | "flow_m3h"
  | "pressure_bar"
  | "supply_temp_c"
  | "return_temp_c"
  | "ambient_temp_c"
  | "speed_rpm"
  | "runtime_h"
  | "efficiency"
  | "cop";

export type TwinReference = {
  source: "manufacturer" | "physics" | "trained-surrogate" | "calibrated";
  dataset?: string;
  modelVersion?: string;
  metric?: { name: string; value: number };
  basis: string;
};

export type EquipmentObservation = {
  key: EquipmentSignalKey;
  value: number;
  unit: string;
  confidence: number;
  timestamp?: string;
};

export type ExpectedEquipmentSignal = {
  key: EquipmentSignalKey;
  expected: number;
  unit: string;
  toleranceRelative: number;
  reference: TwinReference;
};

export type EquipmentTwinResult = {
  equipmentClass: EquipmentClass;
  expected: ExpectedEquipmentSignal[];
  observed: EquipmentObservation[];
  residuals: Array<{
    key: EquipmentSignalKey;
    observed: number;
    expected: number;
    absoluteResidual: number;
    relativeResidual: number;
    severity: "normal" | "warning" | "critical";
  }>;
  healthScore: number | null;
  missingReference: EquipmentSignalKey[];
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function residual(observed: number, expected: number) {
  return (observed - expected) / Math.max(Math.abs(expected), 1e-9);
}

function severity(r: number, tolerance: number): "normal" | "warning" | "critical" {
  const m = Math.abs(r);
  if (m <= tolerance) return "normal";
  if (m <= tolerance * 2) return "warning";
  return "critical";
}

export function buildEquipmentTwin(input: {
  equipmentClass: EquipmentClass;
  observations: EquipmentObservation[];
  expected: ExpectedEquipmentSignal[];
}): EquipmentTwinResult {
  const byKey = new Map(input.observations.map((item) => [item.key, item]));
  const residuals: EquipmentTwinResult["residuals"] = [];
  const missingReference: EquipmentSignalKey[] = [];

  for (const reference of input.expected) {
    const observed = byKey.get(reference.key);
    if (!observed) {
      missingReference.push(reference.key);
      continue;
    }
    const relativeResidual = residual(observed.value, reference.expected);
    residuals.push({
      key: reference.key,
      observed: observed.value,
      expected: reference.expected,
      absoluteResidual: observed.value - reference.expected,
      relativeResidual,
      severity: severity(relativeResidual, reference.toleranceRelative),
    });
  }

  if (!residuals.length) {
    return {
      equipmentClass: input.equipmentClass,
      expected: input.expected,
      observed: input.observations,
      residuals: [],
      healthScore: null,
      missingReference,
    };
  }

  const weightedDeviation = residuals.reduce((sum, item) => {
    const obs = byKey.get(item.key);
    const confidence = clamp(obs?.confidence ?? 0, 0, 1);
    return sum + Math.min(Math.abs(item.relativeResidual), 2) * confidence;
  }, 0);
  const confidenceMass = residuals.reduce((sum, item) => sum + clamp(byKey.get(item.key)?.confidence ?? 0, 0, 1), 0);
  const normalizedDeviation = confidenceMass > 0 ? weightedDeviation / confidenceMass : 0;

  return {
    equipmentClass: input.equipmentClass,
    expected: input.expected,
    observed: input.observations,
    residuals,
    healthScore: clamp(100 * Math.exp(-normalizedDeviation * 0.6), 0, 100),
    missingReference,
  };
}

/**
 * Generate transparent healthy expectations from a simple verified operating
 * relationship. Used as a fallback only when the relationship itself is
 * explicitly supplied by a validated reference source.
 */
export function expectedPowerFromCapacityAndEfficiency(input: {
  capacityKw: number;
  efficiency: number;
  reference: TwinReference;
  toleranceRelative?: number;
}): ExpectedEquipmentSignal[] {
  if (!Number.isFinite(input.capacityKw) || input.capacityKw <= 0) return [];
  if (!Number.isFinite(input.efficiency) || input.efficiency <= 0) return [];

  return [
    {
      key: "power_kw",
      expected: input.capacityKw / input.efficiency,
      unit: "kW",
      toleranceRelative: input.toleranceRelative ?? 0.1,
      reference: input.reference,
    },
  ];
}
