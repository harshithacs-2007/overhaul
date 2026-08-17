"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import { useRetrofit } from "@/components/retrofit/RetrofitProvider";
import { assessSimulationReadiness } from "@/lib/retrofit/readiness";
import {
  compareScenarios,
  type RetrofitScenario,
  type ScenarioModification,
} from "@/lib/retrofit/scenarios";
import { stressTestScenario } from "@/lib/retrofit/optimize";
import type { TraceRecord } from "@/lib/physics/types";
import type { HvacFitState } from "@/lib/physics/types";

type WorkflowStep =
  | "building"
  | "baseline"
  | "retrofit"
  | "simulate"
  | "compare"
  | "optimize"
  | "decide";

const WORKFLOW: { id: WorkflowStep; label: string }[] = [
  { id: "building", label: "01 Building" },
  { id: "baseline", label: "02 Baseline" },
  { id: "retrofit", label: "03 Retrofit" },
  { id: "simulate", label: "04 Simulate" },
  { id: "compare", label: "05 Compare" },
  { id: "optimize", label: "06 Optimize" },
  { id: "decide", label: "07 Decide" },
];

function fmt(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "Insufficient data";
  return n.toFixed(digits);
}

function hvacLabel(state: HvacFitState): string {
  switch (state) {
    case "potentially_oversized":
      return "OVERSIZED";
    case "insufficient":
      return "UNDERSIZED";
    case "adequate":
      return "MATCHED";
    default:
      return "UNABLE TO DETERMINE";
  }
}

