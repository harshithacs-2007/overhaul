/**
 * HVAC capacity comparison — documented thresholds only.
 * Age is reported separately; never used alone to declare equipment "bad".
 */

import type { HvacCapacityCheck, HvacPhysicsInput, TraceRecord } from "./types";

/** Documented: capacity ratio > 1.3 → potentially oversized (ASHRAE sizing practice band) */
export const OVERSIZED_RATIO = 1.3;
/** Documented: installed < required → insufficient */
export const ADEQUATE_FLOOR_RATIO = 1.0;

export function compareHvacCapacity(
  requiredCapacityKW: number | null,
  hvac: HvacPhysicsInput
): HvacCapacityCheck {
  const thresholds = {
    oversizedRatio: OVERSIZED_RATIO,
    note: "Oversized if installed/required > 1.3 (documented HVAC sizing practice band). Adequate if installed ≥ required and ratio ≤ 1.3. Insufficient if installed < required.",
  };

  const ageYears = hvac.systemAgeYears ?? null;
  const ageNote =
    ageYears == null
      ? "System age unknown — not used to judge capacity fit"
      : `System age ${ageYears} yr reported separately — not used alone to classify fit`;

  let efficiencyNote: string | null = null;
  if (hvac.efficiencyMetric && hvac.efficiencyValue != null) {
    efficiencyNote = `${hvac.efficiencyMetric}=${hvac.efficiencyValue} (reported; not converted into capacity in Phase 4)`;
  }

  const installed = hvac.ratedCapacityKW ?? null;
  const missing: string[] = [];
  if (requiredCapacityKW == null) missing.push("calculated load");
  if (installed == null || !(installed > 0)) missing.push("HVAC rated capacity");

  const baseTrace: Omit<TraceRecord, "result" | "status"> = {
    id: "hvac_capacity",
    title: "HVAC capacity vs load",
    formula: "margin_kW = installed_kW − |required_kW|; ratio = installed / |required|",
    inputs: {
      installed_kW: installed,
      required_kW: requiredCapacityKW,
      oversizedRatioThreshold: OVERSIZED_RATIO,
    },
    resultUnit: "kW",
    assumptions: [thresholds.note, ageNote],
    missingInputs: missing,
  };

  if (missing.length || requiredCapacityKW == null || installed == null) {
    return {
      status: "unavailable",
      state: "unable_to_determine",
      installedCapacityKW: installed,
      requiredCapacityKW,
      marginKW: null,
      thresholds,
      ageYears,
      ageNote,
      efficiencyNote,
      trace: { ...baseTrace, status: "unavailable", result: null },
    };
  }

  const requiredAbs = Math.abs(requiredCapacityKW);
  const margin = installed - requiredAbs;
  const ratio = requiredAbs > 0 ? installed / requiredAbs : Infinity;

  let state: HvacCapacityCheck["state"];
  if (installed < requiredAbs) state = "insufficient";
  else if (ratio > OVERSIZED_RATIO) state = "potentially_oversized";
  else state = "adequate";

  return {
    status: "calculated",
    state,
    installedCapacityKW: installed,
    requiredCapacityKW: requiredAbs,
    marginKW: margin,
    thresholds,
    ageYears,
    ageNote,
    efficiencyNote,
    trace: {
      ...baseTrace,
      status: "calculated",
      result: margin,
      inputs: {
        ...baseTrace.inputs,
        ratio: Number(ratio.toFixed(3)),
        state,
      },
      missingInputs: [],
    },
  };
}
