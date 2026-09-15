/**
 * Decision layer for retrofit selection.
 *
 * This module deliberately does not invent physical performance. Callers must
 * provide scenario results that were already calculated by a physics/reference
 * model. The decision layer evaluates those results across stated uncertainty
 * ranges and exposes why an option wins or loses.
 */

export type DecisionPriority = "balanced" | "cost" | "energy" | "carbon" | "reliability" | "comfort";

export interface DecisionScenario {
  id: string;
  name: string;
  capexINR: number | null;
  annualEnergySavingKWh: number | null;
  annualCostSavingINR: number | null;
  annualCarbonReductionKg: number | null;
  downtimeHours: number | null;
  reliabilityScore: number | null;
  comfortScore: number | null;
  feasible: boolean;
  blockedBy: string[];
}

export interface DecisionWeights {
  capex: number;
  energy: number;
  carbon: number;
  downtime: number;
  reliability: number;
  comfort: number;
}

export interface UncertaintyRange {
  parameter: string;
  min: number;
  max: number;
  unit?: string;
}

export interface DecisionEvaluation {
  scenarioId: string;
  score: number | null;
  robustnessPercent: number | null;
  winCount: number;
  testedCases: number;
  status: "recommended" | "contender" | "rejected" | "blocked";
  reasons: string[];
  whyNot: string[];
}

