/**
 * Physics-based thermal calculations — pure functions, no UI deps.
 *
 * R_layer = thickness_m / λ
 * Total R = Σ layers + air film resistances
 * U-value = 1 / Total_R
 * Heat Flux (kW) = U × Area × ΔT / 1000
 */

import {
  AIR_FILM_EXTERNAL_R,
  AIR_FILM_INTERNAL_R,
  MATERIAL_PRESETS,
  WINDOW_EFFECTIVE_U,
  type MaterialId,
} from "./materials";

export interface LayerInput {
  materialId: MaterialId;
  thicknessM: number;
}

export interface AssemblyResult {
  totalR: number;
  uValue: number;
  layers: Array<{
    materialId: MaterialId;
    label: string;
    thicknessM: number;
    lambda: number;
    rValue: number;
  }>;
  airFilmR: number;
  outlierFlag: string | null;
  formula: string;
  source: string;
}

export interface HeatFluxResult {
  heatFluxKW: number;
  uValue: number;
  areaM2: number;
  deltaT: number;
  formula: string;
}

/** Real assemblies typically yield U in 0.12–2.09 W/m²K — flag outliers */
export const U_VALUE_SANE_MIN = 0.12;
export const U_VALUE_SANE_MAX = 2.09;

export function calculateLayerR(thicknessM: number, lambda: number): number {
  if (lambda <= 0) {
    throw new Error("Thermal conductivity λ must be > 0");
  }
  if (thicknessM < 0) {
    throw new Error("Thickness must be ≥ 0");
  }
  return thicknessM / lambda;
}

