/**
 * Retrofit action catalog + generation from building inputs.
 * Costs are India-market mid-range placeholders — labeled as assumptions.
 */

import {
  calculateMaterialEmbodiedCarbon,
  lifespanForMaterial,
} from "./embodiedCarbon";
import type { HVACRecommendation, HVACSystemType, Zoning } from "./hvac";
import { tonsToKW } from "./hvac";
import type { MaterialId } from "./materials";
import { MATERIAL_PRESETS } from "./materials";
import type { OccupancyProfile } from "./savings";
import type { RetrofitAction } from "./ranking";
import {
  DEFAULT_GRID_KG_CO2_PER_KWH,
  estimateSavings,
  getCarbonPayback,
  operationalCarbonSaved,
} from "./savings";
import {
  calculateAssemblyU,
  calculateHeatFlux,
  estimateEnvelopeAreas,
  type BuildingThermalLoadResult,
} from "./thermal";

type ActionBase = Omit<
  RetrofitAction,
  "baseScore" | "issueBoost" | "finalScore" | "whyRankedHere"
>;

function buildActionMetrics(opts: {
  id: string;
  category: ActionBase["category"];
  title: string;
  description: string;
  costINR: number;
  loadReductionKW: number;
  embodiedKgCO2e: number;
  materialLifespanYears: number;
  occupancy: OccupancyProfile;
  energyRate: number;
  comfortImpact: string;
  maintenanceImpact: string;
  formulas: string[];
}): ActionBase {
  const savings = estimateSavings(
    opts.loadReductionKW,
    opts.energyRate,
    opts.costINR,
    opts.occupancy
  );
  const annualCarbon = operationalCarbonSaved(
    savings.annualKWhSaved,
    DEFAULT_GRID_KG_CO2_PER_KWH
  );
  const carbonPayback = getCarbonPayback(
    opts.embodiedKgCO2e,
    annualCarbon,
    opts.materialLifespanYears
  );

  return {
    id: opts.id,
    category: opts.category,
    title: opts.title,
    description: opts.description,
    costINR: opts.costINR,
    carbonSavedKgCO2e: annualCarbon,
    loadReductionKW: opts.loadReductionKW,
    annualKWhSaved: savings.annualKWhSaved,
    annualCostSavedINR: savings.annualCostSaved,
    paybackYears: savings.paybackYears,
    carbonPaybackYears: carbonPayback.carbonPaybackYears,
    isNetPositive: carbonPayback.isNetPositive,
    carbonFlag: carbonPayback.flag,
    comfortImpact: opts.comfortImpact,
    maintenanceImpact: opts.maintenanceImpact,
    formulas: [
      ...opts.formulas,
      savings.formula,
      carbonPayback.formula,
      `Grid factor ${DEFAULT_GRID_KG_CO2_PER_KWH} kg CO2e/kWh (documented placeholder)`,
    ],
  };
}

function fluxForU(
  uValue: number,
  areaM2: number,
  outdoorTempC: number,
  indoorTempC: number
): number {
  return Math.abs(
    calculateHeatFlux(uValue, areaM2, outdoorTempC, indoorTempC).heatFluxKW
  );
}

export interface ActionGenContext {
  thermal: BuildingThermalLoadResult;
  outdoorTempC: number;
  indoorTempC: number;
  occupancy: OccupancyProfile;
  energyRate: number;
  wallMaterialId: MaterialId;
  roofMaterialId: MaterialId;
  windowMaterialId: MaterialId;
  floorAreaM2: number;
  hvacVerdict: HVACRecommendation;
  systemType: HVACSystemType;
  ratedCapacityKW: number;
  zoning: Zoning;
  ventilation: "mechanical" | "natural";
}

