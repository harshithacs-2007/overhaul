/**
 * Savings, payback, carbon-payback — Stage 3.
 */

export type OccupancyProfile = "home" | "office" | "mixed";

/**
 * Operating hours/day by occupancy profile.
 * Documented assumptions (not metered):
 * - home: 10 h (evening/overnight cooling emphasis)
 * - office: 10 h (business day)
 * - mixed: 12 h
 */
export function operatingHoursForProfile(profile: OccupancyProfile): number {
  switch (profile) {
    case "home":
      return 10;
    case "office":
      return 10;
    case "mixed":
      return 12;
  }
}

export interface SavingsResult {
  annualKWhSaved: number;
  annualCostSaved: number;
  paybackYears: number | null;
  operatingHoursPerDay: number;
  formula: string;
}

export function estimateSavings(
  loadReductionKW: number,
  localEnergyRateKWh: number,
  actionCost: number,
  occupancyProfile: OccupancyProfile
): SavingsResult {
  try {
    const hours = operatingHoursForProfile(occupancyProfile);
    const annualKWhSaved = Math.max(0, loadReductionKW) * hours * 365;
    const annualCostSaved = annualKWhSaved * localEnergyRateKWh;
    const paybackYears =
      annualCostSaved > 0 ? actionCost / annualCostSaved : null;

    return {
      annualKWhSaved,
      annualCostSaved,
      paybackYears,
      operatingHoursPerDay: hours,
      formula:
        "annualKWh = loadReductionKW × hours/day × 365; costSaved = kWh × rate; payback = cost / costSaved",
    };
  } catch (err) {
    throw new Error(
      `estimateSavings failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export interface CarbonPaybackResult {
  carbonPaybackYears: number | null;
  isNetPositive: boolean;
  flag: string | null;
  formula: string;
}

/**
 * materialLifespanYears: concrete ~50–60yr, insulation ~25–30yr (documented assumption)
 */
export function getCarbonPayback(
  embodiedCarbonKgCO2: number,
  annualOperationalCarbonSavedKgCO2: number,
  materialLifespanYears: number
): CarbonPaybackResult {
  try {
    if (annualOperationalCarbonSavedKgCO2 <= 0) {
      return {
        carbonPaybackYears: null,
        isNetPositive: false,
        flag: "No operational carbon savings — cannot compute carbon payback.",
        formula: "carbonPayback = embodied / annualOperationalSaved",
      };
    }

    const carbonPaybackYears =
      embodiedCarbonKgCO2 / annualOperationalCarbonSavedKgCO2;
    const isNetPositive = carbonPaybackYears < materialLifespanYears;
    const flag = isNetPositive
      ? null
      : "Manufacturing carbon not offset within material lifespan — not net-positive.";

    return {
      carbonPaybackYears,
      isNetPositive,
      flag,
      formula:
        "carbonPaybackYears = embodiedKgCO2 / annualOperationalCarbonSaved; net-positive if < materialLifespan",
    };
  } catch (err) {
    throw new Error(
      `getCarbonPayback failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Grid emission factor kg CO2e / kWh.
 * India grid mid-range ~0.82 kg/kWh (CEA-like mid) — documented placeholder assumption.
 */
export const DEFAULT_GRID_KG_CO2_PER_KWH = 0.82;

export function operationalCarbonSaved(
  annualKWhSaved: number,
  gridKgCO2PerKWh: number = DEFAULT_GRID_KG_CO2_PER_KWH
): number {
  return annualKWhSaved * gridKgCO2PerKWh;
}

/** Default energy rate ₹/kWh — documented placeholder, editable in advanced */
export const DEFAULT_ENERGY_RATE_INR = 8;
