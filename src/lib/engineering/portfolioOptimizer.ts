export interface PortfolioOption {
  id: string;
  name: string;
  capexINR: number;
  annualSavingINR: number;
  annualEnergySavingKWh?: number;
  carbonSavingKgPerYear?: number;
  downtimeHours?: number;
  priorityWeight?: number;
}

export interface PortfolioConstraints {
  budgetINR?: number;
  maxDowntimeHours?: number;
  minAnnualSavingINR?: number;
  carbonTargetKgPerYear?: number;
  maxActions?: number;
}

export interface PortfolioResult {
  selected: PortfolioOption[];
  rejected: Array<{ option: PortfolioOption; reason: string }>;
  totalCapexINR: number;
  totalAnnualSavingINR: number;
  totalAnnualEnergySavingKWh: number;
  totalCarbonSavingKgPerYear: number;
  totalDowntimeHours: number;
  score: number;
  targetStatus: "met" | "shortfall" | "not-set";
  targetShortfall: string[];
}

const n = (value: number | undefined): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

const normalizedScore = (option: PortfolioOption): number => {
  const capex = Math.max(n(option.capexINR), 1);
  const savingIntensity = Math.max(n(option.annualSavingINR), 0) / capex;
  const carbonIntensity = Math.max(n(option.carbonSavingKgPerYear), 0) / capex;
  return (savingIntensity + carbonIntensity * 0.2) * Math.max(n(option.priorityWeight), 1);
};

type Totals = {
  capex: number;
  savings: number;
  energy: number;
  carbon: number;
  downtime: number;
};

function totals(options: PortfolioOption[]): Totals {
  return options.reduce<Totals>(
    (acc, option) => ({
      capex: acc.capex + Math.max(n(option.capexINR), 0),
      savings: acc.savings + n(option.annualSavingINR),
      energy: acc.energy + n(option.annualEnergySavingKWh),
      carbon: acc.carbon + n(option.carbonSavingKgPerYear),
      downtime: acc.downtime + Math.max(n(option.downtimeHours), 0),
    }),
    { capex: 0, savings: 0, energy: 0, carbon: 0, downtime: 0 },
  );
}

function satisfiesHardConstraints(selected: PortfolioOption[], c: PortfolioConstraints): boolean {
  const t = totals(selected);
  return (
    (c.budgetINR == null || t.capex <= c.budgetINR) &&
    (c.maxDowntimeHours == null || t.downtime <= c.maxDowntimeHours) &&
    (c.maxActions == null || selected.length <= c.maxActions)
  );
}

function meetsTargets(selected: PortfolioOption[], c: PortfolioConstraints): boolean {
  const t = totals(selected);
  return (
    (c.minAnnualSavingINR == null || t.savings >= c.minAnnualSavingINR) &&
    (c.carbonTargetKgPerYear == null || t.carbon >= c.carbonTargetKgPerYear)
  );
}

function objective(options: PortfolioOption[]): number {
  return options.reduce((sum, option) => sum + normalizedScore(option), 0);
}

function better(a: PortfolioOption[], b: PortfolioOption[], c: PortfolioConstraints): boolean {
  const at = totals(a);
  const bt = totals(b);
  const aTarget = meetsTargets(a, c);
  const bTarget = meetsTargets(b, c);

  if (aTarget !== bTarget) return aTarget;
  if (aTarget && bTarget) {
    if (at.savings !== bt.savings) return at.savings > bt.savings;
    if (at.carbon !== bt.carbon) return at.carbon > bt.carbon;
    if (at.capex !== bt.capex) return at.capex < bt.capex;
    return objective(a) > objective(b);
  }

  const savingGapA = c.minAnnualSavingINR == null ? 0 : Math.max(c.minAnnualSavingINR - at.savings, 0) / Math.max(c.minAnnualSavingINR, 1);
  const savingGapB = c.minAnnualSavingINR == null ? 0 : Math.max(c.minAnnualSavingINR - bt.savings, 0) / Math.max(c.minAnnualSavingINR, 1);
  const carbonGapA = c.carbonTargetKgPerYear == null ? 0 : Math.max(c.carbonTargetKgPerYear - at.carbon, 0) / Math.max(c.carbonTargetKgPerYear, 1);
  const carbonGapB = c.carbonTargetKgPerYear == null ? 0 : Math.max(c.carbonTargetKgPerYear - bt.carbon, 0) / Math.max(c.carbonTargetKgPerYear, 1);
  const gapA = savingGapA + carbonGapA;
  const gapB = savingGapB + carbonGapB;

  if (gapA !== gapB) return gapA < gapB;
  if (at.savings !== bt.savings) return at.savings > bt.savings;
  if (at.carbon !== bt.carbon) return at.carbon > bt.carbon;
  return objective(a) > objective(b);
}

