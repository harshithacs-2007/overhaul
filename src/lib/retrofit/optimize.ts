/**
 * Deterministic optimizer — only ranks candidates with real physics deltas.
 * Cost/carbon shown as Unknown unless real data exists (none fabricated).
 */

import type { EngineeringReadyModel } from "@/lib/engineering/model";
import { engineeringModelToPhysicsInput } from "@/lib/physics/fromModel";
import { runPhysics } from "@/lib/physics/run";
import {
  applyModifications,
  createBaselineScenario,
  createScenarioFrom,
  simulateScenario,
  type RetrofitScenario,
  type ScenarioModification,
} from "./scenarios";

export type OptimizeObjective = "energy" | "balanced";

export interface RankedRetrofitAction {
  id: string;
  title: string;
  category: "envelope" | "hvac" | "combined";
  modifications: ScenarioModification[];
  impactLoadKW: number | null;
  cost: number | null; // null = Unknown
  carbon: number | null; // null = Unknown
  hvacEffect: string;
  why: string;
  confidence: "high" | "medium" | "low";
  confidenceNote: string;
  scenario: RetrofitScenario;
  score: number;
}

export interface OptimizeResult {
  objective: OptimizeObjective;
  actions: RankedRetrofitAction[];
  sequence: SequenceStep[];
  notes: string[];
}

export interface SequenceStep {
  order: number;
  title: string;
  detail: string;
}

function envelopeCandidates(model: EngineeringReadyModel): ScenarioModification[] {
  const mods: ScenarioModification[] = [];
  for (const s of model.envelope.surfaces) {
    if (s.kind === "floor") continue;
    const u = s.uValueWm2K?.value;
    if (u == null || s.uValueWm2K.provenance.kind === "UNKNOWN") continue;
    if (!(s.areaM2?.value != null && s.areaM2.value > 0)) continue;
    // Propose improved U only if current U is worse than a better known target
    const proposed =
      s.kind === "window" ? Math.min(u, 1.6) : Math.min(u, 0.35);
    if (proposed >= u - 0.01) continue;
    mods.push({
      id: `improve_${s.id}`,
      target: s.kind,
      surfaceId: s.id,
      proposedUWm2K: proposed,
      label: `Improve ${s.kind} U ${u.toFixed(2)} → ${proposed.toFixed(2)} W/m²K`,
    });
  }
  return mods;
}

function hvacCandidate(
  baseline: RetrofitScenario
): ScenarioModification | null {
  const req = baseline.result?.hvac.requiredCapacityKW;
  const installed = baseline.result?.hvac.installedCapacityKW;
  if (req == null || !(req > 0)) return null;
  // Right-size to required × 1.1 headroom — documented
  const proposed = Number((req * 1.1).toFixed(2));
  if (installed != null && Math.abs(installed - proposed) < 0.05) return null;
  return {
    id: "hvac_rightsize",
    target: "hvac_capacity",
    proposedCapacityKW: proposed,
    label: `Right-size HVAC to ${proposed} kW (required×1.1)`,
  };
}

