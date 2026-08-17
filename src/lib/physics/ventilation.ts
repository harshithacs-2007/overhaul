/**
 * Sensible ventilation/infiltration load.
 * Q = ρ × c_p × V̇ × ΔT
 * With ACH: V̇ = ACH × Volume / 3600
 *
 * ρ ≈ 1.2 kg/m³, c_p ≈ 1006 J/(kg·K) — documented standard air properties.
 */

import type { TraceRecord, VentilationPhysicsInput } from "./types";

export const AIR_DENSITY_KG_M3 = 1.2;
export const AIR_CP_J_KGK = 1006;

export function computeVentilationLoadW(opts: {
  ventilation: VentilationPhysicsInput;
  volumeM3: number | null;
  deltaT_K: number;
}): {
  ventilationW: number | null;
  status: "calculated" | "unavailable";
  trace: TraceRecord;
} {
  const { ventilation, volumeM3, deltaT_K } = opts;
  const missing: string[] = [];

  let airflowM3s: number | null = null;

  if (ventilation.mode === "unknown") {
    missing.push("ACH or airflow rate");
  } else if (ventilation.mode === "ach") {
    if (ventilation.ach == null || !(ventilation.ach >= 0)) {
      missing.push("ACH");
    }
    if (volumeM3 == null || !(volumeM3 > 0)) {
      missing.push("conditioned volume (area × height)");
    }
    if (!missing.length) {
      airflowM3s = (ventilation.ach! * volumeM3!) / 3600;
    }
  } else if (ventilation.mode === "airflow_m3s") {
    if (ventilation.airflowM3s == null || !(ventilation.airflowM3s >= 0)) {
      missing.push("airflow_m3s");
    } else {
      airflowM3s = ventilation.airflowM3s;
    }
  }

  if (missing.length || airflowM3s == null) {
    return {
      ventilationW: null,
      status: "unavailable",
      trace: {
        id: "ventilation",
        title: "Ventilation / infiltration sensible load",
        status: "unavailable",
        formula: "Q = ρ × c_p × V̇ × ΔT; V̇ = ACH × Vol / 3600",
        inputs: {
          ACH: ventilation.ach ?? null,
          airflow_m3s: ventilation.airflowM3s ?? null,
          volume_m3: volumeM3,
          deltaT_K,
          kind: ventilation.kind ?? "unknown",
        },
        result: null,
        resultUnit: "W",
        assumptions: [],
        missingInputs: missing,
      },
    };
  }

  const q = AIR_DENSITY_KG_M3 * AIR_CP_J_KGK * airflowM3s * deltaT_K;
  return {
    ventilationW: q,
    status: "calculated",
    trace: {
      id: "ventilation",
      title: "Ventilation / infiltration sensible load",
      status: "calculated",
      formula: "Q = ρ × c_p × V̇ × ΔT",
      inputs: {
        rho_kg_m3: AIR_DENSITY_KG_M3,
        cp_J_kgK: AIR_CP_J_KGK,
        airflow_m3s: Number(airflowM3s.toFixed(6)),
        deltaT_K: Number(deltaT_K.toFixed(3)),
        kind: ventilation.kind ?? "unknown",
      },
      result: q,
      resultUnit: "W",
      assumptions: [
        `ρ = ${AIR_DENSITY_KG_M3} kg/m³, c_p = ${AIR_CP_J_KGK} J/(kg·K) (standard air — documented)`,
        "Sensible load only — latent not included in Phase 4",
      ],
      missingInputs: [],
    },
  };
}