function exhaustiveBest(options: PortfolioOption[], c: PortfolioConstraints): PortfolioOption[] | null {
  if (options.length > 20) return null;
  let best: PortfolioOption[] = [];
  const current: PortfolioOption[] = [];

  const walk = (index: number) => {
    if (index === options.length) {
      if (satisfiesHardConstraints(current, c) && better(current, best, c)) {
        best = [...current];
      }
      return;
    }

    walk(index + 1);
    current.push(options[index]);
    if (satisfiesHardConstraints(current, c)) walk(index + 1);
    current.pop();
  };

  walk(0);
  return best;
}

function greedyBest(options: PortfolioOption[], c: PortfolioConstraints): PortfolioOption[] {
  const selected: PortfolioOption[] = [];
  for (const option of [...options].sort((a, b) => normalizedScore(b) - normalizedScore(a))) {
    const candidate = [...selected, option];
    if (satisfiesHardConstraints(candidate, c) && better(candidate, selected, c)) {
      selected.push(option);
    }
  }
  return selected;
}

export function optimizeRetrofitPortfolio(options: PortfolioOption[], c: PortfolioConstraints = {}): PortfolioResult {
  const candidates = options.filter((option) => option.capexINR >= 0 && Number.isFinite(option.capexINR));
  const selected = exhaustiveBest(candidates, c) ?? greedyBest(candidates, c);
  const t = totals(selected);
  const selectedIds = new Set(selected.map((option) => option.id));

  const rejected = candidates
    .filter((option) => !selectedIds.has(option.id))
    .map((option) => {
      const candidate = [...selected, option];
      let reason = "lower portfolio objective";
      if (c.maxActions != null && selected.length >= c.maxActions) reason = "maximum actions reached";
      else if (c.budgetINR != null && totals(candidate).capex > c.budgetINR) reason = "budget constraint";
      else if (c.maxDowntimeHours != null && totals(candidate).downtime > c.maxDowntimeHours) reason = "downtime constraint";
      else if (!meetsTargets(candidate, c) && meetsTargets(selected, c)) reason = "would not improve a target-feasible portfolio";
      return { option, reason };
    });

  const shortfall: string[] = [];
  if (c.minAnnualSavingINR != null && t.savings < c.minAnnualSavingINR) {
    shortfall.push(`Annual saving shortfall: ₹${Math.round(c.minAnnualSavingINR - t.savings).toLocaleString("en-IN")}.`);
  }
  if (c.carbonTargetKgPerYear != null && t.carbon < c.carbonTargetKgPerYear) {
    shortfall.push(`Carbon saving shortfall: ${Math.round(c.carbonTargetKgPerYear - t.carbon).toLocaleString("en-IN")} kg/year.`);
  }

  const hasTargets = c.minAnnualSavingINR != null || c.carbonTargetKgPerYear != null;
  return {
    selected,
    rejected,
    totalCapexINR: t.capex,
    totalAnnualSavingINR: t.savings,
    totalAnnualEnergySavingKWh: t.energy,
    totalCarbonSavingKgPerYear: t.carbon,
    totalDowntimeHours: t.downtime,
    score: objective(selected),
    targetStatus: !hasTargets ? "not-set" : shortfall.length ? "shortfall" : "met",
    targetShortfall: shortfall,
  };
}
