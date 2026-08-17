/**
 * End-to-end deterministic pipeline: Stages 1–4 (+ optional future climate).
 */

import { generateEnvelopeActions, generateHvacActions } from "./actions";
import {
  DEFAULT_UNKNOWN_HVAC,
  ageRangeToYears,
  getHVACRecommendation,
  tonsToKW,
  type HVACSystemType,
  type Zoning,
} from "./hvac";
import type { MaterialId } from "./materials";
import { MATERIAL_PRESETS } from "./materials";
import {
  rankActions,
  type RankedPlan,
  type ReportedIssue,
  type RetrofitAction,
} from "./ranking";
import {
  DEFAULT_ENERGY_RATE_INR,
  type OccupancyProfile,
} from "./savings";
import {
  DEFAULT_INDOOR_TEMP_C,
  calculateBuildingThermalLoad,
  type BuildingThermalLoadResult,
} from "./thermal";

export interface WizardInput {
  locationLabel: string;
  latitude: number;
  longitude: number;
  floorAreaM2: number;
  buildingType: OccupancyProfile;
  wallMaterialId: MaterialId;
  roofMaterialId: MaterialId;
  windowMaterialId: MaterialId;
  hvacSystemType: HVACSystemType;
  capacityTons: number;
  capacityUnit: "tons" | "kW";
  capacityValue: number;
  ageRange: "<5" | "5-10" | "10-15" | "15+";
  zoning: Zoning;
  ventilation: "mechanical" | "natural";
  reportedIssues: ReportedIssue[];
  energyRateINR: number;
  hvacUnknown: boolean;
}

export interface ClimateSnapshot {
  outdoorTempC: number;
  source: string;
  fetchedAt: string;
  isFuture: boolean;
  yearLabel: string;
}

export interface PipelineResult {
  input: WizardInput;
  climate: ClimateSnapshot;
  thermal: BuildingThermalLoadResult;
  ranked: RankedPlan;
  actions: RetrofitAction[];
  extremeHeatLoadKW: number;
  confidence: "high" | "medium" | "low";
  confidenceNotes: string[];
  errors: string[];
}

export function resolveCapacityKW(input: WizardInput): number {
  if (input.hvacUnknown || input.hvacSystemType === "dont_know") {
    return DEFAULT_UNKNOWN_HVAC.capacityKW;
  }
  if (input.capacityUnit === "tons") {
    return tonsToKW(input.capacityValue);
  }
  return input.capacityValue;
}

