/**
 * HVAC efficiency + verdict — Stage 2.
 * No ML. Physics / documented sizing research only.
 */

export type HVACSystemType =
  | "split_ac"
  | "heat_pump"
  | "packaged_rtu"
  | "vrf"
  | "central_chiller"
  | "dont_know";

export type HVACVerdict = "oversized" | "undersized" | "aging" | "matched";
export type Priority = "high" | "medium" | "low";
export type MaintenanceRisk = "high" | "medium" | "low";
export type Zoning = "single" | "multi";

export interface EfficiencyLossResult {
  efficiencyLossPct: number;
  note: string;
}

/**
 * Real finding: oversized HVAC wastes 15–30% more energy via short-cycling
 * (documented HVAC sizing studies — the "10-minute rule": efficiency ramps up
 * over first ~10 min of continuous runtime).
 */
export function calculateEfficiencyLoss(loadFactor: number): EfficiencyLossResult {
  try {
    if (loadFactor >= 0.85) {
      return {
        efficiencyLossPct: 0,
        note: "Load factor ≥ 0.85 — short-cycling loss negligible",
      };
    }
    const severityFactor = Math.min((0.85 - loadFactor) / 0.85, 1);
    return {
      efficiencyLossPct: Math.round(15 + severityFactor * 15),
      note: "15–30% waste band from documented HVAC sizing / short-cycling studies (10-minute rule)",
    };
  } catch (err) {
    throw new Error(
      `calculateEfficiencyLoss failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export interface HVACRecommendationInput {
  calculatedLoadKW: number;
  ratedCapacityKW: number;
  systemAgeYears: number;
  zoning: Zoning;
}

export interface HVACRecommendation {
  verdict: HVACVerdict;
  priority: Priority;
  recommendation: string;
  maintenanceRisk: MaintenanceRisk;
  efficiencyLossPct: number;
  capacityRatio: number;
  loadFactor: number;
  thermalRibbonPosition: number; // 0–1 for UI ribbon (load/capacity clamped)
}

export function getHVACRecommendation(
  calculatedLoadKW: number,
  ratedCapacityKW: number,
  systemAgeYears: number,
  zoning: Zoning
): HVACRecommendation {
  try {
    if (calculatedLoadKW <= 0) {
      throw new Error("calculatedLoadKW must be > 0");
    }
    if (ratedCapacityKW <= 0) {
      throw new Error("ratedCapacityKW must be > 0");
    }

    const capacityRatio = ratedCapacityKW / calculatedLoadKW;
    const loadFactor = calculatedLoadKW / ratedCapacityKW;
    const efficiencyData = calculateEfficiencyLoss(loadFactor);

    let verdict: HVACVerdict;
    let priority: Priority;
    let maintenanceRisk: MaintenanceRisk;
    let recommendation: string;

    if (capacityRatio > 1.3) {
      verdict = "oversized";
      priority = "low";
      maintenanceRisk = "high";
      recommendation = `Oversized — ~${efficiencyData.efficiencyLossPct}% energy waste from short-cycling (documented HVAC sizing research). Can also raise indoor humidity 10–15 points (ASHRAE RP-1340). Downsize on next replacement, fix envelope first.`;
    } else if (capacityRatio < 0.85) {
      verdict = "undersized";
      priority = "high";
      maintenanceRisk = "medium";
      recommendation =
        "Cannot meet load even after envelope improvements. Prioritize HVAC upgrade.";
    } else if (systemAgeYears > 15) {
      verdict = "aging";
      priority = "medium";
      maintenanceRisk = "high";
      recommendation =
        "Capacity matched but exceeds 15yr service life (documented assumption). Replace with high-efficiency unit.";
    } else {
      verdict = "matched";
      priority = "low";
      maintenanceRisk = "low";
      recommendation = "HVAC well-matched. Focus budget on envelope.";
    }

    if (zoning === "single") {
      recommendation += " Consider multi-zone conversion.";
    }

    return {
      verdict,
      priority,
      recommendation,
      maintenanceRisk,
      efficiencyLossPct: efficiencyData.efficiencyLossPct,
      capacityRatio,
      loadFactor,
      thermalRibbonPosition: Math.min(Math.max(loadFactor, 0), 1.5) / 1.5,
    };
  } catch (err) {
    throw new Error(
      `getHVACRecommendation failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/** 1 refrigeration ton ≈ 3.517 kW */
export const KW_PER_TON = 3.517;

export function tonsToKW(tons: number): number {
  return tons * KW_PER_TON;
}

export function kwToTons(kw: number): number {
  return kw / KW_PER_TON;
}

export const HVAC_SYSTEM_LABELS: Record<HVACSystemType, string> = {
  split_ac: "Split AC",
  heat_pump: "Heat Pump",
  packaged_rtu: "Packaged RTU",
  vrf: "VRF",
  central_chiller: "Central Chiller",
  dont_know: "Don't Know",
};

/** Mid-range split AC default when user selects Don't Know */
export const DEFAULT_UNKNOWN_HVAC = {
  systemType: "split_ac" as HVACSystemType,
  capacityTons: 3,
  capacityKW: tonsToKW(3),
  ageYears: 8,
  ageRange: "5-10" as const,
  zoning: "single" as Zoning,
  confidence: "low" as const,
  flag: "HVAC inputs defaulted to mid-range split AC — lower confidence in results",
};

export function ageRangeToYears(
  range: "<5" | "5-10" | "10-15" | "15+"
): number {
  switch (range) {
    case "<5":
      return 3;
    case "5-10":
      return 7;
    case "10-15":
      return 12;
    case "15+":
      return 18;
  }
}

/** Priority score for ranking: high=3, medium=2, low=1 */
export function priorityScore(priority: Priority): number {
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  return 1;
}
