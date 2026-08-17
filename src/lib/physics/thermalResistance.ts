/**
 * Layer thermal resistance — SI only.
 * R (m²K/W) = thickness_m / λ_(W/m·K)
 * U (W/m²K) = 1 / (R_si+se + ΣR_layers)
 */

import type { MaterialLayerInput, TraceRecord } from "./types";

/** ISO 6946 conventional combined air film resistance (horizontal/approx) — documented */
export const DEFAULT_AIR_FILM_R_M2KW = 0.17;

export function layerResistanceM2KW(thicknessM: number, conductivityWmK: number): number {
  if (!(thicknessM > 0)) {
    throw new Error("Layer thickness must be > 0 m");
  }
  if (!(conductivityWmK > 0)) {
    throw new Error("Thermal conductivity must be > 0 W/(m·K)");
  }
  return thicknessM / conductivityWmK;
}

export function assemblyUValueWm2K(
  layers: MaterialLayerInput[],
  surfaceResistanceM2KW: number = DEFAULT_AIR_FILM_R_M2KW
): { uValueWm2K: number; totalRM2KW: number; trace: TraceRecord } {
  if (!(surfaceResistanceM2KW >= 0)) {
    throw new Error("Surface resistance must be ≥ 0");
  }
  if (!layers.length) {
    throw new Error("At least one layer required when deriving U from layers");
  }
  let sumR = surfaceResistanceM2KW;
  const layerRs: number[] = [];
  for (const layer of layers) {
    const r = layerResistanceM2KW(layer.thicknessM, layer.conductivityWmK);
    layerRs.push(r);
    sumR += r;
  }
  const u = 1 / sumR;
  return {
    uValueWm2K: u,
    totalRM2KW: sumR,
    trace: {
      id: "u_from_layers",
      title: "U-value from layers",
      status: "calculated",
      formula: "R_i = t/λ; R_total = R_si+se + ΣR_i; U = 1/R_total",
      inputs: {
        surfaceResistance_m2KW: surfaceResistanceM2KW,
        layerCount: layers.length,
        layerResistances_m2KW: layerRs.map((r) => Number(r.toFixed(4))).join(", "),
        totalR_m2KW: Number(sumR.toFixed(6)),
      },
      result: u,
      resultUnit: "W/m²K",
      assumptions: [
        `Air film resistance R_si+se = ${surfaceResistanceM2KW} m²K/W (ISO 6946 conventional / documented)`,
      ],
      missingInputs: [],
    },
  };
}

export function resolveSurfaceU(opts: {
  uValueWm2K?: number;
  layers?: MaterialLayerInput[];
  surfaceResistanceM2KW?: number;
}): { uValueWm2K: number | null; status: "calculated" | "unavailable"; missing: string[]; traces: TraceRecord[] } {
  if (opts.uValueWm2K != null) {
    if (!(opts.uValueWm2K > 0) || opts.uValueWm2K > 20) {
      throw new Error("U-value out of plausible range");
    }
    return {
      uValueWm2K: opts.uValueWm2K,
      status: "calculated",
      missing: [],
      traces: [
        {
          id: "u_direct",
          title: "U-value (user/catalog supplied)",
          status: "calculated",
          formula: "U supplied directly",
          inputs: { U_Wm2K: opts.uValueWm2K },
          result: opts.uValueWm2K,
          resultUnit: "W/m²K",
          assumptions: [],
          missingInputs: [],
        },
      ],
    };
  }
  if (opts.layers?.length) {
    const { uValueWm2K, trace } = assemblyUValueWm2K(
      opts.layers,
      opts.surfaceResistanceM2KW ?? DEFAULT_AIR_FILM_R_M2KW
    );
    return { uValueWm2K, status: "calculated", missing: [], traces: [trace] };
  }
  return {
    uValueWm2K: null,
    status: "unavailable",
    missing: ["uValueWm2K or material layers (thickness + conductivity)"],
    traces: [],
  };
}