export function runPipeline(
  input: WizardInput,
  climate: ClimateSnapshot
): PipelineResult {
  const errors: string[] = [];
  const confidenceNotes: string[] = [];

  try {
    let confidence: "high" | "medium" | "low" = "high";
    const hvacUnknown =
      input.hvacUnknown || input.hvacSystemType === "dont_know";
    if (hvacUnknown) {
      confidence = "low";
      confidenceNotes.push(DEFAULT_UNKNOWN_HVAC.flag);
    }

    const ratedCapacityKW = resolveCapacityKW(input);
    const ageYears = hvacUnknown
      ? DEFAULT_UNKNOWN_HVAC.ageYears
      : ageRangeToYears(input.ageRange);
    const zoning: Zoning = hvacUnknown ? DEFAULT_UNKNOWN_HVAC.zoning : input.zoning;
    const energyRate = input.energyRateINR || DEFAULT_ENERGY_RATE_INR;

    const thermal = calculateBuildingThermalLoad({
      wallLayers: [
        {
          materialId: input.wallMaterialId,
          thicknessM: MATERIAL_PRESETS[input.wallMaterialId].defaultThicknessM,
        },
      ],
      roofLayers: [
        {
          materialId: input.roofMaterialId,
          thicknessM: MATERIAL_PRESETS[input.roofMaterialId].defaultThicknessM,
        },
      ],
      windowMaterialId: input.windowMaterialId,
      floorAreaM2: input.floorAreaM2,
      outdoorTempC: climate.outdoorTempC,
      indoorTempC: DEFAULT_INDOOR_TEMP_C,
      ventilation: input.ventilation,
    });

    if (thermal.outlierFlags.length) {
      confidenceNotes.push(...thermal.outlierFlags);
      if (confidence === "high") confidence = "medium";
    }

    const hvacVerdict = getHVACRecommendation(
      thermal.totalLoadKW,
      ratedCapacityKW,
      ageYears,
      zoning
    );

    const ctx = {
      thermal,
      outdoorTempC: climate.outdoorTempC,
      indoorTempC: DEFAULT_INDOOR_TEMP_C,
      occupancy: input.buildingType,
      energyRate,
      wallMaterialId: input.wallMaterialId,
      roofMaterialId: input.roofMaterialId,
      windowMaterialId: input.windowMaterialId,
      floorAreaM2: input.floorAreaM2,
      hvacVerdict,
      systemType: hvacUnknown ? DEFAULT_UNKNOWN_HVAC.systemType : input.hvacSystemType,
      ratedCapacityKW,
      zoning,
      ventilation: input.ventilation,
    };

    const envelopeActions = generateEnvelopeActions(ctx);
    const hvacActions = generateHvacActions(ctx);
    const ranked = rankActions(
      envelopeActions,
      hvacVerdict,
      input.reportedIssues,
      hvacActions
    );

    const extremeHeatLoadKW = calculateBuildingThermalLoad({
      wallLayers: [
        {
          materialId: input.wallMaterialId,
          thicknessM: MATERIAL_PRESETS[input.wallMaterialId].defaultThicknessM,
        },
      ],
      roofLayers: [
        {
          materialId: input.roofMaterialId,
          thicknessM: MATERIAL_PRESETS[input.roofMaterialId].defaultThicknessM,
        },
      ],
      windowMaterialId: input.windowMaterialId,
      floorAreaM2: input.floorAreaM2,
      outdoorTempC: climate.outdoorTempC + 5,
      indoorTempC: DEFAULT_INDOOR_TEMP_C,
      ventilation: input.ventilation,
    }).totalLoadKW;

    return {
      input,
      climate,
      thermal,
      ranked,
      actions: ranked.actions,
      extremeHeatLoadKW,
      confidence,
      confidenceNotes,
      errors,
    };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    // Minimal fallback so UI never blank-crashes
    const emptyThermal = calculateBuildingThermalLoad({
      wallLayers: [
        {
          materialId: "brick_common",
          thicknessM: MATERIAL_PRESETS.brick_common.defaultThicknessM,
        },
      ],
      roofLayers: [
        {
          materialId: "concrete_roof",
          thicknessM: MATERIAL_PRESETS.concrete_roof.defaultThicknessM,
        },
      ],
      windowMaterialId: "single_pane_glass",
      floorAreaM2: input.floorAreaM2 || 100,
      outdoorTempC: climate.outdoorTempC || 35,
      indoorTempC: DEFAULT_INDOOR_TEMP_C,
      ventilation: "natural",
    });

    const fallbackVerdict = getHVACRecommendation(
      emptyThermal.totalLoadKW,
      tonsToKW(3),
      8,
      "single"
    );

    return {
      input,
      climate,
      thermal: emptyThermal,
      ranked: {
        actions: [],
        hvacVerdict: fallbackVerdict,
        issueWeightNotes: [],
      },
      actions: [],
      extremeHeatLoadKW: emptyThermal.totalLoadKW,
      confidence: "low",
      confidenceNotes: ["Pipeline error — showing fallback thermal estimate only"],
      errors,
    };
  }
}

/** Compare Today vs 2035 ranking order */
export function compareRankingOrders(
  today: RetrofitAction[],
  future: RetrofitAction[]
): {
  orderChanged: boolean;
  todayOrder: string[];
  futureOrder: string[];
  changes: string[];
} {
  const todayOrder = today.map((a) => a.id);
  const futureOrder = future.map((a) => a.id);
  const orderChanged = todayOrder.join() !== futureOrder.join();
  const changes: string[] = [];

  if (orderChanged) {
    for (let i = 0; i < Math.max(todayOrder.length, futureOrder.length); i++) {
      if (todayOrder[i] !== futureOrder[i]) {
        changes.push(
          `Position ${i + 1}: today=${todayOrder[i] ?? "—"} → 2035=${futureOrder[i] ?? "—"}`
        );
      }
    }
  }

  return { orderChanged, todayOrder, futureOrder, changes };
}
