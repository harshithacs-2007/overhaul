/**
 * Decision layer for retrofit selection.
 *
 * Physical outcomes must already be calculated by a physics/reference model.
 * The counterfactual is retained for comparison, but it cannot outrank a
 * supported action merely because doing nothing has zero CAPEX or downtime.
 */

export type DecisionPriority = "balanced" | "cost" | "energy" | "carbon" | "reliability" | "comfort";
export interface DecisionScenario { id: string; name: string; capexINR: number | null; annualEnergySavingKWh: number | null; annualCostSavingINR: number | null; annualCarbonReductionKg: number | null; downtimeHours: number | null; reliabilityScore: number | null; comfortScore: number | null; feasible: boolean; blockedBy: string[]; }
export interface DecisionWeights { capex: number; energy: number; carbon: number; downtime: number; reliability: number; comfort: number; }
export interface UncertaintyRange { parameter: string; min: number; max: number; unit?: string; }
export interface DecisionEvaluation { scenarioId: string; score: number | null; robustnessPercent: number | null; winCount: number; testedCases: number; status: "recommended" | "contender" | "rejected" | "blocked"; reasons: string[]; whyNot: string[]; }
export interface DecisionResult { recommendation: DecisionEvaluation | null; evaluations: DecisionEvaluation[]; counterfactual: { doNothingScenarioId: string | null; bestActionScenarioId: string | null; avoidedCostINR: number | null; }; }

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const finite = (value: number | null): value is number => typeof value === "number" && Number.isFinite(value);
function normalizePositive(value: number | null, maximum: number) { if (!finite(value) || maximum <= 0) return 0; return clamp01(value / maximum); }
function scoreScenario(s: DecisionScenario, w: DecisionWeights, ref: { maxCapex: number; maxEnergySaving: number; maxCarbonReduction: number; maxDowntime: number }) {
  if (!s.feasible) return null;
  const weighted = [
    [finite(s.capexINR) ? 1 - normalizePositive(s.capexINR, ref.maxCapex) : 0, w.capex, finite(s.capexINR)],
    [normalizePositive(s.annualEnergySavingKWh, ref.maxEnergySaving), w.energy, finite(s.annualEnergySavingKWh)],
    [normalizePositive(s.annualCarbonReductionKg, ref.maxCarbonReduction), w.carbon, finite(s.annualCarbonReductionKg)],
    [finite(s.downtimeHours) ? 1 - normalizePositive(s.downtimeHours, ref.maxDowntime) : 0, w.downtime, finite(s.downtimeHours)],
    [finite(s.reliabilityScore) ? clamp01(s.reliabilityScore) : 0, w.reliability, finite(s.reliabilityScore)],
    [finite(s.comfortScore) ? clamp01(s.comfortScore) : 0, w.comfort, finite(s.comfortScore)],
  ] as const;
  const totalWeight = weighted.reduce((sum, [, weight, present]) => sum + (present ? weight : 0), 0);
  if (totalWeight <= 0) return null;
  return weighted.reduce((sum, [value, weight, present]) => sum + (present ? value * weight : 0), 0) / totalWeight;
}
function rangesProduct(ranges: UncertaintyRange[], limit = 256): number[][] {
  if (!ranges.length) return [[]];
  const values = ranges.map((r) => [r.min, (r.min + r.max) / 2, r.max]); const out: number[][] = [[]];
  for (const candidates of values) { const next: number[][] = []; for (const prefix of out) for (const value of candidates) { if (next.length >= limit) break; next.push([...prefix, value]); } out.splice(0, out.length, ...next); }
  return out;
}

