/**
 * Conduction heat transfer: Q (W) = U (W/m²K) × A (m²) × ΔT (K)
 * ΔT = T_out − T_in (sign indicates heat gain/loss direction)
 */

import { resolveSurfaceU } from "./thermalResistance";
import type {
  ComponentHeatTransferResult,
  SurfacePhysicsInput,
  TraceRecord,
} from "./types";

export function temperatureDifferenceK(
  outdoorTempC: number,
  indoorTempC: number
): number {
  return outdoorTempC - indoorTempC;
}

export function conductionHeatTransferW(
  uValueWm2K: number,
  areaM2: number,
  deltaT_K: number
): number {
  if (!(areaM2 > 0)) throw new Error("Area must be > 0 m²");
  if (!(uValueWm2K > 0)) throw new Error("U-value must be > 0");
  return uValueWm2K * areaM2 * deltaT_K;
}

export function computeSurfaceHeatTransfer(
  surface: SurfacePhysicsInput,
  outdoorTempC: number,
  indoorTempC: number
): ComponentHeatTransferResult {
  const deltaT = temperatureDifferenceK(outdoorTempC, indoorTempC);
  const missing: string[] = [];

  if (!(surface.areaM2 > 0)) {
    missing.push(`${surface.id}.areaM2`);
  }

  let u: number | null = null;
  const uTraces: TraceRecord[] = [];
  try {
    const resolved = resolveSurfaceU({
      uValueWm2K: surface.uValueWm2K,
      layers: surface.layers,
      surfaceResistanceM2KW: surface.surfaceResistanceM2KW,
    });
    u = resolved.uValueWm2K;
    uTraces.push(...resolved.traces);
    missing.push(...resolved.missing.map((m) => `${surface.id}.${m}`));
  } catch (err) {
    missing.push(
      `${surface.id}.U (${err instanceof Error ? err.message : String(err)})`
    );
  }

  if (missing.length || u == null || !(surface.areaM2 > 0)) {
    return {
      componentId: surface.id,
      kind: surface.kind,
      status: "unavailable",
      areaM2: surface.areaM2 > 0 ? surface.areaM2 : null,
      uValueWm2K: u,
      deltaT_K: deltaT,
      heatTransferW: null,
      trace: {
        id: `q_${surface.id}`,
        title: `${surface.kind} heat transfer`,
        status: "unavailable",
        formula: "Q = U × A × ΔT",
        inputs: {
          A_m2: surface.areaM2 > 0 ? surface.areaM2 : null,
          U_Wm2K: u,
          T_out_C: outdoorTempC,
          T_in_C: indoorTempC,
          deltaT_K: deltaT,
        },
        result: null,
        resultUnit: "W",
        assumptions: [],
        missingInputs: missing,
      },
    };
  }

  const q = conductionHeatTransferW(u, surface.areaM2, deltaT);
  return {
    componentId: surface.id,
    kind: surface.kind,
    status: "calculated",
    areaM2: surface.areaM2,
    uValueWm2K: u,
    deltaT_K: deltaT,
    heatTransferW: q,
    trace: {
      id: `q_${surface.id}`,
      title: `${surface.kind} heat transfer (${surface.id})`,
      status: "calculated",
      formula: "Q = U × A × ΔT  (W = W/m²K × m² × K)",
      inputs: {
        A_m2: surface.areaM2,
        U_Wm2K: Number(u.toFixed(4)),
        T_out_C: outdoorTempC,
        T_in_C: indoorTempC,
        deltaT_K: Number(deltaT.toFixed(3)),
      },
      result: q,
      resultUnit: "W",
      assumptions: uTraces.flatMap((t) => t.assumptions),
      missingInputs: [],
      dataSource: "Structured building model + climate outdoor temperature",
    },
  };
}
