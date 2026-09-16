export type MachineBaselineInput = {
  loadKW?: number | null;
  ratedCapacityKW?: number | null;
  powerKW?: number | null;
  efficiency?: number | null;
  cop?: number | null;
  runtimeHours?: number | null;
  electricityRateINRPerKWh?: number | null;
  billEnergyKWh?: number | null;
  billMonths?: number | null;
};

export type MachineCalculation = {
  currentPowerKW: number | null;
  calculatedPowerKW: number | null;
  annualEnergyKWh: number | null;
  annualCostINR: number | null;
  billEnergyKWh: number | null;
  billMonths: number | null;
  annualizedBillEnergyKWh: number | null;
  baselineBasis: string[];
  gaps: string[];
};

export type RetrofitWhatIf = {
  title: string;
  targetEfficiency?: number;
  targetCOP?: number;
  targetRuntimeHours?: number;
  powerKW: number | null;
  annualEnergyKWh: number | null;
  annualCostINR: number | null;
  energySavingKWh: number | null;
  costSavingINR: number | null;
  basis: string;
};

const finitePositive = (value: number | null | undefined) => Number.isFinite(value) && (value as number) > 0 ? value as number : null;
const validEfficiency = (value: number | null) => value != null && value <= 1;

export function calculateMachineBaseline(input: MachineBaselineInput): MachineCalculation {
  const loadKW = finitePositive(input.loadKW);
  const ratedCapacityKW = finitePositive(input.ratedCapacityKW);
  const currentPowerKW = finitePositive(input.powerKW);
  const efficiency = finitePositive(input.efficiency);
  const cop = finitePositive(input.cop);
  const runtimeHours = finitePositive(input.runtimeHours);
  const rate = finitePositive(input.electricityRateINRPerKWh);
  const billEnergyKWh = finitePositive(input.billEnergyKWh);
  const billMonths = finitePositive(input.billMonths);

  const gaps: string[] = [];
  const basis: string[] = [];
  const duty = loadKW ?? ratedCapacityKW;
  if (loadKW != null && ratedCapacityKW != null && loadKW > ratedCapacityKW) gaps.push("Observed duty exceeds the supplied rated capacity; verify the duty, rating and units before treating utilisation as valid.");
  if (efficiency != null && !validEfficiency(efficiency)) gaps.push("Efficiency must be greater than 0 and no greater than 1 for this calculation path.");
  if (runtimeHours != null && runtimeHours > 8760) gaps.push("Annual runtime exceeds 8,760 h/yr; verify the period and units.");

  let calculatedPowerKW: number | null = null;
  if (duty != null && cop != null) {
    calculatedPowerKW = duty / cop;
    basis.push("cooling/heating duty ÷ COP");
  } else if (duty != null && efficiency != null && validEfficiency(efficiency)) {
    calculatedPowerKW = duty / efficiency;
    basis.push("mechanical/thermal duty ÷ efficiency");
  }

  if (currentPowerKW == null && calculatedPowerKW == null) gaps.push("Observed power or a validated load + efficiency/COP relationship is required for a calculated electrical baseline.");
  if (runtimeHours == null) gaps.push("Runtime is not established; annual equipment energy cannot be projected from instantaneous power alone.");
  if (rate == null) gaps.push("Electricity tariff is not established; monetary savings remain unquantified.");

  const powerForAnnual = currentPowerKW ?? calculatedPowerKW;
  const annualEnergyKWh = powerForAnnual != null && runtimeHours != null ? powerForAnnual * runtimeHours : null;
  const annualCostINR = annualEnergyKWh != null && rate != null ? annualEnergyKWh * rate : null;
  const annualizedBillEnergyKWh = billEnergyKWh != null && billMonths != null ? billEnergyKWh * 12 / billMonths : null;

  if (billEnergyKWh != null && billMonths == null) gaps.push("Bill energy is present, but the covered month count is not established; no annualisation is applied.");
  if (billEnergyKWh != null && billMonths != null && billMonths > 12) gaps.push("Bill history exceeds one year; annualised bill energy uses the supplied period length.");

  if (currentPowerKW != null) basis.push("observed power");
  if (billEnergyKWh != null) basis.push(`electric bill history (${billMonths != null ? `${billMonths} month${billMonths === 1 ? "" : "s"}` : "period unresolved"})`);

  return { currentPowerKW, calculatedPowerKW, annualEnergyKWh, annualCostINR, billEnergyKWh: billEnergyKWh ?? null, billMonths: billMonths ?? null, annualizedBillEnergyKWh, baselineBasis: basis, gaps };
}