export function generateEnvelopeActions(ctx: ActionGenContext): ActionBase[] {
  const actions: ActionBase[] = [];
  const { areas, wall, roof, window } = ctx.thermal;
  const wallFlux = fluxForU(
    wall.uValue,
    areas.wallAreaM2,
    ctx.outdoorTempC,
    ctx.indoorTempC
  );
  const roofFlux = fluxForU(
    roof.uValue,
    areas.roofAreaM2,
    ctx.outdoorTempC,
    ctx.indoorTempC
  );
  const windowFlux = fluxForU(
    window.uValue,
    areas.windowAreaM2,
    ctx.outdoorTempC,
    ctx.indoorTempC
  );

  // External wall insulation (rock wool 100mm) — cost assumption ₹1800/m²
  {
    const insulationId: MaterialId = "rock_wool";
    const improved = calculateAssemblyU([
      {
        materialId: ctx.wallMaterialId,
        thicknessM: MATERIAL_PRESETS[ctx.wallMaterialId].defaultThicknessM,
      },
      {
        materialId: insulationId,
        thicknessM: MATERIAL_PRESETS[insulationId].defaultThicknessM,
      },
    ]);
    const newFlux = fluxForU(
      improved.uValue,
      areas.wallAreaM2,
      ctx.outdoorTempC,
      ctx.indoorTempC
    );
    const loadReductionKW = Math.max(0, wallFlux - newFlux);
    const costINR = Math.round(areas.wallAreaM2 * 1800); // documented cost assumption
    const embodied = calculateMaterialEmbodiedCarbon({
      materialId: insulationId,
      areaM2: areas.wallAreaM2,
      thicknessM: MATERIAL_PRESETS[insulationId].defaultThicknessM,
    });

    actions.push(
      buildActionMetrics({
        id: "wall_rockwool",
        category: "envelope_wall",
        title: "Add rock-wool wall insulation (100 mm)",
        description: `Improve opaque wall U from ${wall.uValue.toFixed(2)} → ${improved.uValue.toFixed(2)} W/m²K`,
        costINR,
        loadReductionKW,
        embodiedKgCO2e: embodied.totalKgCO2e,
        materialLifespanYears: lifespanForMaterial(insulationId),
        occupancy: ctx.occupancy,
        energyRate: ctx.energyRate,
        comfortImpact: "More even wall surface temperatures; fewer cold/hot spots",
        maintenanceImpact: "Low — insulation is passive",
        formulas: [
          improved.formula,
          `Cost = wallArea × ₹1800/m² (documented market assumption)`,
          ...embodied.assumptionNotes,
        ],
      })
    );
  }

  // XPS wall alternative
  {
    const insulationId: MaterialId = "xps";
    const improved = calculateAssemblyU([
      {
        materialId: ctx.wallMaterialId,
        thicknessM: MATERIAL_PRESETS[ctx.wallMaterialId].defaultThicknessM,
      },
      {
        materialId: insulationId,
        thicknessM: MATERIAL_PRESETS[insulationId].defaultThicknessM,
      },
    ]);
    const newFlux = fluxForU(
      improved.uValue,
      areas.wallAreaM2,
      ctx.outdoorTempC,
      ctx.indoorTempC
    );
    const loadReductionKW = Math.max(0, wallFlux - newFlux);
    const costINR = Math.round(areas.wallAreaM2 * 2200);
    const embodied = calculateMaterialEmbodiedCarbon({
      materialId: insulationId,
      areaM2: areas.wallAreaM2,
      thicknessM: MATERIAL_PRESETS[insulationId].defaultThicknessM,
    });

    actions.push(
      buildActionMetrics({
        id: "wall_xps",
        category: "envelope_wall",
        title: "Add XPS wall insulation (80 mm)",
        description: `Improve opaque wall U from ${wall.uValue.toFixed(2)} → ${improved.uValue.toFixed(2)} W/m²K`,
        costINR,
        loadReductionKW,
        embodiedKgCO2e: embodied.totalKgCO2e,
        materialLifespanYears: lifespanForMaterial(insulationId),
        occupancy: ctx.occupancy,
        energyRate: ctx.energyRate,
        comfortImpact: "Improved envelope stability",
        maintenanceImpact: "Low — check moisture detailing at install",
        formulas: [
          improved.formula,
          `Cost = wallArea × ₹2200/m² (documented market assumption)`,
        ],
      })
    );
  }

  // Roof insulation
  {
    const insulationId: MaterialId = "pir";
    const improved = calculateAssemblyU([
      {
        materialId: ctx.roofMaterialId,
        thicknessM: MATERIAL_PRESETS[ctx.roofMaterialId].defaultThicknessM,
      },
      {
        materialId: insulationId,
        thicknessM: MATERIAL_PRESETS[insulationId].defaultThicknessM,
      },
    ]);
    const newFlux = fluxForU(
      improved.uValue,
      areas.roofAreaM2,
      ctx.outdoorTempC,
      ctx.indoorTempC
    );
    const loadReductionKW = Math.max(0, roofFlux - newFlux);
    const costINR = Math.round(areas.roofAreaM2 * 2500);
    const embodied = calculateMaterialEmbodiedCarbon({
      materialId: "rock_wool", // use rock wool EPD proxy if PIR lacks coefficient
      areaM2: areas.roofAreaM2,
      thicknessM: MATERIAL_PRESETS[insulationId].defaultThicknessM,
    });

    actions.push(
      buildActionMetrics({
        id: "roof_pir",
        category: "envelope_roof",
        title: "Add PIR roof insulation (80 mm)",
        description: `Improve roof U from ${roof.uValue.toFixed(2)} → ${improved.uValue.toFixed(2)} W/m²K`,
        costINR,
        loadReductionKW,
        embodiedKgCO2e: embodied.totalKgCO2e,
        materialLifespanYears: lifespanForMaterial(insulationId),
        occupancy: ctx.occupancy,
        energyRate: ctx.energyRate,
        comfortImpact: "Lower radiant heat from ceiling",
        maintenanceImpact: "Low",
        formulas: [
          improved.formula,
          `Cost = roofArea × ₹2500/m² (documented market assumption)`,
          "PIR embodied carbon proxied via rock-wool EPD coefficient (documented assumption)",
        ],
      })
    );
  }

  // Window upgrade to double / triple if not already
  if (ctx.windowMaterialId === "single_pane_glass") {
    const target: MaterialId = "double_pane_glass";
    const improved = calculateAssemblyU([
      {
        materialId: target,
        thicknessM: MATERIAL_PRESETS[target].defaultThicknessM,
      },
    ]);
    const newFlux = fluxForU(
      improved.uValue,
      areas.windowAreaM2,
      ctx.outdoorTempC,
      ctx.indoorTempC
    );
    const loadReductionKW = Math.max(0, windowFlux - newFlux);
    const costINR = Math.round(areas.windowAreaM2 * 9000);
    // Glazing embodied: approximate mass × glass coefficient assumption
    const embodiedKg = areas.windowAreaM2 * 25; // documented assumption kg CO2e/m²

    actions.push(
      buildActionMetrics({
        id: "window_double",
        category: "envelope_window",
        title: "Upgrade to double-pane glazing",
        description: `Window U ${window.uValue.toFixed(1)} → ${improved.uValue.toFixed(1)} W/m²K`,
        costINR,
        loadReductionKW,
        embodiedKgCO2e: embodiedKg,
        materialLifespanYears: lifespanForMaterial(target),
        occupancy: ctx.occupancy,
        energyRate: ctx.energyRate,
        comfortImpact: "Reduced draft and radiant discomfort at windows",
        maintenanceImpact: "Seal maintenance every few years",
        formulas: [
          improved.formula,
          `Cost = windowArea × ₹9000/m² (documented market assumption)`,
          "Glazing embodied ≈ 25 kg CO2e/m² (documented assumption)",
        ],
      })
    );
  }

  if (
    ctx.windowMaterialId === "single_pane_glass" ||
    ctx.windowMaterialId === "double_pane_glass"
  ) {
    const target: MaterialId = "triple_pane_glass";
    const improved = calculateAssemblyU([
      {
        materialId: target,
        thicknessM: MATERIAL_PRESETS[target].defaultThicknessM,
      },
    ]);
    const newFlux = fluxForU(
      improved.uValue,
      areas.windowAreaM2,
      ctx.outdoorTempC,
      ctx.indoorTempC
    );
    const loadReductionKW = Math.max(0, windowFlux - newFlux);
    const costINR = Math.round(areas.windowAreaM2 * 14000);
    const embodiedKg = areas.windowAreaM2 * 35;

    actions.push(
      buildActionMetrics({
        id: "window_triple",
        category: "envelope_window",
        title: "Upgrade to triple-pane glazing",
        description: `Window U ${window.uValue.toFixed(1)} → ${improved.uValue.toFixed(1)} W/m²K`,
        costINR,
        loadReductionKW,
        embodiedKgCO2e: embodiedKg,
        materialLifespanYears: lifespanForMaterial(target),
        occupancy: ctx.occupancy,
        energyRate: ctx.energyRate,
        comfortImpact: "Best glazing comfort / noise reduction",
        maintenanceImpact: "Higher upfront; low ongoing",
        formulas: [
          improved.formula,
          `Cost = windowArea × ₹14000/m² (documented market assumption)`,
          "Glazing embodied ≈ 35 kg CO2e/m² (documented assumption)",
        ],
      })
    );
  }

  return actions;
}

