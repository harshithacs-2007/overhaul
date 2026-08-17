/**
 * Solar gain foundation: Q_sol ≈ I × A × SHGC (W)
 * Requires incident radiation, window area, SHGC — never invent.
 */

import type { SolarPhysicsInput, TraceRecord } from "./types";

export function computeSolarGainW(input: SolarPhysicsInput): {
  solarW: number | null;
  status: "calculated" | "unavailable";
  trace: TraceRecord;
} {
  const missing: string[] = [];
  if (input.incidentRadiationWm2 == null || !(input.incidentRadiationWm2 >= 0)) {
    missing.push("incidentRadiationWm2 (climate solar)");
  }
  if (input.windowAreaM2 == null || !(input.windowAreaM2 > 0)) {
    missing.push("windowAreaM2");
  }
  if (input.shgc == null || !(input.shgc >= 0) || input.shgc > 1) {
    missing.push("shgc (0–1)");
  }

  if (missing.length) {
    return {
      solarW: null,
      status: "unavailable",
      trace: {
        id: "solar_gain",
        title: "Solar gain through glazing",
        status: "unavailable",
        formula: "Q_sol ≈ I × A_glazing × SHGC",
        inputs: {
          I_Wm2: input.incidentRadiationWm2 ?? null,
          A_m2: input.windowAreaM2 ?? null,
          SHGC: input.shgc ?? null,
        },
        result: null,
        resultUnit: "W",
        assumptions: [],
        missingInputs: missing,
      },
    };
  }

  const q =
    input.incidentRadiationWm2! * input.windowAreaM2! * input.shgc!;
  return {
    solarW: q,
    status: "calculated",
    trace: {
      id: "solar_gain",
      title: "Solar gain through glazing",
      status: "calculated",
      formula: "Q_sol ≈ I × A_glazing × SHGC  (early-stage estimate)",
      inputs: {
        I_Wm2: input.incidentRadiationWm2!,
        A_m2: input.windowAreaM2!,
        SHGC: input.shgc!,
      },
      result: q,
      resultUnit: "W",
      assumptions: [
        "Simple isotropic SHGC model — not full solar-angle / shading simulation",
      ],
      missingInputs: [],
      dataSource: "Climate solar + user SHGC/area",
    },
  };
}
