/**
 * Builds an independent healthy-performance reference for equipment.
 *
 * The reference layer is deliberately conservative: it only emits an expected
 * signal when the inputs are present in evidence and the engineering basis is
 * explicit. Observed power is never copied into the expected state.
 */

import {
  expectedPowerFromCapacityAndEfficiency,
  type EquipmentSignalKey,
  type ExpectedEquipmentSignal,
  type TwinReference,
} from "./equipmentTwin";

export type ReferenceObservation = {
  field: string;
  value: string;
  numericValue: number | null;
  unit: string | null;
  sourceText: string;
};

export type ReferenceEvidence = {
  evidenceId?: string;
  evidenceType?: string;
  observations?: ReferenceObservation[];
};

function finiteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function fieldText(observations: ReferenceObservation[]): string {
  return observations
    .map((item) => `${item.field} ${item.value} ${item.sourceText}`)
    .join(" ")
    .toLowerCase();
}

function hasManufacturerReference(evidence: ReferenceEvidence[]): boolean {
  const text = evidence
    .map((item) => `${item.evidenceType ?? ""} ${(item.observations ?? []).map((o) => o.sourceText).join(" ")}`)
    .join(" ")
    .toLowerCase();

  return (
    text.includes("nameplate") ||
    text.includes("manufacturer") ||
    text.includes("performance sheet") ||
    text.includes("datasheet") ||
    text.includes("specification") ||
    text.includes("rated")
  );
}

function findNumeric(observations: ReferenceObservation[], pattern: RegExp): number | null {
  for (const observation of observations) {
    if (observation.numericValue == null || !finiteNumber(observation.numericValue)) continue;
    if (pattern.test(`${observation.field} ${observation.value}`.toLowerCase())) {
      return observation.numericValue;
    }
  }
  return null;
}

function explicitExpectedPower(observations: ReferenceObservation[]): number | null {
  return findNumeric(observations, /expected.*power|healthy.*power|reference.*power|design.*power/i);
}

export function buildEquipmentReference(evidence: ReferenceEvidence[]): ExpectedEquipmentSignal[] {
  const observations = evidence.flatMap((item) => item.observations ?? []);
  if (!observations.length) return [];

  const powerExpected = explicitExpectedPower(observations);
  const capacity = findNumeric(observations, /rated.*capacity|capacity.*kw|cooling.*capacity|thermal.*capacity/i);
  const efficiency = findNumeric(observations, /rated.*efficiency|efficiency|eer|seer|cop|coefficient.*performance/i);
  const text = fieldText(observations);

  const reference: TwinReference = hasManufacturerReference(evidence)
    ? {
        source: "manufacturer",
        basis: "explicit equipment rating/specification evidence supplied with the assessment",
      }
    : {
        source: "physics",
        basis: "engineering relationship evaluated from supplied capacity and efficiency evidence",
      };

  const results: ExpectedEquipmentSignal[] = [];

  if (finiteNumber(powerExpected)) {
    results.push({
      key: "power_kw",
      expected: powerExpected,
      unit: "kW",
      toleranceRelative: 0.1,
      reference: {
        ...reference,
        basis: "independent expected/healthy power value explicitly present in supplied evidence",
      },
    });
  }

  if (finiteNumber(capacity) && finiteNumber(efficiency) && !results.some((item) => item.key === "power_kw")) {
    const derived = expectedPowerFromCapacityAndEfficiency({
      capacityKw: capacity,
      efficiency,
      toleranceRelative: 0.1,
      reference,
    });
    results.push(...derived);
  }

  // Keep the basis visible in the model even when the source wording is vague.
  if (results.length && !text.includes("expected") && !text.includes("healthy") && reference.source === "physics") {
    results[0] = {
      ...results[0],
      reference: {
        ...results[0].reference,
        basis: "derived from supplied capacity/efficiency using P = Q / efficiency; verify against manufacturer data when available",
      },
    };
  }

  return results;
}

export function signalLabel(key: EquipmentSignalKey): string {
  return key.replaceAll("_", " ");
}