export function generateHvacActions(ctx: ActionGenContext): ActionBase[] {
  const actions: ActionBase[] = [];
  const v = ctx.hvacVerdict;

  // Right-size / replace high-efficiency unit
  if (v.verdict === "oversized" || v.verdict === "aging" || v.verdict === "undersized") {
    const targetKW =
      v.verdict === "undersized"
        ? ctx.thermal.totalLoadKW * 1.1
        : ctx.thermal.totalLoadKW / 0.9;
    const targetTons = targetKW / 3.517;
    // Efficiency recovery: reclaim efficiencyLossPct of current waste as load-equivalent savings proxy
    const wasteFraction = v.efficiencyLossPct / 100;
    const loadReductionKW =
      v.verdict === "undersized"
        ? Math.max(0, ctx.thermal.totalLoadKW - ctx.ratedCapacityKW) * 0.3
        : ctx.ratedCapacityKW * wasteFraction * 0.25; // fraction of capacity energy waste recovered

    const costPerTon = 55000; // documented market assumption INR/ton installed mid-range inverter
    const costINR = Math.round(Math.max(targetTons, 1) * costPerTon);
    const embodiedKg = Math.max(targetTons, 1) * 400; // documented assumption kg CO2e/ton equipment

    actions.push(
      buildActionMetrics({
        id: "hvac_replace",
        category: v.verdict === "oversized" ? "hvac_downsize" : "hvac_replace",
        title:
          v.verdict === "oversized"
            ? `Downsize to ~${targetTons.toFixed(1)}-ton high-efficiency unit`
            : `Replace with ~${targetTons.toFixed(1)}-ton high-efficiency unit`,
        description: v.recommendation,
        costINR,
        loadReductionKW: Math.max(loadReductionKW, 0.05),
        embodiedKgCO2e: embodiedKg,
        materialLifespanYears: 15,
        occupancy: ctx.occupancy,
        energyRate: ctx.energyRate,
        comfortImpact:
          v.verdict === "undersized"
            ? "Restores ability to meet peak load"
            : "Longer runtimes, better dehumidification (ASHRAE RP-1340 context)",
        maintenanceImpact: "New equipment — warranty period, then normal service",
        formulas: [
          "Target capacity ≈ calculated load / 0.9 (slight headroom)",
          `Cost ≈ tons × ₹${costPerTon} (documented market assumption)`,
          `Equipment embodied ≈ 400 kg CO2e/ton (documented assumption)`,
          `Savings proxy uses ${v.efficiencyLossPct}% short-cycling waste band`,
        ],
      })
    );
  }

  // Zoning conversion
  if (ctx.zoning === "single") {
    const costINR = Math.round(ctx.floorAreaM2 * 450); // documented assumption
    const loadReductionKW = ctx.thermal.totalLoadKW * 0.08; // diversity / setback — documented assumption
    actions.push(
      buildActionMetrics({
        id: "zoning_multi",
        category: "zoning",
        title: "Convert to multi-zone control",
        description:
          "Allow independent setpoints by zone to cut simultaneous conditioning of unused areas",
        costINR,
        loadReductionKW,
        embodiedKgCO2e: 50, // controls/dampers — documented assumption
        materialLifespanYears: 15,
        occupancy: ctx.occupancy,
        energyRate: ctx.energyRate,
        comfortImpact: "Directly addresses uneven temperature complaints",
        maintenanceImpact: "More dampers/thermostats to service",
        formulas: [
          "Assumed 8% load reduction from zoning diversity (documented assumption)",
          `Cost = floorArea × ₹450/m² (documented market assumption)`,
        ],
      })
    );
  }

  // Ventilation balancing / ERV if mechanical issues
  {
    const costINR = Math.round(ctx.floorAreaM2 * 600);
    const loadReductionKW =
      ctx.ventilation === "mechanical"
        ? ctx.thermal.totalLoadKW * 0.05
        : ctx.thermal.totalLoadKW * 0.02;
    actions.push(
      buildActionMetrics({
        id: "ventilation_erv",
        category: "ventilation",
        title: "Add/balance ventilation with heat recovery (ERV)",
        description:
          "Recover sensible heat from exhaust air to cut ventilation load penalty",
        costINR,
        loadReductionKW,
        embodiedKgCO2e: ctx.floorAreaM2 * 2,
        materialLifespanYears: 20,
        occupancy: ctx.occupancy,
        energyRate: ctx.energyRate,
        comfortImpact: "Improved airflow distribution and IAQ",
        maintenanceImpact: "Filter changes required",
        formulas: [
          "ERV load cut 2–5% of total (documented assumption band)",
          `Cost = floorArea × ₹600/m² (documented market assumption)`,
        ],
      })
    );
  }

  return actions;
}

/** Extreme-heat stress: +5°C outdoor, recompute load */
export function extremeHeatLoadKW(
  floorAreaM2: number,
  wallMaterialId: MaterialId,
  roofMaterialId: MaterialId,
  windowMaterialId: MaterialId,
  outdoorTempC: number,
  indoorTempC: number,
  ventilation: "mechanical" | "natural",
  calculateBuildingThermalLoad: typeof import("./thermal").calculateBuildingThermalLoad
): number {
  return calculateBuildingThermalLoad({
    wallLayers: [
      {
        materialId: wallMaterialId,
        thicknessM: MATERIAL_PRESETS[wallMaterialId].defaultThicknessM,
      },
    ],
    roofLayers: [
      {
        materialId: roofMaterialId,
        thicknessM: MATERIAL_PRESETS[roofMaterialId].defaultThicknessM,
      },
    ],
    windowMaterialId,
    floorAreaM2,
    outdoorTempC: outdoorTempC + 5,
    indoorTempC,
    ventilation,
  }).totalLoadKW;
}

export { estimateEnvelopeAreas, tonsToKW };