export function calculateMachineRetrofit(input: MachineBaselineInput & { targetEfficiency?: number | null; targetCOP?: number | null; targetRuntimeHours?: number | null; title?: string }): RetrofitWhatIf | null {
  const loadKW = finitePositive(input.loadKW) ?? finitePositive(input.ratedCapacityKW);
  const baselinePower = finitePositive(input.powerKW);
  const efficiency = finitePositive(input.efficiency);
  const cop = finitePositive(input.cop);
  const runtime = finitePositive(input.runtimeHours);
  const rate = finitePositive(input.electricityRateINRPerKWh);
  const targetEfficiency = finitePositive(input.targetEfficiency);
  const targetCOP = finitePositive(input.targetCOP);
  const targetRuntimeHours = finitePositive(input.targetRuntimeHours);

  if (loadKW == null) return null;
  if (targetEfficiency == null && targetCOP == null && targetRuntimeHours == null) return null;
  if (targetEfficiency != null && (!validEfficiency(targetEfficiency) || (efficiency == null && targetCOP == null))) return null;
  if (targetCOP != null && (cop == null && targetEfficiency == null)) return null;
  if (targetRuntimeHours != null && targetRuntimeHours > 8760) return null;
  if (runtime != null && runtime > 8760) return null;
  if (input.loadKW != null && input.ratedCapacityKW != null && input.loadKW > input.ratedCapacityKW) return null;
  if (targetEfficiency != null && targetEfficiency <= (efficiency ?? 0) && targetCOP == null && targetRuntimeHours == null) return null;

  const baselineCalculated = baselinePower ?? (cop != null ? loadKW / cop : efficiency != null && validEfficiency(efficiency) ? loadKW / efficiency : null);
  if (baselineCalculated == null) return null;

  const targetPower = targetCOP != null ? loadKW / targetCOP : targetEfficiency != null ? loadKW / targetEfficiency : baselineCalculated;
  const effectiveRuntime = targetRuntimeHours ?? runtime;
  if (effectiveRuntime == null) return null;

  const annualEnergyKWh = targetPower * effectiveRuntime;
  const baselineAnnualEnergy = runtime != null ? baselineCalculated * runtime : null;
  const annualCostINR = rate != null ? annualEnergyKWh * rate : null;
  const baselineCostINR = baselineAnnualEnergy != null && rate != null ? baselineAnnualEnergy * rate : null;

  const basis = [
    targetCOP != null ? "explicit target COP" : targetEfficiency != null ? "explicit target efficiency" : "explicit target runtime",
    targetRuntimeHours != null ? "explicit target runtime" : "existing runtime",
    baselinePower != null ? "observed baseline power" : cop != null ? "baseline COP relationship" : "baseline efficiency relationship",
  ].join(" + ");

  return {
    title: input.title || (targetCOP != null || targetEfficiency != null ? "Efficiency / COP retrofit" : "Runtime / controls retrofit"),
    targetEfficiency: targetEfficiency ?? undefined,
    targetCOP: targetCOP ?? undefined,
    targetRuntimeHours: targetRuntimeHours ?? undefined,
    powerKW: targetPower,
    annualEnergyKWh,
    annualCostINR,
    energySavingKWh: baselineAnnualEnergy != null ? baselineAnnualEnergy - annualEnergyKWh : null,
    costSavingINR: baselineCostINR != null && annualCostINR != null ? baselineCostINR - annualCostINR : null,
    basis,
  };
}

export function extractBillEnergy(observations: Array<{ field?: string; numericValue?: number | null; unit?: string | null }>): { totalKWh: number | null; evidenceCount: number } {
  let total = 0;
  let count = 0;
  for (const observation of observations) {
    const value = observation.numericValue;
    if (!Number.isFinite(value) || (value as number) <= 0) continue;
    const field = String(observation.field || "").toLowerCase();
    const unit = String(observation.unit || "").toLowerCase().replace(/\s+/g, "");
    const isTariff = field.includes("tariff") || unit.includes("inr/kwh") || unit.includes("₹/kwh") || unit.includes("$/kwh");
    const energyField = field.includes("energy") || field.includes("consumption") || field.includes("units") || field.includes("kwh");
    const energyUnit = unit === "kwh" || unit === "unit" || unit === "units";
    if (isTariff || !(energyField || energyUnit)) continue;
    if (field.includes("demand") || unit === "kw") continue;
    total += value as number;
    count += 1;
  }
  return { totalKWh: count ? total : null, evidenceCount: count };
}