export function calculateAssemblyU(layers: LayerInput[]): AssemblyResult {
  try {
    if (!layers.length) {
      throw new Error("At least one layer required");
    }

    // Window shortcut: use effective U for glazing assemblies
    const onlyWindow =
      layers.length === 1 && WINDOW_EFFECTIVE_U[layers[0].materialId] != null;
    if (onlyWindow) {
      const mid = layers[0].materialId;
      const uValue = WINDOW_EFFECTIVE_U[mid]!;
      const preset = MATERIAL_PRESETS[mid];
      return {
        totalR: 1 / uValue,
        uValue,
        layers: [
          {
            materialId: mid,
            label: preset.label,
            thicknessM: layers[0].thicknessM,
            lambda: preset.lambda,
            rValue: 1 / uValue,
          },
        ],
        airFilmR: AIR_FILM_INTERNAL_R + AIR_FILM_EXTERNAL_R,
        outlierFlag:
          uValue > U_VALUE_SANE_MAX
            ? `U-value ${uValue.toFixed(2)} exceeds typical 0.12–2.09 range (single glazing is expected to be high).`
            : null,
        formula: "U_effective (glazing) — air-gap assembly not modeled as solid λ layers",
        source: preset.source,
      };
    }

    const airFilmR = AIR_FILM_INTERNAL_R + AIR_FILM_EXTERNAL_R;
    const computed = layers.map((layer) => {
      const preset = MATERIAL_PRESETS[layer.materialId];
      if (!preset) {
        throw new Error(`Unknown material: ${layer.materialId}`);
      }
      const rValue = calculateLayerR(layer.thicknessM, preset.lambda);
      return {
        materialId: layer.materialId,
        label: preset.label,
        thicknessM: layer.thicknessM,
        lambda: preset.lambda,
        rValue,
      };
    });

    const totalR = computed.reduce((sum, l) => sum + l.rValue, 0) + airFilmR;
    const uValue = 1 / totalR;

    let outlierFlag: string | null = null;
    if (uValue < U_VALUE_SANE_MIN || uValue > U_VALUE_SANE_MAX) {
      outlierFlag = `U-value ${uValue.toFixed(3)} W/m²K outside typical 0.12–2.09 range — likely input error.`;
    }

    return {
      totalR,
      uValue,
      layers: computed,
      airFilmR,
      outlierFlag,
      formula: "R_layer = t/λ; Total_R = ΣR + R_si + R_se; U = 1/Total_R",
      source: "ISO 6946 / CIBSE Guide A air films; material λ from presets",
    };
  } catch (err) {
    throw new Error(
      `calculateAssemblyU failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export function calculateHeatFlux(
  uValue: number,
  areaM2: number,
  outdoorTempC: number,
  indoorTempC: number
): HeatFluxResult {
  try {
    const deltaT = outdoorTempC - indoorTempC;
    const heatFluxKW = (uValue * areaM2 * deltaT) / 1000;
    return {
      heatFluxKW,
      uValue,
      areaM2,
      deltaT,
      formula: "Heat Flux (kW) = U × Area × (T_out − T_in) / 1000",
    };
  } catch (err) {
    throw new Error(
      `calculateHeatFlux failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Ventilation modifier: mechanical = +15% load vs natural.
 * Documented assumption, not cited.
 */
export const MECHANICAL_VENTILATION_LOAD_FACTOR = 1.15;
export const NATURAL_VENTILATION_LOAD_FACTOR = 1.0;

export function applyVentilationModifier(
  baseLoadKW: number,
  ventilation: "mechanical" | "natural"
): { loadKW: number; factor: number; note: string } {
  const factor =
    ventilation === "mechanical"
      ? MECHANICAL_VENTILATION_LOAD_FACTOR
      : NATURAL_VENTILATION_LOAD_FACTOR;
  return {
    loadKW: baseLoadKW * factor,
    factor,
    note:
      ventilation === "mechanical"
        ? "Mechanical ventilation: +15% load factor (documented assumption, not cited)"
        : "Natural ventilation: no additional load factor",
  };
}

/** Efficiency indicator 0–100 for wizard live preview (higher = better insulated) */
export function efficiencyIndicatorFromU(uValue: number): number {
  // Map U 0.12 (excellent) → 100, U 5.8 (single pane) → ~0
  const clamped = Math.min(Math.max(uValue, 0.12), 5.8);
  return Math.round(100 * (1 - (clamped - 0.12) / (5.8 - 0.12)));
}

export interface EnvelopeAreas {
  wallAreaM2: number;
  roofAreaM2: number;
  windowAreaM2: number;
}

/**
 * Derive envelope areas from floor area (documented geometric assumptions).
 * Wall ≈ 2.8 × √(area) × 3m height perimeter proxy for square plan.
 * Windows ≈ 20% of wall; roof ≈ floor area.
 */
export function estimateEnvelopeAreas(floorAreaM2: number): EnvelopeAreas {
  const side = Math.sqrt(floorAreaM2);
  const perimeter = 4 * side;
  const wallAreaM2 = perimeter * 3.0; // 3m storey height — documented assumption
  const windowAreaM2 = wallAreaM2 * 0.2;
  const opaqueWallM2 = wallAreaM2 - windowAreaM2;
  return {
    wallAreaM2: opaqueWallM2,
    roofAreaM2: floorAreaM2,
    windowAreaM2,
  };
}

export interface BuildingThermalLoadInput {
  wallLayers: LayerInput[];
  roofLayers: LayerInput[];
  windowMaterialId: MaterialId;
  floorAreaM2: number;
  outdoorTempC: number;
  indoorTempC: number;
  ventilation: "mechanical" | "natural";
}

export interface BuildingThermalLoadResult {
  wall: AssemblyResult;
  roof: AssemblyResult;
  window: AssemblyResult;
  areas: EnvelopeAreas;
  wallFluxKW: number;
  roofFluxKW: number;
  windowFluxKW: number;
  baseEnvelopeLoadKW: number;
  totalLoadKW: number;
  ventilationNote: string;
  outlierFlags: string[];
  formulas: string[];
}

export function calculateBuildingThermalLoad(
  input: BuildingThermalLoadInput
): BuildingThermalLoadResult {
  try {
    const areas = estimateEnvelopeAreas(input.floorAreaM2);
    const wall = calculateAssemblyU(input.wallLayers);
    const roof = calculateAssemblyU(input.roofLayers);
    const window = calculateAssemblyU([
      {
        materialId: input.windowMaterialId,
        thicknessM: MATERIAL_PRESETS[input.windowMaterialId].defaultThicknessM,
      },
    ]);

    // Use absolute heat gain magnitude for cooling load ranking
    const wallFlux = calculateHeatFlux(
      wall.uValue,
      areas.wallAreaM2,
      input.outdoorTempC,
      input.indoorTempC
    );
    const roofFlux = calculateHeatFlux(
      roof.uValue,
      areas.roofAreaM2,
      input.outdoorTempC,
      input.indoorTempC
    );
    const windowFlux = calculateHeatFlux(
      window.uValue,
      areas.windowAreaM2,
      input.outdoorTempC,
      input.indoorTempC
    );

    const baseEnvelopeLoadKW =
      Math.abs(wallFlux.heatFluxKW) +
      Math.abs(roofFlux.heatFluxKW) +
      Math.abs(windowFlux.heatFluxKW);

    const vent = applyVentilationModifier(baseEnvelopeLoadKW, input.ventilation);

    const outlierFlags = [wall.outlierFlag, roof.outlierFlag, window.outlierFlag].filter(
      (f): f is string => Boolean(f)
    );

    return {
      wall,
      roof,
      window,
      areas,
      wallFluxKW: wallFlux.heatFluxKW,
      roofFluxKW: roofFlux.heatFluxKW,
      windowFluxKW: windowFlux.heatFluxKW,
      baseEnvelopeLoadKW,
      totalLoadKW: vent.loadKW,
      ventilationNote: vent.note,
      outlierFlags,
      formulas: [
        wall.formula,
        wallFlux.formula,
        vent.note,
      ],
    };
  } catch (err) {
    throw new Error(
      `calculateBuildingThermalLoad failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/** Default indoor setpoint for cooling-season analysis */
export const DEFAULT_INDOOR_TEMP_C = 24;