export function optimizeRetrofits(
  model: EngineeringReadyModel,
  objective: OptimizeObjective = "energy",
  mode: "cooling" | "heating" = "cooling"
): OptimizeResult {
  const notes: string[] = [
    "Cost and carbon are Unknown unless measured data is provided — not fabricated.",
    "Ranking uses calculated load reduction from the physics engine.",
  ];

  let baseline = createBaselineScenario(model);
  baseline = simulateScenario(baseline, mode);

  if (!baseline.result || baseline.calcStatus === "error" || baseline.calcStatus === "unavailable") {
    return {
      objective,
      actions: [],
      sequence: [
        {
          order: 1,
          title: "Complete baseline inputs",
          detail: baseline.errorMessage ?? "Baseline simulation unavailable",
        },
      ],
      notes: [...notes, "Optimizer blocked until baseline can run"],
    };
  }

  const candidates: RankedRetrofitAction[] = [];
  const envMods = envelopeCandidates(model);

  for (const mod of envMods) {
    let sc = createScenarioFrom(baseline, {
      name: mod.label,
      kind: "envelope",
    });
    sc.modifications = [mod];
    sc = simulateScenario(sc, mode);
    const baseLoad = baseline.result.load.totalKW;
    const newLoad = sc.result?.load.totalKW ?? null;
    const impact =
      baseLoad != null && newLoad != null ? baseLoad - newLoad : null;
    const hvacEffect = describeHvacEffect(baseline, sc);
    const confidence = confidenceFrom(sc);
    candidates.push({
      id: mod.id,
      title: mod.label,
      category: "envelope",
      modifications: [mod],
      impactLoadKW: impact,
      cost: null,
      carbon: null,
      hvacEffect,
      why: whyEnvelope(mod, impact, hvacEffect),
      confidence: confidence.level,
      confidenceNote: confidence.note,
      scenario: sc,
      score: impact != null && impact > 0 ? impact : 0,
    });
  }

  // Combined: best single envelope + HVAC right-size on post-envelope load
  if (envMods.length) {
    const bestEnv = [...candidates].sort((a, b) => b.score - a.score)[0];
    if (bestEnv && bestEnv.impactLoadKW != null && bestEnv.impactLoadKW > 0) {
      let combined = createScenarioFrom(bestEnv.scenario, {
        name: `Envelope + HVAC after ${bestEnv.title}`,
        kind: "combined",
      });
      // Re-simulate envelope-only first already in bestEnv.scenario
      const hvacMod = hvacCandidate(bestEnv.scenario);
      if (hvacMod) {
        combined.modifications = [...bestEnv.modifications, hvacMod];
        combined = simulateScenario(combined, mode);
        const baseLoad = baseline.result.load.totalKW;
        const newLoad = combined.result?.load.totalKW ?? null;
        const impact =
          baseLoad != null && newLoad != null ? baseLoad - newLoad : null;
        candidates.push({
          id: `combined_${bestEnv.id}`,
          title: combined.name,
          category: "combined",
          modifications: combined.modifications,
          impactLoadKW: impact,
          cost: null,
          carbon: null,
          hvacEffect: describeHvacEffect(baseline, combined),
          why: `Envelope change alters post-retrofit load; HVAC then evaluated against the new load (${hvacMod.label}).`,
          confidence: confidenceFrom(combined).level,
          confidenceNote: confidenceFrom(combined).note,
          scenario: combined,
          score:
            (impact != null && impact > 0 ? impact : 0) +
            (objective === "balanced" ? 0.1 : 0),
        });
      }
    }
  }

  const hvacOnly = hvacCandidate(baseline);
  if (hvacOnly) {
    let sc = createScenarioFrom(baseline, {
      name: hvacOnly.label,
      kind: "hvac",
    });
    sc.modifications = [hvacOnly];
    sc = simulateScenario(sc, mode);
    candidates.push({
      id: hvacOnly.id,
      title: hvacOnly.label,
      category: "hvac",
      modifications: [hvacOnly],
      impactLoadKW: 0,
      cost: null,
      carbon: null,
      hvacEffect: describeHvacEffect(baseline, sc),
      why: "HVAC capacity change does not alter envelope conduction; it changes capacity margin vs current (or post-envelope) load.",
      confidence: confidenceFrom(sc).level,
      confidenceNote: confidenceFrom(sc).note,
      scenario: sc,
      score: objective === "balanced" ? 0.05 : 0,
    });
  }

  const actions = candidates
    .filter((a) => a.scenario.calcStatus === "ready" || a.scenario.calcStatus === "partial")
    .sort((a, b) => b.score - a.score);

  const sequence = buildSequence(baseline, actions);

  return { objective, actions, sequence, notes };
}

