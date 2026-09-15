/** Deterministic retrofit economics. No financial value is invented when a required input is absent. */
export interface EconomicsContext {
  capexINR: number;
  annualSavingINR: number;
  annualMaintenanceDeltaINR?: number;
  annualEnergySavingKWh?: number;
  escalationRate?: number;
  discountRate?: number;
  analysisYears?: number;
  tariffINRPerKWh?: number;
  downtimeHours?: number;
  downtimeCostINRPerHour?: number;
  avoidedFailureINRPerYear?: number;
}

export interface EconomicsResult {
  status: "calculated" | "insufficient-evidence" | "invalid";
  capexINR: number | null;
  firstYearNetSavingINR: number | null;
  simplePaybackYears: number | null;
  npvINR: number | null;
  irrPercent: number | null;
  lifecycleCostDeltaINR: number | null;
  annualEnergySavingKWh: number | null;
  implementationCostINR: number | null;
  missingInputs: string[];
  assumptions: string[];
}

function finite(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nonNegative(value: number | undefined): value is number {
  return finite(value) && value >= 0;
}

function cashFlow(context: EconomicsContext): number[] {
  const years = Math.floor(context.analysisYears ?? 10);
  const escalation = context.escalationRate ?? 0;
  const maintenance = context.annualMaintenanceDeltaINR ?? 0;
  const failure = context.avoidedFailureINRPerYear ?? 0;
  const downtime = (context.downtimeHours ?? 0) * (context.downtimeCostINRPerHour ?? 0);
  const yearly = [] as number[];
  for (let year = 1; year <= years; year += 1) {
    const escalatedSaving = context.annualSavingINR * (1 + escalation) ** (year - 1);
    yearly.push(escalatedSaving - maintenance + failure);
  }
  if (yearly.length) yearly[0] -= downtime;
  return [-context.capexINR, ...yearly];
}

function npv(rate: number, flows: number[]): number {
  return flows.reduce((sum, flow, index) => sum + flow / (1 + rate) ** index, 0);
}

function irr(flows: number[]): number | null {
  if (flows.length < 2 || flows[0] >= 0) return null;
  let low = -0.99;
  let high = 5;
  let fLow = npv(low, flows);
  let fHigh = npv(high, flows);
  if (!Number.isFinite(fLow) || !Number.isFinite(fHigh) || fLow * fHigh > 0) return null;
  for (let i = 0; i < 100; i += 1) {
    const mid = (low + high) / 2;
    const fMid = npv(mid, flows);
    if (!Number.isFinite(fMid)) return null;
    if (Math.abs(fMid) < 1e-6) return mid;
    if (fLow * fMid <= 0) {
      high = mid;
      fHigh = fMid;
    } else {
      low = mid;
      fLow = fMid;
    }
  }
  return (low + high) / 2;
}

export function calculateRetrofitEconomics(context: EconomicsContext): EconomicsResult {
  const required: Array<[keyof EconomicsContext, boolean]> = [
    ["capexINR", nonNegative(context.capexINR)],
    ["annualSavingINR", finite(context.annualSavingINR)],
    ["analysisYears", nonNegative(context.analysisYears)],
  ];
  const missingInputs = required.filter(([, ok]) => !ok).map(([key]) => String(key));
  if (missingInputs.length) {
    return {
      status: "insufficient-evidence",
      capexINR: null,
      firstYearNetSavingINR: null,
      simplePaybackYears: null,
      npvINR: null,
      irrPercent: null,
      lifecycleCostDeltaINR: null,
      annualEnergySavingKWh: null,
      implementationCostINR: null,
      missingInputs,
      assumptions: ["Financial outputs remain gated until the investment and analysis horizon are known."],
    };
  }
  if ((context.discountRate ?? 0) <= -1 || (context.escalationRate ?? 0) <= -1) {
    return {
      status: "invalid",
      capexINR: null,
      firstYearNetSavingINR: null,
      simplePaybackYears: null,
      npvINR: null,
      irrPercent: null,
      lifecycleCostDeltaINR: null,
      annualEnergySavingKWh: null,
      implementationCostINR: null,
      missingInputs: ["discountRate/escalationRate"],
      assumptions: ["Rates below -100% are invalid."],
    };
  }

  const maintenance = context.annualMaintenanceDeltaINR ?? 0;
  const failure = context.avoidedFailureINRPerYear ?? 0;
  const downtime = (context.downtimeHours ?? 0) * (context.downtimeCostINRPerHour ?? 0);
  const firstYearNetSavingINR = context.annualSavingINR - maintenance + failure - downtime;
  const simplePaybackYears = firstYearNetSavingINR > 0 ? context.capexINR / firstYearNetSavingINR : null;
  const flows = cashFlow(context);
  const discount = context.discountRate ?? 0.08;
  const npvINR = npv(discount, flows);
  const irrValue = irr(flows);
  const lifecycleCostDeltaINR = -npvINR;

  return {
    status: "calculated",
    capexINR: context.capexINR,
    firstYearNetSavingINR,
    simplePaybackYears,
    npvINR,
    irrPercent: irrValue == null ? null : irrValue * 100,
    lifecycleCostDeltaINR,
    annualEnergySavingKWh: context.annualEnergySavingKWh ?? null,
    implementationCostINR: context.capexINR + downtime,
    missingInputs: [],
    assumptions: [
      `Analysis horizon: ${Math.floor(context.analysisYears ?? 10)} years.`,
      `Discount rate: ${((context.discountRate ?? 0.08) * 100).toFixed(1)}%.`,
      `Energy/tariff escalation: ${((context.escalationRate ?? 0) * 100).toFixed(1)}%/yr.`,
      "No residual value, tax, financing cost, or inflation adjustment is included unless explicitly supplied.",
    ],
  };
}