export function evaluateRetrofitDecision(input: { scenarios: DecisionScenario[]; weights: DecisionWeights; uncertainty?: UncertaintyRange[]; perturb?: (scenario: DecisionScenario, values: Record<string, number>) => DecisionScenario; doNothingScenarioId?: string; }): DecisionResult {
  const feasible = input.scenarios.filter((scenario) => scenario.feasible);
  if (!feasible.length) return {
    recommendation: null,
    evaluations: input.scenarios.map((scenario) => ({ scenarioId: scenario.id, score: null, robustnessPercent: null, winCount: 0, testedCases: 0, status: "blocked", reasons: ["No feasible engineering scenario is currently available."], whyNot: scenario.blockedBy })),
    counterfactual: { doNothingScenarioId: input.doNothingScenarioId ?? null, bestActionScenarioId: null, avoidedCostINR: null },
  };

  const maxCapex = Math.max(...feasible.map((s) => finite(s.capexINR) ? s.capexINR : 0), 1);
  const maxEnergySaving = Math.max(...feasible.map((s) => finite(s.annualEnergySavingKWh) ? Math.max(s.annualEnergySavingKWh, 0) : 0), 1);
  const maxCarbonReduction = Math.max(...feasible.map((s) => finite(s.annualCarbonReductionKg) ? Math.max(s.annualCarbonReductionKg, 0) : 0), 1);
  const maxDowntime = Math.max(...feasible.map((s) => finite(s.downtimeHours) ? Math.max(s.downtimeHours, 0) : 0), 1);
  const reference = { maxCapex, maxEnergySaving, maxCarbonReduction, maxDowntime };
  const doNothingId = input.doNothingScenarioId;
  const actionScenarios = feasible.filter((s) => s.id !== doNothingId);
  const rankPool = actionScenarios.length ? actionScenarios : feasible;
  const baseScores = new Map(feasible.map((s) => [s.id, scoreScenario(s, input.weights, reference)]));
  const baseWinner = [...rankPool].sort((a, b) => (baseScores.get(b.id) ?? -1) - (baseScores.get(a.id) ?? -1))[0] ?? null;

  const cases = rangesProduct(input.uncertainty ?? []);
  const winEligible = new Map(rankPool.map((s) => [s.id, 0]));
  const ranges = input.uncertainty ?? [];
  for (const values of cases) {
    const scored = rankPool.map((scenario) => { const record: Record<string, number> = {}; ranges.forEach((range, index) => { record[range.parameter] = values[index]; }); const evaluated = input.perturb ? input.perturb(scenario, record) : scenario; return [evaluated.id, scoreScenario(evaluated, input.weights, reference)] as const; }).filter(([, score]) => score != null);
    const winner = scored.sort((a, b) => (b[1] as number) - (a[1] as number))[0]?.[0];
    if (winner) winEligible.set(winner, (winEligible.get(winner) ?? 0) + 1);
  }
  const testedCases = Math.max(cases.length, 1);
  const evaluations = input.scenarios.map((scenario) => {
    if (!scenario.feasible) return { scenarioId: scenario.id, score: null, robustnessPercent: 0, winCount: 0, testedCases: 0, status: "blocked" as const, reasons: ["Scenario is not feasible with the current evidence and constraints."], whyNot: scenario.blockedBy };
    const score = baseScores.get(scenario.id) ?? null;
    const wins = winEligible.get(scenario.id) ?? 0;
    const robustnessPercent = Math.round((wins / testedCases) * 100);
    const reasons: string[] = []; const whyNot: string[] = [];
    if (scenario.id === baseWinner?.id) reasons.push("Highest weighted decision score among supported retrofit actions.");
    if (robustnessPercent >= 80) reasons.push(`Leads in ${robustnessPercent}% of tested uncertainty cases.`);
    if (scenario.id === doNothingId && baseWinner && baseWinner.id !== scenario.id) whyNot.push("Counterfactual is retained for comparison, not selected over a supported action.");
    if (finite(scenario.capexINR) && scenario.capexINR > maxCapex * 0.75) whyNot.push("Higher capital exposure than at least one feasible alternative.");
    if (finite(scenario.downtimeHours) && scenario.downtimeHours > maxDowntime * 0.75) whyNot.push("Higher implementation downtime exposure.");
    if (finite(scenario.annualEnergySavingKWh) && scenario.annualEnergySavingKWh <= 0 && scenario.id !== doNothingId) whyNot.push("No modeled annual energy reduction.");
    if (!whyNot.length && scenario.id !== baseWinner?.id && scenario.id !== doNothingId) whyNot.push("Lower overall weighted decision score than the selected contender.");
    return { scenarioId: scenario.id, score, robustnessPercent, winCount: wins, testedCases, status: scenario.id === baseWinner?.id ? "recommended" as const : scenario.id === doNothingId ? "rejected" as const : "contender" as const, reasons, whyNot };
  });
  const doNothing = input.scenarios.find((s) => s.id === doNothingId);
  const avoidedCostINR = doNothing && baseWinner && finite(doNothing.capexINR) && finite(baseWinner.capexINR) ? Math.max(doNothing.capexINR - baseWinner.capexINR, 0) : null;
  return { recommendation: evaluations.find((e) => e.scenarioId === baseWinner?.id) ?? null, evaluations, counterfactual: { doNothingScenarioId: doNothing?.id ?? doNothingId ?? null, bestActionScenarioId: baseWinner?.id ?? null, avoidedCostINR } };
}
