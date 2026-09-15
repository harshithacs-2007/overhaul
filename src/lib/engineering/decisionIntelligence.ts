import type { InterventionSimulation } from "./interventionEngine";

export type DecisionObjective =
  | "annual_cost"
  | "energy"
  | "carbon"
  | "capex"
  | "comfort"
  | "reliability"
  | "downtime";

export interface DecisionCandidate {
  id: string;
  label: string;
  simulation: InterventionSimulation;
  assumptions: string[];
  evidenceCompleteness: number;
}

export interface DecisionWeight {
  objective: DecisionObjective;
  weight: number;
}

export interface DecisionIntelligenceResult {
  ranked: Array<{
    candidate: DecisionCandidate;
    score: number;
    robustWinRate: number;
    regretINR: number;
    why: string[];
    whyNot: string[];
  }>;
  recommendation: string | null;
  blockedReasons: string[];
}

function finite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Ranks retrofit alternatives without inventing unsupported engineering values.
 * Missing economics/engineering outputs reduce decision confidence instead of being
 * silently replaced with fabricated numbers.
 */
export function rankDecisionCandidates(
  candidates: DecisionCandidate[],
  weights: DecisionWeight[],
): DecisionIntelligenceResult {
  const blockedReasons: string[] = [];
  if (!candidates.length) {
    return { ranked: [], recommendation: null, blockedReasons: ["No decision candidates are available."] };
  }

  const totalWeight = weights.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  if (totalWeight <= 0) {
    return {
      ranked: [],
      recommendation: null,
      blockedReasons: ["Decision objectives have no positive weights."],
    };
  }

  const baseline = candidates[0].simulation;
  const baselineCost = finite(baseline.economics?.annualOperatingCostINR);
  const baselineEnergy = finite(baseline.annualEnergyKWh);
  const baselineCarbon = finite(baseline.annualCarbonKgCO2e);

  if (baselineCost === null && baselineEnergy === null && baselineCarbon === null) {
    blockedReasons.push("No supported baseline outcome is available for comparative ranking.");
  }

  const values = candidates.map((candidate) => ({
    candidate,
    cost: finite(candidate.simulation.economics?.annualOperatingCostINR),
    energy: finite(candidate.simulation.annualEnergyKWh),
    carbon: finite(candidate.simulation.annualCarbonKgCO2e),
    capex: finite(candidate.simulation.economics?.capexINR),
    comfort: finite(candidate.simulation.comfortScore),
    reliability: finite(candidate.simulation.reliabilityScore),
    downtime: finite(candidate.simulation.downtimeHours),
  }));

  const scored = values.map((item) => {
    let weighted = 0;
    let availableWeight = 0;
    const why: string[] = [];
    const whyNot: string[] = [];

    for (const objective of weights) {
      const weight = Math.max(0, objective.weight);
      if (!weight) continue;

      const value =
        objective.objective === "annual_cost" ? item.cost :
        objective.objective === "energy" ? item.energy :
        objective.objective === "carbon" ? item.carbon :
        objective.objective === "capex" ? item.capex :
        objective.objective === "comfort" ? item.comfort :
        objective.objective === "reliability" ? item.reliability :
        item.downtime;

      if (value === null) continue;
      availableWeight += weight;

      const peers = values
        .map((peer) =>
          objective.objective === "annual_cost" ? peer.cost :
          objective.objective === "energy" ? peer.energy :
          objective.objective === "carbon" ? peer.carbon :
          objective.objective === "capex" ? peer.capex :
          objective.objective === "comfort" ? peer.comfort :
          objective.objective === "reliability" ? peer.reliability :
          peer.downtime,
        )
        .filter((peer): peer is number => peer !== null);

      if (!peers.length) continue;
      const min = Math.min(...peers);
      const max = Math.max(...peers);
      const normalized = max === min ? 1 : (max - value) / (max - min);
      const benefit = objective.objective === "comfort" || objective.objective === "reliability"
        ? (value - min) / (max - min || 1)
        : normalized;

      weighted += clamp(benefit) * weight;
    }

    const score = availableWeight ? weighted / availableWeight : 0;
    const completeness = clamp(item.candidate.evidenceCompleteness);
    const finalScore = score * (0.7 + 0.3 * completeness);

    if (baselineCost !== null && item.cost !== null && item.cost < baselineCost) {
      why.push(`Lower modeled annual operating cost (${item.cost.toLocaleString("en-IN")} INR/year).`);
    }
    if (baselineEnergy !== null && item.energy !== null && item.energy < baselineEnergy) {
      why.push("Lower modeled annual energy use than the baseline candidate.");
    }
    if (baselineCarbon !== null && item.carbon !== null && item.carbon < baselineCarbon) {
      why.push("Lower modeled operational carbon than the baseline candidate.");
    }
    if (item.candidate.evidenceCompleteness < 0.7) {
      whyNot.push("Decision evidence is incomplete; ranking should be treated as provisional.");
    }
    if (item.capex === null) {
      whyNot.push("CAPEX is not supported by supplied evidence, so financial ranking is incomplete.");
    }

    return { ...item, score: finalScore, why, whyNot };
  });

  const ranked = scored
    .map((item) => {
      const better = scored.filter((peer) => peer.score > item.score).length;
      const robustWinRate = clamp((scored.length - better) / Math.max(1, scored.length));
      const candidateCost = item.cost ?? baselineCost;
      const regretINR = candidateCost !== null && baselineCost !== null
        ? Math.max(0, candidateCost - baselineCost)
        : 0;
      return {
        candidate: item.candidate,
        score: item.score,
        robustWinRate,
        regretINR,
        why: item.why,
        whyNot: item.whyNot,
      };
    })
    .sort((a, b) => b.score - a.score);

  const top = ranked[0];
  const recommendation = blockedReasons.length
    ? null
    : top
      ? `Prefer ${top.candidate.label} under the stated objectives, subject to the listed evidence and uncertainty limits.`
      : null;

  return { ranked, recommendation, blockedReasons };
}