export interface DecisionResult {
  recommendation: DecisionEvaluation | null;
  evaluations: DecisionEvaluation[];
  counterfactual: {
    doNothingScenarioId: string | null;
    bestActionScenarioId: string | null;
    avoidedCostINR: number | null;
  };
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const finite = (value: number | null): value is number => typeof value === "number" && Number.isFinite(value);

function normalizePositive(value: number | null, maximum: number): number {
  if (!finite(value) || maximum <= 0) return 0;
  return clamp01(value / maximum);
}

function scoreScenario(
  scenario: DecisionScenario,
  weights: DecisionWeights,
  reference: {
    maxCapex: number;
    maxEnergySaving: number;
    maxCarbonReduction: number;
    maxDowntime: number;
  },
): number | null {
  if (!scenario.feasible) return null;

  const available = [
    finite(scenario.capexINR),
    finite(scenario.annualEnergySavingKWh),
    finite(scenario.annualCarbonReductionKg),
    finite(scenario.downtimeHours),
    finite(scenario.reliabilityScore),
    finite(scenario.comfortScore),
  ].filter(Boolean).length;

  if (!available) return null;

  const capex = finite(scenario.capexINR)
    ? 1 - normalizePositive(scenario.capexINR, reference.maxCapex)
    : 0;
  const energy = normalizePositive(scenario.annualEnergySavingKWh, reference.maxEnergySaving);
  const carbon = normalizePositive(scenario.annualCarbonReductionKg, reference.maxCarbonReduction);
  const downtime = finite(scenario.downtimeHours)
    ? 1 - normalizePositive(scenario.downtimeHours, reference.maxDowntime)
    : 0;
  const reliability = finite(scenario.reliabilityScore) ? clamp01(scenario.reliabilityScore) : 0;
  const comfort = finite(scenario.comfortScore) ? clamp01(scenario.comfortScore) : 0;

  const weighted = [
    [capex, weights.capex, finite(scenario.capexINR)],
    [energy, weights.energy, finite(scenario.annualEnergySavingKWh)],
    [carbon, weights.carbon, finite(scenario.annualCarbonReductionKg)],
    [downtime, weights.downtime, finite(scenario.downtimeHours)],
    [reliability, weights.reliability, finite(scenario.reliabilityScore)],
    [comfort, weights.comfort, finite(scenario.comfortScore)],
  ] as const;

  const totalWeight = weighted.reduce((sum, [, weight, present]) => sum + (present ? weight : 0), 0);
  if (totalWeight <= 0) return null;

  return weighted.reduce((sum, [value, weight, present]) => sum + (present ? value * weight : 0), 0) / totalWeight;
}

function rangesProduct(ranges: UncertaintyRange[], limit = 256): number[][] {
  if (!ranges.length) return [[]];
  const values = ranges.map((range) => [range.min, (range.min + range.max) / 2, range.max]);
  const output: number[][] = [[]];
  for (const candidates of values) {
    const next: number[][] = [];
    for (const prefix of output) {
      for (const value of candidates) {
        if (next.length >= limit) break;
        next.push([...prefix, value]);
      }
      if (next.length >= limit) break;
    }
    output.splice(0, output.length, ...next);
  }
  return output;
}

/**
 * Evaluate fixed scenario results and robustness under parameter uncertainty.
 * `perturb` is supplied by the physics/economics layer and must recalculate a
 * scenario rather than simply scaling its score.
 */
export function evaluateRetrofitDecision(input: {
  scenarios: DecisionScenario[];
  weights: DecisionWeights;
  uncertainty?: UncertaintyRange[];
  perturb?: (scenario: DecisionScenario, values: Record<string, number>) => DecisionScenario;
  doNothingScenarioId?: string;
}): DecisionResult {
  const feasible = input.scenarios.filter((scenario) => scenario.feasible);
  if (!feasible.length) {
    return {
      recommendation: null,
      evaluations: input.scenarios.map((scenario) => ({
        scenarioId: scenario.id,
        score: null,
        robustnessPercent: null,
        winCount: 0,
        testedCases: 0,
        status: "blocked",
        reasons: ["No feasible engineering scenario is currently available."],
        whyNot: scenario.blockedBy,
      })),
      counterfactual: { doNothingScenarioId: input.doNothingScenarioId ?? null, bestActionScenarioId: null, avoidedCostINR: null },
    };
  }

  const maxCapex = Math.max(...feasible.map((scenario) => finite(scenario.capexINR) ? scenario.capexINR : 0), 1);
  const maxEnergySaving = Math.max(...feasible.map((scenario) => finite(scenario.annualEnergySavingKWh) ? Math.max(scenario.annualEnergySavingKWh, 0) : 0), 1);
  const maxCarbonReduction = Math.max(...feasible.map((scenario) => finite(scenario.annualCarbonReductionKg) ? Math.max(scenario.annualCarbonReductionKg, 0) : 0), 1);
  const maxDowntime = Math.max(...feasible.map((scenario) => finite(scenario.downtimeHours) ? Math.max(scenario.downtimeHours, 0) : 0), 1);
  const reference = { maxCapex, maxEnergySaving, maxCarbonReduction, maxDowntime };

  const baseScores = new Map(feasible.map((scenario) => [scenario.id, scoreScenario(scenario, input.weights, reference)]));
  const baseRanking = [...feasible].sort((a, b) => (baseScores.get(b.id) ?? -1) - (baseScores.get(a.id) ?? -1));
  const baseWinner = baseRanking[0] ?? null;

  const cases = rangesProduct(input.uncertainty ?? []);
  const wins = new Map(feasible.map((scenario) => [scenario.id, 0]));
  const perturbationValues = input.uncertainty ?? [];

  for (const values of cases) {
    const byId = new Map<string, number | null>();
    for (const scenario of feasible) {
      const record: Record<string, number> = {};
      perturbationValues.forEach((range, index) => { record[range.parameter] = values[index]; });
      const evaluated = input.perturb ? input.perturb(scenario, record) : scenario;
      byId.set(evaluated.id, scoreScenario(evaluated, input.weights, reference));
    }
    const winner = [...byId.entries()]
      .filter(([, value]) => value != null)
      .sort((a, b) => (b[1] as number) - (a[1] as number))[0]?.[0];
    if (winner) wins.set(winner, (wins.get(winner) ?? 0) + 1);
  }

  const testedCases = Math.max(cases.length, 1);
  const evaluations = input.scenarios.map((scenario) => {
    if (!scenario.feasible) {
      return {
        scenarioId: scenario.id,
        score: null,
        robustnessPercent: 0,
        winCount: 0,
        testedCases: 0,
        status: "blocked" as const,
        reasons: ["Scenario is not feasible with the current evidence and constraints."],
        whyNot: scenario.blockedBy,
      };
    }

    const score = baseScores.get(scenario.id) ?? null;
    const robustnessPercent = Math.round(((wins.get(scenario.id) ?? 0) / testedCases) * 100);
    const reasons: string[] = [];
    const whyNot: string[] = [];

    if (scenario.id === baseWinner?.id) reasons.push("Highest weighted decision score under the current evidence.");
    if (robustnessPercent >= 80) reasons.push(`Remains the leading option in ${robustnessPercent}% of tested uncertainty cases.`);
    else if (robustnessPercent > 0) reasons.push(`Leads in ${robustnessPercent}% of tested uncertainty cases.`);

    if (finite(scenario.capexINR) && scenario.capexINR > maxCapex * 0.75) whyNot.push("Higher capital exposure than at least one feasible alternative.");
    if (finite(scenario.downtimeHours) && scenario.downtimeHours > maxDowntime * 0.75) whyNot.push("Higher implementation downtime exposure.");
    if (finite(scenario.annualEnergySavingKWh) && scenario.annualEnergySavingKWh <= 0) whyNot.push("No modeled annual energy reduction.");
    if (!whyNot.length && scenario.id !== baseWinner?.id) whyNot.push("Lower overall weighted decision score than the selected contender.");

    return {
      scenarioId: scenario.id,
      score,
      robustnessPercent,
      winCount: wins.get(scenario.id) ?? 0,
      testedCases,
      status: scenario.id === baseWinner?.id ? "recommended" as const : "contender" as const,
      reasons,
      whyNot,
    };
  });

  const bestAction = baseWinner;
  const doNothing = input.scenarios.find((scenario) => scenario.id === input.doNothingScenarioId);
  const avoidedCostINR = doNothing && bestAction && finite(doNothing.capexINR) && finite(bestAction.capexINR)
    ? Math.max(doNothing.capexINR - bestAction.capexINR, 0)
    : null;

  return {
    recommendation: evaluations.find((evaluation) => evaluation.scenarioId === bestAction?.id) ?? null,
    evaluations,
    counterfactual: {
      doNothingScenarioId: doNothing?.id ?? input.doNothingScenarioId ?? null,
      bestActionScenarioId: bestAction?.id ?? null,
      avoidedCostINR,
    },
  };
}
