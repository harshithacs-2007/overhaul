/**
 * Embodied + transit carbon calculations — pure functions.
 * Embodied + transit = Σ(Material Mass × Carbon Coefficient) + Σ(Transit Distance × Emission Factor)
 */

import { MATERIAL_PRESETS, type MaterialId } from "./materials";

/** Road freight emission factor kg CO2e / tonne-km — documented mid-range assumption (DEFRA-like) */
export const TRANSIT_EMISSION_KG_PER_TONNE_KM = 0.12;

export interface MaterialCarbonInput {
  materialId: MaterialId;
  areaM2: number;
  thicknessM: number;
  /** Optional transit distance in km (one-way, documented assumption if defaulted) */
  transitDistanceKm?: number;
}

export interface MaterialCarbonResult {
  materialId: MaterialId;
  label: string;
  massKg: number;
  embodiedKgCO2e: number;
  transitKgCO2e: number;
  totalKgCO2e: number;
  source: string;
  assumptionNotes: string[];
}

export function calculateMaterialEmbodiedCarbon(
  input: MaterialCarbonInput
): MaterialCarbonResult {
  try {
    const preset = MATERIAL_PRESETS[input.materialId];
    if (!preset) {
      throw new Error(`Unknown material: ${input.materialId}`);
    }

    const assumptions: string[] = [];
    const density = preset.densityKgPerM3 ?? 1000;
    if (preset.densityKgPerM3 == null) {
      assumptions.push("Density defaulted to 1000 kg/m³ (documented assumption)");
    }

    const massKg = density * input.thicknessM * input.areaM2;
    let embodiedKgCO2e = 0;

    if (preset.embodiedCarbon != null && preset.coefficientType === "per_m2") {
      embodiedKgCO2e = preset.embodiedCarbon * input.areaM2;
    } else if (preset.embodiedCarbon != null && preset.coefficientType === "per_kg") {
      embodiedKgCO2e = preset.embodiedCarbon * massKg;
    } else {
      assumptions.push(
        `No embodied carbon coefficient for ${preset.label} — treated as 0 (documented assumption)`
      );
    }

    const transitKm = input.transitDistanceKm ?? 50;
    if (input.transitDistanceKm == null) {
      assumptions.push("Transit distance defaulted to 50 km (documented assumption)");
    }
    const transitKgCO2e =
      (massKg / 1000) * transitKm * TRANSIT_EMISSION_KG_PER_TONNE_KM;

    return {
      materialId: input.materialId,
      label: preset.label,
      massKg,
      embodiedKgCO2e,
      transitKgCO2e,
      totalKgCO2e: embodiedKgCO2e + transitKgCO2e,
      source: preset.source,
      assumptionNotes: assumptions,
    };
  } catch (err) {
    throw new Error(
      `calculateMaterialEmbodiedCarbon failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export function sumEmbodiedCarbon(
  items: MaterialCarbonInput[]
): {
  totalKgCO2e: number;
  items: MaterialCarbonResult[];
  formula: string;
} {
  const results = items.map(calculateMaterialEmbodiedCarbon);
  return {
    totalKgCO2e: results.reduce((s, r) => s + r.totalKgCO2e, 0),
    items: results,
    formula:
      "Embodied + transit = Σ(Mass × Coefficient) + Σ(Transit_km × Emission_factor)",
  };
}

/** Material lifespan years for carbon-payback net-positive check */
export const MATERIAL_LIFESPAN_YEARS: Record<string, number> = {
  concrete: 55, // ~50–60yr mid — documented assumption
  insulation: 27.5, // ~25–30yr mid — documented assumption
  glazing: 30, // documented assumption
  default: 30,
};

export function lifespanForMaterial(materialId: MaterialId): number {
  const preset = MATERIAL_PRESETS[materialId];
  if (!preset) return MATERIAL_LIFESPAN_YEARS.default;
  if (preset.category === "insulation") return MATERIAL_LIFESPAN_YEARS.insulation;
  if (preset.category === "window") return MATERIAL_LIFESPAN_YEARS.glazing;
  if (
    materialId.includes("concrete") ||
    materialId.includes("brick") ||
    materialId.includes("roof")
  ) {
    return MATERIAL_LIFESPAN_YEARS.concrete;
  }
  return MATERIAL_LIFESPAN_YEARS.default;
}
