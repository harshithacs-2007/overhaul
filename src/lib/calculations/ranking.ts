/**
 * Ranking engine — Stage 4. Protect this above all else.
 * Deterministic scoring only — no ML.
 */

import { priorityScore, type HVACRecommendation } from "./hvac";
import type { OccupancyProfile } from "./savings";

export type ReportedIssue =
  | "uneven_temp"
  | "high_bills"
  | "frequent_cycling"
  | "poor_airflow";

export type ActionCategory =
  | "envelope_wall"
  | "envelope_roof"
  | "envelope_window"
  | "hvac_replace"
  | "hvac_downsize"
  | "zoning"
  | "ventilation";

export interface RetrofitAction {
  id: string;
  category: ActionCategory;
  title: string;
  description: string;
  costINR: number;
  carbonSavedKgCO2e: number;
  loadReductionKW: number;
  annualKWhSaved: number;
  annualCostSavedINR: number;
  paybackYears: number | null;
  carbonPaybackYears: number | null;
  isNetPositive: boolean | null;
  carbonFlag: string | null;
  comfortImpact: string;
  maintenanceImpact: string;
  efficiencyLossPct?: number;
  maintenanceRisk?: string;
  baseScore: number;
  issueBoost: number;
  finalScore: number;
  whyRankedHere: string;
  formulas: string[];
}

export interface RankedPlan {
  actions: RetrofitAction[];
  hvacVerdict: HVACRecommendation;
  issueWeightNotes: string[];
}

/**
 * Issue weighting:
 * uneven_temp → boost zoning
 * frequent_cycling → boost hvac
 * poor_airflow → boost ventilation
 * high_bills → small boost to all
 */
export function applyIssueWeighting(
  actions: RetrofitAction[],
  reportedIssues: ReportedIssue[]
): { actions: RetrofitAction[]; notes: string[] } {
  const notes: string[] = [];
  const issues = new Set(reportedIssues);

  const boosted = actions.map((action) => {
    let boost = 0;
    const reasons: string[] = [];

    if (issues.has("high_bills")) {
      boost += 0.1;
      reasons.push("high bills (+0.1 all)");
    }
    if (issues.has("uneven_temp") && action.category === "zoning") {
      boost += 0.35;
      reasons.push("uneven temp → zoning boost");
    }
    if (
      issues.has("frequent_cycling") &&
      (action.category === "hvac_replace" || action.category === "hvac_downsize")
    ) {
      boost += 0.35;
      reasons.push("frequent cycling → HVAC boost");
    }
    if (issues.has("poor_airflow") && action.category === "ventilation") {
      boost += 0.35;
      reasons.push("poor airflow → ventilation boost");
    }

    if (reasons.length) {
      notes.push(`${action.id}: ${reasons.join("; ")}`);
    }

    return {
      ...action,
      issueBoost: boost,
      finalScore: action.baseScore * (1 + boost),
    };
  });

  return { actions: boosted, notes };
}

function scoreEnvelope(action: {
  carbonSavedKgCO2e: number;
  loadReductionKW: number;
  costINR: number;
}): number {
  if (action.costINR <= 0) return 0;
  return (action.carbonSavedKgCO2e + action.loadReductionKW * 100) / action.costINR;
}

/**
 * rankActions: score envelope by (carbonSaved + loadReduction) / cost;
 * score HVAC by priority (high=3, medium=2, low=1);
 * apply issue weighting; sort descending; attach why-ranked string.
 */
export function rankActions(
  envelopeActions: Omit<
    RetrofitAction,
    "baseScore" | "issueBoost" | "finalScore" | "whyRankedHere"
  >[],
  hvacVerdict: HVACRecommendation,
  reportedIssues: ReportedIssue[],
  hvacActions: Omit<
    RetrofitAction,
    "baseScore" | "issueBoost" | "finalScore" | "whyRankedHere"
  >[] = []
): RankedPlan {
  try {
    const scoredEnvelope: RetrofitAction[] = envelopeActions.map((a) => {
      const baseScore = scoreEnvelope(a);
      return {
        ...a,
        baseScore,
        issueBoost: 0,
        finalScore: baseScore,
        whyRankedHere: "",
      };
    });

    const hvacPriority = priorityScore(hvacVerdict.priority);
    const scoredHvac: RetrofitAction[] = hvacActions.map((a) => {
      // Normalize HVAC priority into comparable score band
      const baseScore = hvacPriority * 0.002 + scoreEnvelope(a) * 0.5;
      return {
        ...a,
        baseScore,
        issueBoost: 0,
        finalScore: baseScore,
        whyRankedHere: "",
        efficiencyLossPct: hvacVerdict.efficiencyLossPct,
        maintenanceRisk: hvacVerdict.maintenanceRisk,
      };
    });

    const combined = [...scoredEnvelope, ...scoredHvac];
    const { actions: weighted, notes } = applyIssueWeighting(
      combined,
      reportedIssues
    );

    const sorted = [...weighted].sort((a, b) => b.finalScore - a.finalScore);

    const withWhy = sorted.map((action, index) => {
      const rank = index + 1;
      const parts: string[] = [];
      parts.push(
        `Rank #${rank}: score ${(action.finalScore * 1000).toFixed(2)} from (carbonSaved + loadReduction×100) / cost`
      );
      if (action.issueBoost > 0) {
        parts.push(
          `issue weighting +${(action.issueBoost * 100).toFixed(0)}% applied`
        );
      }
      if (action.category.startsWith("hvac") || action.category === "zoning") {
        parts.push(`HVAC verdict “${hvacVerdict.verdict}” priority=${hvacVerdict.priority}`);
      }
      if (rank === 1) {
        parts.push("Highest combined impact-per-rupee after issue weighting");
      }
      return {
        ...action,
        whyRankedHere: parts.join(". ") + ".",
      };
    });

    return {
      actions: withWhy,
      hvacVerdict,
      issueWeightNotes: notes,
    };
  } catch (err) {
    throw new Error(
      `rankActions failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export function occupancyFromBuildingType(
  buildingType: OccupancyProfile
): OccupancyProfile {
  return buildingType;
}
