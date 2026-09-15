/** Deterministic one-at-a-time sensitivity around an evidence-backed economics case. */
import { calculateRetrofitEconomics, type EconomicsContext, type EconomicsResult } from "./economicsEngine";

export type SensitivityParameter = {
  key: keyof EconomicsContext;
  label: string;
  baseValue: number;
  lowValue: number;
  highValue: number;
  unit?: string;
};

export type SensitivityResult = {
  parameter: SensitivityParameter;
  low: EconomicsResult;
  base: EconomicsResult;
  high: EconomicsResult;
  npvRangeINR: [number | null, number | null];
  paybackRangeYears: [number | null, number | null];
};

const finite = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

function vary(context: EconomicsContext, parameter: SensitivityParameter, value: number): EconomicsResult {
  return calculateRetrofitEconomics({ ...context, [parameter.key]: value });
}

export function buildEconomicsSensitivity(
  context: EconomicsContext,
  parameters: SensitivityParameter[],
): SensitivityResult[] {
  return parameters
    .filter((parameter) => finite(parameter.baseValue) && finite(parameter.lowValue) && finite(parameter.highValue))
    .map((parameter) => {
      const low = vary(context, parameter, parameter.lowValue);
      const base = vary(context, parameter, parameter.baseValue);
      const high = vary(context, parameter, parameter.highValue);
      const npvs = [low.npvINR, high.npvINR].filter(finite);
      const paybacks = [low.simplePaybackYears, high.simplePaybackYears].filter(finite);
      return {
        parameter,
        low,
        base,
        high,
        npvRangeINR: npvs.length ? [Math.min(...npvs), Math.max(...npvs)] : [null, null],
        paybackRangeYears: paybacks.length ? [Math.min(...paybacks), Math.max(...paybacks)] : [null, null],
      };
    });
}

export function defaultEconomicsSensitivity(context: EconomicsContext): SensitivityParameter[] {
  const candidates: SensitivityParameter[] = [];
  const add = (key: keyof EconomicsContext, label: string, baseValue: number, lowValue: number, highValue: number, unit?: string) => {
    if (!finite(baseValue)) return;
    candidates.push({ key, label, baseValue, lowValue, highValue, unit });
  };

  add("annualSavingINR", "Annual saving", context.annualSavingINR, context.annualSavingINR * 0.8, context.annualSavingINR * 1.2, "INR/yr");
  add("capexINR", "CAPEX", context.capexINR, context.capexINR * 0.8, context.capexINR * 1.2, "INR");
  add("discountRate", "Discount rate", context.discountRate ?? 0.08, Math.max(-0.5, (context.discountRate ?? 0.08) - 0.02), (context.discountRate ?? 0.08) + 0.02, "%");
  add("escalationRate", "Energy escalation", context.escalationRate ?? 0, Math.max(-0.5, (context.escalationRate ?? 0) - 0.02), (context.escalationRate ?? 0) + 0.02, "%/yr");
  add("downtimeCostINRPerHour", "Downtime cost", context.downtimeCostINRPerHour ?? 0, Math.max(0, (context.downtimeCostINRPerHour ?? 0) * 0.8), (context.downtimeCostINRPerHour ?? 0) * 1.2, "INR/hr");
  return candidates;
}
