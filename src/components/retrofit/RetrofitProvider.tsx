"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import type { EngineeringReadyModel } from "@/lib/engineering/model";
import {
  createBaselineScenario,
  createScenarioFrom,
  simulateScenario,
  type RetrofitScenario,
  type ScenarioModification,
} from "@/lib/retrofit/scenarios";
import {
  optimizeRetrofits,
  type OptimizeResult,
} from "@/lib/retrofit/optimize";

export type RecalcPhase =
  | "idle"
  | "change"
  | "physics"
  | "load"
  | "hvac"
  | "ready"
  | "error";

interface RetrofitCtx {
  baseline: RetrofitScenario | null;
  scenarios: RetrofitScenario[];
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  active: RetrofitScenario | null;
  opt: OptimizeResult | null;
  recalcPhase: RecalcPhase;
  pending: boolean;
  establishBaseline: (model: EngineeringReadyModel) => void;
  createScenario: (
    kind: "envelope" | "hvac" | "combined",
    name: string
  ) => void;
  updateActive: (patch: Partial<RetrofitScenario>) => void;
  applyModAndSimulate: (mod: ScenarioModification) => void;
  runActive: () => void;
  duplicateActive: () => void;
  deleteActive: () => void;
  runOptimize: (model: EngineeringReadyModel) => void;
  replaceScenario: (sc: RetrofitScenario) => void;
}

const Ctx = createContext<RetrofitCtx | null>(null);

export function RetrofitProvider({ children }: { children: ReactNode }) {
  const [baseline, setBaseline] = useState<RetrofitScenario | null>(null);
  const [scenarios, setScenarios] = useState<RetrofitScenario[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [opt, setOpt] = useState<OptimizeResult | null>(null);
  const [recalcPhase, setRecalcPhase] = useState<RecalcPhase>("idle");
  const [pending, startTransition] = useTransition();

  const active = useMemo(
    () => scenarios.find((s) => s.id === activeId) ?? null,
    [scenarios, activeId]
  );

  const establishBaseline = useCallback((model: EngineeringReadyModel) => {
    setRecalcPhase("change");
    startTransition(() => {
      setRecalcPhase("physics");
      let sc = createBaselineScenario(model);
      setRecalcPhase("load");
      sc = simulateScenario(sc);
      setRecalcPhase("hvac");
      setBaseline(sc);
      setScenarios([sc]);
      setActiveId(sc.id);
      setOpt(null);
      setRecalcPhase(sc.result ? "ready" : "error");
    });
  }, []);

  const createScenario = useCallback(
    (kind: "envelope" | "hvac" | "combined", name: string) => {
      if (!baseline) return;
      const next = createScenarioFrom(baseline, { name, kind });
      setScenarios((prev) => [...prev, next]);
      setActiveId(next.id);
    },
    [baseline]
  );

  const updateActive = useCallback(
    (patch: Partial<RetrofitScenario>) => {
      if (!activeId) return;
      setScenarios((prev) =>
        prev.map((s) => (s.id === activeId ? { ...s, ...patch } : s))
      );
    },
    [activeId]
  );

  const replaceScenario = useCallback((sc: RetrofitScenario) => {
    setScenarios((prev) => prev.map((s) => (s.id === sc.id ? sc : s)));
    if (sc.kind === "baseline") setBaseline(sc);
  }, []);

  const applyModAndSimulate = useCallback(
    (mod: ScenarioModification) => {
      if (!active || active.kind === "baseline") return;
      setRecalcPhase("change");
      const updated: RetrofitScenario = {
        ...active,
        modifications: [
          ...active.modifications.filter((m) => m.target !== mod.target),
          mod,
        ],
        calcStatus: "not_run",
        result: null,
        updatedAt: new Date().toISOString(),
      };
      setScenarios((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s))
      );
      startTransition(() => {
        setRecalcPhase("physics");
        setRecalcPhase("load");
        const next = simulateScenario(updated);
        setRecalcPhase("hvac");
        setScenarios((prev) =>
          prev.map((s) => (s.id === next.id ? next : s))
        );
        setRecalcPhase(next.result ? "ready" : "error");
      });
    },
    [active]
  );

  const runActive = useCallback(() => {
    if (!active) return;
    setRecalcPhase("change");
    startTransition(() => {
      setRecalcPhase("physics");
      setRecalcPhase("load");
      const next = simulateScenario(active);
      setRecalcPhase("hvac");
      setScenarios((prev) => prev.map((s) => (s.id === next.id ? next : s)));
      setRecalcPhase(next.result ? "ready" : "error");
    });
  }, [active]);

  const duplicateActive = useCallback(() => {
    if (!active) return;
    const copy = createScenarioFrom(active, {
      name: `${active.name} (copy)`,
      kind: active.kind === "baseline" ? "custom" : active.kind,
    });
    setScenarios((prev) => [...prev, copy]);
    setActiveId(copy.id);
  }, [active]);

  const deleteActive = useCallback(() => {
    if (!active || active.kind === "baseline") return;
    setScenarios((prev) => prev.filter((s) => s.id !== active.id));
    setActiveId(baseline?.id ?? null);
  }, [active, baseline]);

  const runOptimize = useCallback((model: EngineeringReadyModel) => {
    startTransition(() => {
      setOpt(optimizeRetrofits(model, "energy"));
    });
  }, []);

  const value: RetrofitCtx = {
    baseline,
    scenarios,
    activeId,
    setActiveId,
    active,
    opt,
    recalcPhase,
    pending,
    establishBaseline,
    createScenario,
    updateActive,
    applyModAndSimulate,
    runActive,
    duplicateActive,
    deleteActive,
    runOptimize,
    replaceScenario,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRetrofit(): RetrofitCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRetrofit requires RetrofitProvider");
  return ctx;
}
