/**
 * Retrofit scenario system — clones EngineeringReadyModel, applies real mods, runs physics.
 */

import type { EngineeringReadyModel } from "@/lib/engineering/model";
import { userProvided } from "@/lib/engineering/provenance";
import type { PhysicsRunResult } from "@/lib/physics/types";
import { engineeringModelToPhysicsInput } from "@/lib/physics/fromModel";
import { runPhysics } from "@/lib/physics/run";
import { assessSimulationReadiness } from "./readiness";

export type ScenarioKind = "baseline" | "envelope" | "hvac" | "combined" | "custom";

export type ScenarioCalcStatus =
  | "not_run"
  | "running"
  | "ready"
  | "partial"
  | "unavailable"
  | "error";

export interface ScenarioModification {
  id: string;
  target: "wall" | "roof" | "window" | "door" | "hvac_capacity";
  surfaceId?: string;
  /** Proposed U W/m²K for envelope */
  proposedUWm2K?: number;
  /** Proposed HVAC rated capacity kW */
  proposedCapacityKW?: number;
  label: string;
}

export interface RetrofitScenario {
  id: string;
  name: string;
  kind: ScenarioKind;
  baselineId: string | null;
  model: EngineeringReadyModel;
  modifications: ScenarioModification[];
  calcStatus: ScenarioCalcStatus;
  result: PhysicsRunResult | null;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export function cloneModel(model: EngineeringReadyModel): EngineeringReadyModel {
  return structuredClone(model);
}

export function createBaselineScenario(
  model: EngineeringReadyModel
): RetrofitScenario {
  const now = new Date().toISOString();
  return {
    id: `baseline_${Date.now()}`,
    name: "Baseline (current building)",
    kind: "baseline",
    baselineId: null,
    model: cloneModel(model),
    modifications: [],
    calcStatus: "not_run",
    result: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function createScenarioFrom(
  source: RetrofitScenario,
  opts: { name: string; kind: ScenarioKind }
): RetrofitScenario {
  const now = new Date().toISOString();
  return {
    id: `sc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: opts.name,
    kind: opts.kind,
    baselineId: source.kind === "baseline" ? source.id : source.baselineId ?? source.id,
    model: cloneModel(source.model),
    modifications: [...source.modifications],
    calcStatus: "not_run",
    result: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Apply modifications into model clone — real input changes for physics */
export function applyModifications(
  model: EngineeringReadyModel,
  mods: ScenarioModification[]
): EngineeringReadyModel {
  const next = cloneModel(model);
  for (const mod of mods) {
    if (
      (mod.target === "wall" ||
        mod.target === "roof" ||
        mod.target === "window" ||
        mod.target === "door") &&
      mod.proposedUWm2K != null
    ) {
      const sid =
        mod.surfaceId ??
        next.envelope.surfaces.find((s) => s.kind === mod.target)?.id;
      if (!sid) continue;
      next.envelope.surfaces = next.envelope.surfaces.map((s) =>
        s.id === sid
          ? { ...s, uValueWm2K: userProvided(mod.proposedUWm2K!) }
          : s
      );
    }
    if (mod.target === "hvac_capacity" && mod.proposedCapacityKW != null) {
      next.hvac.systems = next.hvac.systems.map((sys, i) =>
        i === 0
          ? { ...sys, ratedCapacityKW: userProvided(mod.proposedCapacityKW!) }
          : sys
      );
    }
  }
  next.updatedAt = new Date().toISOString();
  return next;
}

export function simulateScenario(
  scenario: RetrofitScenario,
  mode: "cooling" | "heating" = "cooling"
): RetrofitScenario {
  const model = applyModifications(scenario.model, scenario.modifications);
  const readiness = assessSimulationReadiness(model, mode);
  if (!readiness.ready) {
    return {
      ...scenario,
      model,
      calcStatus: "unavailable",
      result: null,
      errorMessage: readiness.summary + ": " + readiness.missing.map((m) => m.label).join(", "),
      updatedAt: new Date().toISOString(),
    };
  }

  const mapped = engineeringModelToPhysicsInput(model, mode);
  if (!mapped.ok || !mapped.input) {
    return {
      ...scenario,
      model,
      calcStatus: "error",
      result: null,
      errorMessage: mapped.blockingMissing.join(", "),
      updatedAt: new Date().toISOString(),
    };
  }

  try {
    const result = runPhysics(mapped.input);
    const status: ScenarioCalcStatus =
      result.load.status === "calculated"
        ? "ready"
        : result.load.status === "partial"
          ? "partial"
          : "unavailable";
    return {
      ...scenario,
      model,
      calcStatus: status,
      result,
      errorMessage: undefined,
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      ...scenario,
      model,
      calcStatus: "error",
      result: null,
      errorMessage: err instanceof Error ? err.message : String(err),
      updatedAt: new Date().toISOString(),
    };
  }
}

export interface ScenarioDelta {
  loadKW: { baseline: number | null; proposed: number | null; delta: number | null };
  hvacRequiredKW: { baseline: number | null; proposed: number | null; delta: number | null };
  hvacInstalledKW: { baseline: number | null; proposed: number | null };
  hvacState: { baseline: string | null; proposed: string | null };
  conductionW: { baseline: number | null; proposed: number | null; delta: number | null };
}

export function compareScenarios(
  baseline: RetrofitScenario,
  proposed: RetrofitScenario
): ScenarioDelta {
  const bLoad = baseline.result?.load.totalKW ?? null;
  const pLoad = proposed.result?.load.totalKW ?? null;
  const bReq = baseline.result?.hvac.requiredCapacityKW ?? null;
  const pReq = proposed.result?.hvac.requiredCapacityKW ?? null;
  const bCond = baseline.result?.load.conductionW ?? null;
  const pCond = proposed.result?.load.conductionW ?? null;

  const delta = (a: number | null, b: number | null) =>
    a != null && b != null ? b - a : null;

  return {
    loadKW: {
      baseline: bLoad,
      proposed: pLoad,
      delta: delta(bLoad, pLoad),
    },
    hvacRequiredKW: {
      baseline: bReq,
      proposed: pReq,
      delta: delta(bReq, pReq),
    },
    hvacInstalledKW: {
      baseline: baseline.result?.hvac.installedCapacityKW ?? null,
      proposed: proposed.result?.hvac.installedCapacityKW ?? null,
    },
    hvacState: {
      baseline: baseline.result?.hvac.state ?? null,
      proposed: proposed.result?.hvac.state ?? null,
    },
    conductionW: {
      baseline: bCond,
      proposed: pCond,
      delta: delta(bCond, pCond),
    },
  };
}