export function RetrofitPanel({
  view,
}: {
  view: "simulate" | "optimize" | "sequence";
}) {
  const { state, setStatus, setSection, setCenterMode } = useWorkspace();
  const retrofit = useRetrofit();
  const reduce = useReducedMotion();
  const model = state.engineering;
  const readiness = useMemo(() => assessSimulationReadiness(model), [model]);

  const [editorTarget, setEditorTarget] = useState<
    "wall" | "roof" | "window" | "hvac_capacity" | null
  >(null);
  const [proposedU, setProposedU] = useState("");
  const [proposedCap, setProposedCap] = useState("");
  const [inspect, setInspect] = useState<TraceRecord | null>(null);
  const [stressDelta, setStressDelta] = useState("5");
  const [stressResult, setStressResult] = useState<RetrofitScenario | null>(
    null
  );

  const {
    baseline,
    scenarios,
    active,
    activeId,
    setActiveId,
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
  } = retrofit;

  const currentStep = useMemo((): WorkflowStep => {
    if (!readiness.ready && !baseline) return "building";
    if (!baseline || baseline.calcStatus === "not_run") return "baseline";
    if (!active || active.kind === "baseline") return "retrofit";
    if (active.calcStatus === "not_run" || active.calcStatus === "running")
      return "simulate";
    if (scenarios.filter((s) => s.result).length < 2) return "compare";
    if (!opt) return "optimize";
    return "decide";
  }, [readiness.ready, baseline, active, scenarios, opt]);

  const nextAction = useMemo(() => {
    if (!readiness.ready)
      return readiness.missing[0]?.actionHint ?? "Complete required inputs";
    if (!baseline) return "Establish baseline";
    if (!active || active.kind === "baseline") return "Create a retrofit scenario";
    if (active.calcStatus === "not_run") return "Run simulation";
    if (!opt) return "Run optimization";
    return "Review retrofit sequence";
  }, [readiness, baseline, active, opt]);

  const jumpMissing = (path: string) => {
    if (path === "climate" || path === "location") {
      setSection("climate");
      setCenterMode("physics");
    } else if (path.includes("envelope") || path.includes("wall")) {
      setSection("building");
      setCenterMode("manual");
    } else if (path.toLowerCase().includes("hvac")) {
      setSection("hvac");
      setCenterMode("physics");
    } else {
      setSection("physics");
      setCenterMode("physics");
    }
  };

  const onEstablish = () => {
    establishBaseline(model);
    setStatus("Baseline calculation running…");
  };

  const applyEditor = () => {
    if (!active || active.kind === "baseline" || !editorTarget) return;
    const surface = model.envelope.surfaces.find((s) => s.kind === editorTarget);
    let mod: ScenarioModification | null = null;
    if (editorTarget === "hvac_capacity") {
      const n = Number(proposedCap);
      if (!Number.isFinite(n) || n <= 0) return;
      mod = {
        id: `mod_hvac_${Date.now()}`,
        target: "hvac_capacity",
        proposedCapacityKW: n,
        label: `HVAC capacity → ${n} kW`,
      };
    } else {
      const n = Number(proposedU);
      if (!Number.isFinite(n) || n <= 0) return;
      mod = {
        id: `mod_${editorTarget}_${Date.now()}`,
        target: editorTarget,
        surfaceId: surface?.id,
        proposedUWm2K: n,
        label: `${editorTarget} U → ${n} W/m²K`,
      };
    }
    applyModAndSimulate(mod);
    setEditorTarget(null);
    setStatus(`Recalculating · ${mod.label}`);
  };

  const delta =
    baseline && active && active.id !== baseline.id
      ? compareScenarios(baseline, active)
      : null;

  const surfaceCurrent = (kind: "wall" | "roof" | "window") => {
    const s = model.envelope.surfaces.find((x) => x.kind === kind);
    const u = s?.uValueWm2K;
    if (!u || u.value == null || u.provenance.kind === "UNKNOWN")
      return "Unknown";
    return `${u.value.toFixed(2)} W/m²K`;
  };

  const hvacCurrent = () => {
    const c = model.hvac.systems[0]?.ratedCapacityKW;
    if (!c || c.value == null || c.provenance.kind === "UNKNOWN")
      return "Unknown";
    return `${c.value.toFixed(2)} kW`;
  };

  if (view === "optimize" || view === "sequence") {
    return (
      <div className="flex h-full flex-col overflow-auto bg-navy p-4 text-paper lg:p-6">
        <WorkflowStrip
          current={currentStep}
          nextAction={nextAction}
          reduce={!!reduce}
        />
        <ReadinessBlock readiness={readiness} onJump={jumpMissing} />

        {view === "optimize" ? (
          <section className="mt-6 space-y-4">
            <header>
              <h2 className="font-display text-2xl">Optimize</h2>
              <p className="mt-1 max-w-xl text-sm text-steel">
                Which retrofit should happen first? Ranking uses calculated load
                reduction. Cost and carbon stay Unknown without measured data.
              </p>
            </header>
            <button
              type="button"
              onClick={() => {
                runOptimize(model);
                setStatus("Optimization running…");
              }}
              disabled={pending || !readiness.ready}
              className="border border-teal/50 bg-teal/10 px-4 py-2 text-sm text-teal disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
            >
              {pending ? "Evaluating…" : "Run optimization"}
            </button>
            {!readiness.ready ? (
              <p className="text-sm text-steel">{readiness.summary}</p>
            ) : null}
            <p className="border border-steel/20 px-3 py-2 text-xs text-steel">
              Budget optimization requires cost data.
            </p>
            {opt ? (
              <ol className="space-y-3">
                {opt.actions.map((a, i) => (
                  <li key={a.id} className="border border-steel/25 px-4 py-3">
                    <p className="font-mono-num text-[10px] uppercase tracking-wider text-steel">
                      {String(i + 1).padStart(2, "0")} · {a.category}
                    </p>
                    <h3 className="mt-1 text-sm font-medium">{a.title}</h3>
                    <dl className="mt-2 grid gap-1 text-xs text-steel sm:grid-cols-2">
                      <div>
                        <dt className="uppercase tracking-wide">Impact</dt>
                        <dd className="font-mono-num text-paper">
                          {a.impactLoadKW != null
                            ? `${a.impactLoadKW.toFixed(3)} kW load reduction`
                            : "Insufficient data"}
                        </dd>
                      </div>
                      <div>
                        <dt className="uppercase tracking-wide">Cost</dt>
                        <dd className="text-paper">Unknown</dd>
                      </div>
                      <div>
                        <dt className="uppercase tracking-wide">Carbon</dt>
                        <dd className="text-paper">Unknown</dd>
                      </div>
                      <div>
                        <dt className="uppercase tracking-wide">HVAC effect</dt>
                        <dd className="text-paper">{a.hvacEffect}</dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="uppercase tracking-wide">Why</dt>
                        <dd className="text-paper">{a.why}</dd>
                      </div>
                      <div>
                        <dt className="uppercase tracking-wide">Confidence</dt>
                        <dd className="text-paper">
                          {a.confidence} — {a.confidenceNote}
                        </dd>
                      </div>
                    </dl>
                  </li>
                ))}
                {!opt.actions.length ? (
                  <li className="text-sm text-steel">
                    No ranked actions — {opt.notes.join(" ")}
                  </li>
                ) : null}
              </ol>
            ) : null}

            <div className="border border-dashed border-steel/30 px-3 py-6 text-center text-xs text-steel">
              {opt && opt.actions.length >= 2
                ? "Cost↔energy charts require cost data. Energy deltas are listed above from physics."
                : "Need calculated scenarios with cost data for trade-off charts."}
            </div>
          </section>
        ) : (
          <section className="mt-6 space-y-4">
            <header>
              <h2 className="font-display text-2xl">Retrofit sequence</h2>
              <p className="mt-1 max-w-xl text-sm text-steel">
                Practical order from envelope→load→HVAC dependencies.
              </p>
            </header>
            {!opt ? (
              <button
                type="button"
                onClick={() => runOptimize(model)}
                className="border border-teal/50 bg-teal/10 px-4 py-2 text-sm text-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
              >
                Generate sequence from optimization
              </button>
            ) : (
              <ol className="space-y-0">
                {opt.sequence.map((step, idx) => (
                  <li key={step.order} className="flex gap-3">
                    <div className="flex w-8 flex-col items-center">
                      <span className="font-mono-num text-sm text-teal">
                        {String(step.order).padStart(2, "0")}
                      </span>
                      {idx < opt.sequence.length - 1 ? (
                        <span
                          className="my-1 h-full min-h-[1.5rem] w-px bg-steel/40"
                          aria-hidden
                        />
                      ) : null}
                    </div>
                    <div className="pb-4">
                      <p className="text-sm font-medium">{step.title}</p>
                      <p className="mt-0.5 text-xs text-steel">{step.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-auto bg-navy p-4 text-paper lg:p-6">
      <WorkflowStrip
        current={currentStep}
        nextAction={nextAction}
        reduce={!!reduce}
      />
      <ReadinessBlock readiness={readiness} onJump={jumpMissing} />

      <section className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!readiness.ready || pending}
          onClick={onEstablish}
          className="border border-paper/30 px-3 py-2 text-xs uppercase tracking-wide disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
        >
          Establish baseline
        </button>
        <button
          type="button"
          disabled={!baseline}
          onClick={() => createScenario("envelope", "Scenario A — Envelope")}
          className="border border-steel/40 px-3 py-2 text-xs uppercase tracking-wide disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
        >
          Create envelope scenario
        </button>
        <button
          type="button"
          disabled={!baseline}
          onClick={() => createScenario("hvac", "Scenario B — HVAC")}
          className="border border-steel/40 px-3 py-2 text-xs uppercase tracking-wide disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
        >
          Create HVAC scenario
        </button>
        <button
          type="button"
          disabled={!baseline}
          onClick={() => createScenario("combined", "Scenario C — Combined")}
          className="border border-steel/40 px-3 py-2 text-xs uppercase tracking-wide disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
        >
          Create combined scenario
        </button>
      </section>

      {scenarios.length > 0 ? (
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {scenarios.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveId(s.id)}
              className={`shrink-0 border px-3 py-2 text-left text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal ${
                s.id === activeId
                  ? "border-teal text-paper"
                  : "border-steel/30 text-steel"
              }`}
            >
              <span className="block font-medium text-paper">{s.name}</span>
              <span className="font-mono-num text-[10px] uppercase">
                {s.calcStatus}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {active ? (
        <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_minmax(240px,320px)]">
          <div className="space-y-5">
            {active.kind !== "baseline" ? (
              <div className="flex flex-wrap items-end gap-2">
                <label className="block text-xs text-steel">
                  Rename
                  <input
                    value={active.name}
                    onChange={(e) => updateActive({ name: e.target.value })}
                    className="mt-1 block w-56 border border-steel/30 bg-transparent px-2 py-1.5 text-sm text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
                  />
                </label>
                <button
                  type="button"
                  onClick={duplicateActive}
                  className="border border-steel/40 px-2 py-1.5 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  onClick={deleteActive}
                  className="border border-clay/40 px-2 py-1.5 text-xs text-clay focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
                >
                  Delete
                </button>
              </div>
            ) : null}

            <div>
              <h3 className="text-[11px] uppercase tracking-[0.14em] text-steel">
                Focused retrofit edit
              </h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["wall", "roof", "window", "hvac_capacity"] as const).map(
                  (t) => (
                    <button
                      key={t}
                      type="button"
                      disabled={active.kind === "baseline"}
                      onClick={() => setEditorTarget(t)}
                      className="border border-steel/35 px-3 py-1.5 text-xs capitalize disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
                    >
                      {t.replace("_", " ")}
                    </button>
                  )
                )}
              </div>
              {active.kind === "baseline" ? (
                <p className="mt-2 text-xs text-steel">
                  Baseline is the current building — create a scenario to propose
                  changes.
                </p>
              ) : null}
            </div>

            <AnimatePresence mode="wait">
              {editorTarget ? (
                <motion.div
                  key={editorTarget}
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? undefined : { opacity: 0 }}
                  className="border border-steel/30 p-4"
                >
                  <h4 className="font-display text-lg capitalize">
                    {editorTarget.replace("_", " ")}
                  </h4>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-steel">
                        Current
                      </p>
                      <p className="mt-1 font-mono-num text-sm">
                        {editorTarget === "hvac_capacity"
                          ? hvacCurrent()
                          : surfaceCurrent(editorTarget)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-steel">
                        Proposed
                      </p>
                      {editorTarget === "hvac_capacity" ? (
                        <input
                          value={proposedCap}
                          onChange={(e) => setProposedCap(e.target.value)}
                          placeholder="kW"
                          className="mt-1 w-full border border-steel/30 bg-transparent px-2 py-1.5 font-mono-num text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
                        />
                      ) : (
                        <input
                          value={proposedU}
                          onChange={(e) => setProposedU(e.target.value)}
                          placeholder="W/m²K"
                          className="mt-1 w-full border border-steel/30 bg-transparent px-2 py-1.5 font-mono-num text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
                        />
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-steel">
                        Effect
                      </p>
                      <p className="mt-1 text-xs text-steel">
                        {editorTarget === "hvac_capacity"
                          ? "Capacity margin → HVAC verdict"
                          : "U → Q=UAΔT → load → HVAC requirement"}
                      </p>
                      <p className="mt-1 text-[10px] text-steel/80">
                        No savings shown until calculation runs.
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={applyEditor}
                      className="border border-teal/50 bg-teal/10 px-3 py-1.5 text-xs text-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
                    >
                      Apply & recalculate
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditorTarget(null)}
                      className="border border-steel/30 px-3 py-1.5 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
                    >
                      Cancel
                    </button>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <RecalcChain phase={recalcPhase} reduce={!!reduce} />

            {active.calcStatus === "not_run" ? (
              <button
                type="button"
                onClick={() => {
                  runActive();
                  setStatus("Simulation running…");
                }}
                disabled={pending}
                className="border border-teal/50 bg-teal/10 px-4 py-2 text-sm text-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
              >
                Run simulation
              </button>
            ) : null}

            {active.calcStatus === "error" ||
            active.calcStatus === "unavailable" ? (
              <div
                role="alert"
                className="border border-clay/40 px-3 py-2 text-sm text-clay"
              >
                <p className="font-medium">Calculation unavailable</p>
                <p className="mt-1 text-xs text-steel">
                  {active.errorMessage ?? "Unknown failure"}
                </p>
              </div>
            ) : null}

            {active.result ? (
              <ResultsBlock
                scenario={active}
                baseline={baseline}
                delta={delta}
                onInspect={setInspect}
              />
            ) : null}

            {active.result ? (
              <div className="border border-steel/20 p-3">
                <h4 className="text-[11px] uppercase tracking-wide text-steel">
                  Climate stress offset
                </h4>
                <p className="mt-1 text-xs text-steel">
                  User-selected outdoor ΔT — not a climate projection.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="text-xs text-steel">
                    ΔT °C
                    <input
                      value={stressDelta}
                      onChange={(e) => setStressDelta(e.target.value)}
                      className="ml-2 w-16 border border-steel/30 bg-transparent px-2 py-1 font-mono-num focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const d = Number(stressDelta);
                      if (!Number.isFinite(d)) return;
                      const stressed = stressTestScenario(active, d);
                      setStressResult(stressed);
                      replaceScenario(active);
                    }}
                    className="border border-steel/40 px-2 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
                  >
                    Stress test
                  </button>
                </div>
                {stressResult?.result ? (
                  <p className="mt-2 font-mono-num text-xs">
                    Stress load {fmt(stressResult.result.load.totalKW)} kW · HVAC{" "}
                    {hvacLabel(stressResult.result.hvac.state)}
                    {active.result.load.totalKW != null &&
                    stressResult.result.load.totalKW != null
                      ? ` · Δ ${(stressResult.result.load.totalKW - active.result.load.totalKW).toFixed(3)} kW`
                      : ""}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <aside className="space-y-3 border border-steel/20 p-3 text-xs">
            <h3 className="text-[11px] uppercase tracking-wide text-steel">
              Scenario compare
            </h3>
            {baseline?.result &&
            scenarios.filter((s) => s.result).length >= 1 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[280px] text-left font-mono-num">
                  <thead>
                    <tr className="text-[10px] uppercase text-steel">
                      <th className="py-1 pr-2 font-normal">Metric</th>
                      {scenarios
                        .filter((s) => s.result)
                        .map((s) => (
                          <th key={s.id} className="px-1 py-1 font-normal">
                            {s.name.slice(0, 12)}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody className="text-paper">
                    <CompareRow
                      label="Thermal load kW"
                      values={scenarios
                        .filter((s) => s.result)
                        .map((s) => s.result!.load.totalKW)}
                    />
                    <CompareRow
                      label="HVAC required kW"
                      values={scenarios
                        .filter((s) => s.result)
                        .map((s) => s.result!.hvac.requiredCapacityKW)}
                    />
                    <CompareRow
                      label="HVAC installed kW"
                      values={scenarios
                        .filter((s) => s.result)
                        .map((s) => s.result!.hvac.installedCapacityKW)}
                    />
                    <tr>
                      <td className="py-1 pr-2 text-steel">HVAC status</td>
                      {scenarios
                        .filter((s) => s.result)
                        .map((s) => (
                          <td key={s.id} className="px-1 py-1">
                            {hvacLabel(s.result!.hvac.state)}
                          </td>
                        ))}
                    </tr>
                    <tr>
                      <td className="py-1 pr-2 text-steel">Cost</td>
                      {scenarios
                        .filter((s) => s.result)
                        .map((s) => (
                          <td key={s.id} className="px-1 py-1">
                            Unknown
                          </td>
                        ))}
                    </tr>
                    <tr>
                      <td className="py-1 pr-2 text-steel">Carbon</td>
                      {scenarios
                        .filter((s) => s.result)
                        .map((s) => (
                          <td key={s.id} className="px-1 py-1">
                            Unknown
                          </td>
                        ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-steel">
                Run baseline and at least one scenario to compare.
              </p>
            )}
          </aside>
        </div>
      ) : (
        <p className="mt-8 text-sm text-steel">
          Establish a baseline when readiness is green, then create scenarios.
        </p>
      )}

      <AnimatePresence>
        {inspect ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduce ? undefined : { opacity: 0 }}
            role="dialog"
            aria-modal
            aria-labelledby="inspect-title"
          >
            <button
              type="button"
              className="absolute inset-0"
              aria-label="Close inspect"
              onClick={() => setInspect(null)}
            />
            <motion.div
              className="relative z-10 max-h-[80vh] w-full max-w-lg overflow-auto border border-steel/30 bg-navy p-4"
              initial={reduce ? false : { y: 24 }}
              animate={{ y: 0 }}
            >
              <h3 id="inspect-title" className="font-display text-xl">
                {inspect.title}
              </h3>
              <dl className="mt-3 space-y-2 text-xs">
                <div>
                  <dt className="uppercase text-steel">Status</dt>
                  <dd>{inspect.status}</dd>
                </div>
                <div>
                  <dt className="uppercase text-steel">Formula</dt>
                  <dd className="font-mono-num">{inspect.formula}</dd>
                </div>
                <div>
                  <dt className="uppercase text-steel">Inputs</dt>
                  <dd className="font-mono-num whitespace-pre-wrap">
                    {Object.entries(inspect.inputs)
                      .map(([k, v]) => `${k}: ${v ?? "—"}`)
                      .join("\n")}
                  </dd>
                </div>
                <div>
                  <dt className="uppercase text-steel">Result</dt>
                  <dd className="font-mono-num">
                    {inspect.result != null
                      ? `${inspect.result} ${inspect.resultUnit}`
                      : "Unavailable"}
                  </dd>
                </div>
                <div>
                  <dt className="uppercase text-steel">Assumptions</dt>
                  <dd>{inspect.assumptions.join("; ") || "—"}</dd>
                </div>
                <div>
                  <dt className="uppercase text-steel">Missing</dt>
                  <dd>{inspect.missingInputs.join("; ") || "None"}</dd>
                </div>
                <div>
                  <dt className="uppercase text-steel">Data source</dt>
                  <dd>{inspect.dataSource ?? "CALCULATED"}</dd>
                </div>
              </dl>
              <button
                type="button"
                className="mt-4 border border-steel/40 px-3 py-1.5 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
                onClick={() => setInspect(null)}
              >
                Close
              </button>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function WorkflowStrip({
  current,
  nextAction,
  reduce,
}: {
  current: WorkflowStep;
  nextAction: string;
  reduce: boolean;
}) {
  const idx = WORKFLOW.findIndex((w) => w.id === current);
  return (
    <div className="border-b border-steel/20 pb-4">
      <ol className="flex gap-1 overflow-x-auto text-[10px] uppercase tracking-wide">
        {WORKFLOW.map((w, i) => {
          const done = i < idx;
          const active = i === idx;
          return (
            <li
              key={w.id}
              className={`shrink-0 border px-2 py-1 ${
                active
                  ? "border-teal text-teal"
                  : done
                    ? "border-steel/40 text-paper"
                    : "border-steel/20 text-steel/70"
              }`}
            >
              {done ? "✓ " : ""}
              {w.label}
            </li>
          );
        })}
      </ol>
      <motion.p
        key={nextAction}
        className="mt-2 text-sm text-steel"
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        Next: <span className="text-paper">{nextAction}</span>
      </motion.p>
    </div>
  );
}

function ReadinessBlock({
  readiness,
  onJump,
}: {
  readiness: ReturnType<typeof assessSimulationReadiness>;
  onJump: (path: string) => void;
}) {
  return (
    <div
      className={`mt-4 border px-3 py-3 ${
        readiness.ready ? "border-teal/40" : "border-gold/40"
      }`}
    >
      <p className="font-mono-num text-xs uppercase tracking-[0.12em]">
        {readiness.summary}
      </p>
      {!readiness.ready ? (
        <ul className="mt-2 space-y-1">
          {readiness.missing.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => onJump(m.path)}
                className="text-left text-sm text-paper underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
              >
                {m.actionHint}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {readiness.warnings.length ? (
        <ul className="mt-2 text-xs text-steel">
          {readiness.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function RecalcChain({
  phase,
  reduce,
}: {
  phase: import("./RetrofitProvider").RecalcPhase;
  reduce: boolean;
}) {
  if (phase === "idle") return null;
  const steps: { id: typeof phase; label: string }[] = [
    { id: "change", label: "CHANGE DETECTED" },
    { id: "physics", label: "RECALCULATING PHYSICS" },
    { id: "load", label: "THERMAL LOAD UPDATED" },
    { id: "hvac", label: "HVAC REQUIREMENT UPDATED" },
    { id: "ready", label: "SCENARIO READY" },
    { id: "error", label: "CALCULATION UNAVAILABLE" },
  ];
  const order = ["change", "physics", "load", "hvac", "ready", "error"];
  const cur = order.indexOf(phase);
  return (
    <ol className="flex flex-col gap-1 border border-steel/20 p-3 font-mono-num text-[10px] uppercase tracking-wider">
      {steps
        .filter((s) => s.id !== "error" || phase === "error")
        .filter((s) => s.id !== "ready" || phase === "ready" || cur >= 4)
        .map((s) => {
          const i = order.indexOf(s.id);
          const on = phase === s.id || (phase !== "error" && i < cur);
          return (
            <motion.li
              key={s.id}
              className={on ? "text-teal" : "text-steel/50"}
              animate={
                reduce || phase !== s.id
                  ? undefined
                  : { opacity: [0.5, 1, 0.5] }
              }
              transition={{ duration: 0.6, repeat: phase === s.id ? 2 : 0 }}
            >
              {on ? "● " : "○ "}
              {s.label}
            </motion.li>
          );
        })}
    </ol>
  );
}

function ResultsBlock({
  scenario,
  baseline,
  delta,
  onInspect,
}: {
  scenario: RetrofitScenario;
  baseline: RetrofitScenario | null;
  delta: ReturnType<typeof compareScenarios> | null;
  onInspect: (t: TraceRecord) => void;
}) {
  const r = scenario.result!;
  const load = r.load.totalKW;
  const baseLoad = baseline?.result?.load.totalKW ?? null;
  return (
    <div className="space-y-3 border border-steel/25 p-4">
      <h3 className="font-display text-xl">
        {scenario.kind === "baseline" ? "Current building" : "Proposed retrofit"}
      </h3>
      {delta &&
      delta.loadKW.delta != null &&
      baseLoad != null &&
      load != null ? (
        <p className="text-sm">
          <span className="font-mono-num">
            {baseLoad.toFixed(2)} kW → {load.toFixed(2)} kW
          </span>
          <span className="mt-1 block text-steel">
            {Math.abs(delta.loadKW.delta).toFixed(2)} kW{" "}
            {delta.loadKW.delta < 0 ? "lower" : "higher"} thermal load. Why:
            envelope/thermal inputs changed → physics recalculated → HVAC from
            post-retrofit load.
          </span>
        </p>
      ) : (
        <p className="font-mono-num text-sm">Thermal load {fmt(load)} kW</p>
      )}
      <dl className="grid gap-2 text-xs sm:grid-cols-2">
        <Metric
          label="Heat transfer (conduction)"
          value={
            r.load.conductionW != null
              ? `${(r.load.conductionW / 1000).toFixed(3)} kW`
              : null
          }
        />
        <Metric
          label="HVAC required"
          value={
            r.hvac.requiredCapacityKW != null
              ? `${r.hvac.requiredCapacityKW.toFixed(2)} kW`
              : null
          }
        />
        <Metric
          label="HVAC installed"
          value={
            r.hvac.installedCapacityKW != null
              ? `${r.hvac.installedCapacityKW.toFixed(2)} kW`
              : null
          }
        />
        <Metric label="HVAC status" value={hvacLabel(r.hvac.state)} />
        <Metric
          label="Capacity margin"
          value={
            r.hvac.marginKW != null ? `${r.hvac.marginKW.toFixed(2)} kW` : null
          }
        />
        <Metric label="Energy" value={null} />
        <Metric label="Cost" value={null} />
        <Metric label="Carbon" value={null} />
        <Metric label="Payback" value={null} />
      </dl>
      <div>
        <p className="text-[10px] uppercase tracking-wide text-steel">
          How was this calculated?
        </p>
        <ul className="mt-1 space-y-1">
          {r.load.traces.slice(0, 8).map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onInspect(t)}
                className="text-left text-xs text-teal underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
              >
                Inspect · {t.title}
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => onInspect(r.hvac.trace)}
              className="text-left text-xs text-teal underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
            >
              Inspect · HVAC capacity
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="uppercase tracking-wide text-steel">{label}</dt>
      <dd className="font-mono-num text-paper">
        {value ?? "Insufficient data"}
      </dd>
    </div>
  );
}

function CompareRow({
  label,
  values,
}: {
  label: string;
  values: (number | null)[];
}) {
  const nums = values.filter((v): v is number => v != null);
  const min = nums.length ? Math.min(...nums) : null;
  const max = nums.length ? Math.max(...nums) : null;
  return (
    <tr>
      <td className="py-1 pr-2 text-steel">{label}</td>
      {values.map((v, i) => {
        const highlight =
          v != null && min != null && max != null && min !== max && v === min;
        return (
          <td
            key={i}
            className={`px-1 py-1 ${highlight ? "underline decoration-teal" : ""}`}
          >
            {v != null ? v.toFixed(2) : "—"}
          </td>
        );
      })}
    </tr>
  );
}