function describeHvacEffect(
  baseline: RetrofitScenario,
  proposed: RetrofitScenario
): string {
  const b = baseline.result?.hvac;
  const p = proposed.result?.hvac;
  if (!b || !p) return "HVAC effect unknown — insufficient calculation";
  const reqB = b.requiredCapacityKW;
  const reqP = p.requiredCapacityKW;
  const parts: string[] = [];
  if (reqB != null && reqP != null) {
    const d = reqP - reqB;
    parts.push(
      `Required capacity ${reqB.toFixed(2)} → ${reqP.toFixed(2)} kW (${d >= 0 ? "+" : ""}${d.toFixed(2)} kW)`
    );
  }
  parts.push(`Verdict ${b.state} → ${p.state}`);
  return parts.join("; ");
}

function whyEnvelope(
  mod: ScenarioModification,
  impact: number | null,
  hvacEffect: string
): string {
  const bits = [
    mod.label,
    "→ recalculated U → conduction Q=UAΔT → building load",
    "→ HVAC requirement from post-retrofit load",
  ];
  if (impact != null) {
    bits.push(`Load change ${impact >= 0 ? "−" : "+"}${Math.abs(impact).toFixed(3)} kW`);
  }
  bits.push(hvacEffect);
  return bits.join(". ");
}

function confidenceFrom(sc: RetrofitScenario): {
  level: "high" | "medium" | "low";
  note: string;
} {
  if (sc.calcStatus === "ready") {
    return { level: "high", note: "All conduction/solar/vent components calculated where applicable" };
  }
  if (sc.calcStatus === "partial") {
    return {
      level: "medium",
      note: `Partial: ${sc.result?.load.missingInputs.slice(0, 3).join("; ") || "some inputs missing"}`,
    };
  }
  return { level: "low", note: sc.errorMessage || "Calculation incomplete" };
}

function buildSequence(
  baseline: RetrofitScenario,
  actions: RankedRetrofitAction[]
): SequenceStep[] {
  const steps: SequenceStep[] = [
    {
      order: 1,
      title: "Confirm baseline",
      detail: `Current load ${baseline.result?.load.totalKW?.toFixed(3) ?? "—"} kW · HVAC ${baseline.result?.hvac.state ?? "—"}`,
    },
  ];

  const topEnv = actions.find((a) => a.category === "envelope");
  const topCombined = actions.find((a) => a.category === "combined");

  if (topEnv && topEnv.impactLoadKW != null && topEnv.impactLoadKW > 0) {
    steps.push({
      order: 2,
      title: "Envelope intervention",
      detail: topEnv.title,
    });
    steps.push({
      order: 3,
      title: "Recalculate thermal load",
      detail: "Physics engine on post-retrofit envelope",
    });
    steps.push({
      order: 4,
      title: "Reassess HVAC against new load",
      detail: topEnv.hvacEffect,
    });
  }

  if (topCombined) {
    steps.push({
      order: steps.length + 1,
      title: "Resolve HVAC mismatch if needed",
      detail: topCombined.title,
    });
  }

  steps.push({
    order: steps.length + 1,
    title: "Validate final scenario",
    detail: "Inspect calculation traces and data completeness",
  });

  return steps;
}

/** Stress: re-run with outdoor +ΔT if climate supports — no invented climate */
export function stressTestScenario(
  scenario: RetrofitScenario,
  deltaOutdoorC: number,
  mode: "cooling" | "heating" = "cooling"
): RetrofitScenario {
  const model = applyModifications(scenario.model, scenario.modifications);
  const mapped = engineeringModelToPhysicsInput(model, mode);
  if (!mapped.ok || !mapped.input) {
    return {
      ...scenario,
      calcStatus: "unavailable",
      errorMessage: "Stress test blocked — baseline inputs incomplete",
      updatedAt: new Date().toISOString(),
    };
  }
  const input = {
    ...mapped.input,
    outdoorTempC: mapped.input.outdoorTempC + deltaOutdoorC,
    outdoorTempSource: `${mapped.input.outdoorTempSource} + stress ΔT ${deltaOutdoorC}°C (user-selected offset, not a climate projection)`,
  };
  const result = runPhysics(input);
  return {
    ...scenario,
    calcStatus: result.load.status === "calculated" ? "ready" : "partial",
    result,
    updatedAt: new Date().toISOString(),
  };
}
