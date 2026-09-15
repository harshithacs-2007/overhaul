"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { diagnoseResiduals, rankNextBestMeasurement, evaluateRetrofitDecision, simulatePhysicsScenario, type DecisionScenario } from "@/lib/engineering";

type Scope = "building" | "facility" | "equipment";
type Phase = "observe" | "model" | "diagnose" | "simulate" | "decide" | "verify";
type Observation = { key: string; value: number | string; unit?: string; confidence: number; sourceText?: string; evidenceId?: string };
type Extraction = { evidenceId?: string; evidenceType?: string; sourceKind?: string; sourceName?: string; observations?: Array<{ field: string; value: string; numericValue: number | null; unit: string | null; confidence: number; sourceText: string }> };
type Assessment = { assessmentSubject?: Scope; assessmentGoal?: string; industry?: string; siteName?: string | null; assetClass?: string | null; evidence?: Array<{ id: string; kind: string; name: string; type: string; size: number }> };

type ModelValues = {
  area: number | null;
  capacity: number | null;
  load: number | null;
  power: number | null;
  indoor: number | null;
  outdoor: number | null;
  efficiency: number | null;
  annualHours: number | null;
  coolingHours: number | null;
  rate: number | null;
  rValue: number | null;
  proposedEfficiency: number | null;
  proposedCapacity: number | null;
  baselineRuntime: number | null;
  proposedRuntime: number | null;
  envelopeUA: number | null;
};

function canonical(field: string) {
  return field.toLowerCase().trim().replace(/[()\-\/]+/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_");
}
function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function firstNumber(observations: Observation[], keys: string[]) {
  const hit = observations.find((item) => keys.includes(item.key) && finite(item.value));
  return finite(hit?.value) ? hit.value : null;
}
function formatNumber(value: number | null, unit = "") {
  return value == null ? "Not established" : `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}${unit ? ` ${unit}` : ""}`;
}
function pct(value: number) { return `${Math.round(value * 100)}%`; }

export default function UniversalDecisionWorkspace() {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [extracts, setExtracts] = useState<Extraction[]>([]);
  const [phase, setPhase] = useState<Phase>("observe");
  const [heatStressC, setHeatStressC] = useState(0);
  const [carbonFactor, setCarbonFactor] = useState(0);
  const [verifiedPower, setVerifiedPower] = useState("");
  const [verifiedEnergy, setVerifiedEnergy] = useState("");
  const [supplemental, setSupplemental] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      setAssessment(JSON.parse(sessionStorage.getItem("overhaul:assessment") || "null"));
      setExtracts(JSON.parse(sessionStorage.getItem("overhaul:evidence-extractions") || "[]"));
      setSupplemental(JSON.parse(sessionStorage.getItem("overhaul:supplemental-values") || "{}"));
    } catch {
      setAssessment(null); setExtracts([]); setSupplemental({});
    }
  }, []);

  const observations = useMemo<Observation[]>(() => {
    const fromEvidence = extracts.flatMap((x) => (x.observations || []).map((o) => ({
      key: canonical(o.field), value: o.numericValue ?? o.value, unit: o.unit || undefined, confidence: o.confidence, sourceText: o.sourceText, evidenceId: x.evidenceId,
    })));
    return fromEvidence;
  }, [extracts]);

  const numberBy = (keys: string[]) => {
    const evidenceValue = firstNumber(observations, keys);
    if (evidenceValue != null) return evidenceValue;
    const supplementary = keys.map((key) => supplemental[key]).find((value) => value != null && value !== "");
    const parsed = supplementary == null ? null : Number(supplementary);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const values = useMemo<ModelValues>(() => ({
    area: numberBy(["floor_area_m2", "floor_area"]),
    capacity: numberBy(["rated_capacity_kw", "capacity_kw", "hvac_capacity_kw"]),
    load: numberBy(["cooling_load_kw", "hvac_load_kw", "load_kw"]),
    power: numberBy(["power_kw", "electrical_power_kw"]),
    indoor: numberBy(["indoor_temp_c", "temperature_c"]),
    outdoor: numberBy(["outdoor_temp_c", "design_outdoor_temp_c"]),
    efficiency: numberBy(["efficiency", "cop", "eer"]),
    annualHours: numberBy(["annual_hours", "runtime_hours", "annual_runtime_hours"]),
    coolingHours: numberBy(["annual_cooling_hours", "cooling_hours"]),
    rate: numberBy(["electricity_rate_inr_per_kwh", "electricity_rate", "tariff_inr_per_kwh"]),
    rValue: numberBy(["existing_r_value_m2k_w", "r_value_m2k_w"]),
    proposedEfficiency: numberBy(["proposed_efficiency", "proposed_cop"]),
    proposedCapacity: numberBy(["proposed_capacity_kw"]),
    baselineRuntime: numberBy(["baseline_runtime_hours"]),
    proposedRuntime: numberBy(["proposed_runtime_hours"]),
    envelopeUA: numberBy(["envelope_ua_w_per_k", "envelope_ua"]),
  }), [observations, supplemental]);

  useEffect(() => {
    try { sessionStorage.setItem("overhaul:supplemental-values", JSON.stringify(supplemental)); } catch { /* optional */ }
  }, [supplemental]);

  const scope = assessment?.assessmentSubject || "building";
  const isEquipment = scope === "equipment";
  const independentExpectedPower = numberBy(["expected_power_kw", "healthy_power_kw", "reference_power_kw", "design_power_kw"]);
  const independentExpectedCapacity = numberBy(["expected_capacity_kw", "healthy_capacity_kw", "reference_capacity_kw"]);
  const expectedSignals = isEquipment
    ? [
        ...(values.power != null && independentExpectedPower != null ? [{ key: "power_kw", observed: values.power, expected: independentExpectedPower, unit: "kW", toleranceRelative: 0.1, confidence: 0.9 }] : []),
        ...(values.capacity != null && independentExpectedCapacity != null ? [{ key: "capacity_kw", observed: values.capacity, expected: independentExpectedCapacity, unit: "kW", toleranceRelative: 0.1, confidence: 0.9 }] : []),
      ]
    : [];
  const diagnosis = useMemo(() => isEquipment ? diagnoseResiduals({ domain: "equipment", signals: expectedSignals }) : diagnoseResiduals({ domain: "hvac", signals: expectedSignals }), [expectedSignals, isEquipment]);
  const availableSignals = observations.filter((item) => typeof item.value === "number").map((item) => item.key);
  const nextMeasurement = rankNextBestMeasurement({ diagnostic: diagnosis, availableSignals, blockedDecisions: diagnosis.evidenceRequests });

  const baselineBuilding = values.area != null && values.outdoor != null && values.indoor != null && values.rate != null && values.coolingHours != null && values.efficiency != null
    ? {
        floorAreaM2: values.area,
        envelopeUA_W_per_K: values.envelopeUA ?? (values.rValue != null && values.area > 0 ? values.area / values.rValue : 0),
        ventilationM3s: 0,
        outdoorTempC: values.outdoor,
        indoorTempC: values.indoor,
        solarGainKW: 0,
        internalGainKW: 0,
        hvacCapacityKW: values.capacity ?? 0,
        hvacCOP: values.efficiency,
        annualCoolingHours: values.coolingHours,
        electricityRateINRPerKWh: values.rate,
      }
    : null;
  const baselineEquipment = values.load != null && values.capacity != null && values.efficiency != null && values.rate != null && values.annualHours != null
    ? { loadKW: values.load, ratedCapacityKW: values.capacity, efficiency: values.efficiency, annualHours: values.annualHours, electricityRateINRPerKWh: values.rate }
    : null;

  const scenarioSet = useMemo(() => {
    const output: Array<DecisionScenario & { trace: string[] }> = [];
    const doNothing: DecisionScenario & { trace: string[] } = {
      id: "do-nothing", name: "Do nothing", capexINR: 0, annualEnergySavingKWh: 0, annualCostSavingINR: 0,
      annualCarbonReductionKg: carbonFactor > 0 ? 0 : null, downtimeHours: 0, reliabilityScore: 0.5, comfortScore: 0.5, feasible: true, blockedBy: [], trace: ["Counterfactual baseline; no physical change modeled."],
    };
    output.push(doNothing);
    if (isEquipment && baselineEquipment) {
      if (values.proposedEfficiency != null && values.proposedEfficiency > 0) {
        const proposed = simulatePhysicsScenario({ subject: "equipment", baseline: baselineEquipment, retrofit: { efficiency: values.proposedEfficiency } });
        const annualSaving = Math.max(proposed.delta.annualSavingINR, 0);
        output.push({ id: "efficiency-upgrade", name: "Efficiency upgrade", capexINR: null, annualEnergySavingKWh: Math.max(-proposed.delta.annualEnergyKWh, 0), annualCostSavingINR: annualSaving, annualCarbonReductionKg: carbonFactor > 0 ? Math.max(-proposed.delta.annualEnergyKWh, 0) * carbonFactor : null, downtimeHours: null, reliabilityScore: 0.65, comfortScore: 0.55, feasible: false, blockedBy: ["CAPEX, downtime and procurement constraints are not yet evidenced."], trace: ["Physics: load held at the observed operating point; efficiency changed to the supplied proposed reference.", `Annual energy delta: ${proposed.delta.annualEnergyKWh.toFixed(1)} kWh.`] });
      } else {
        output.push({ id: "efficiency-upgrade", name: "Efficiency upgrade", capexINR: null, annualEnergySavingKWh: null, annualCostSavingINR: null, annualCarbonReductionKg: null, downtimeHours: null, reliabilityScore: null, comfortScore: null, feasible: false, blockedBy: ["Proposed efficiency is not established by evidence."] , trace: []});
      }
    }
    if (!isEquipment && baselineBuilding) {
      if (baselineBuilding.envelopeUA_W_per_K > 0) {
        const stressedBaseline = { ...baselineBuilding, outdoorTempC: baselineBuilding.outdoorTempC + heatStressC };
        const baselineStress = simulatePhysicsScenario({ subject: "building", baseline: stressedBaseline });
        output.push({ id: "envelope-first", name: "Reduce envelope load first", capexINR: null, annualEnergySavingKWh: null, annualCostSavingINR: null, annualCarbonReductionKg: null, downtimeHours: null, reliabilityScore: 0.7, comfortScore: 0.8, feasible: false, blockedBy: ["Retrofit U/R-value change and CAPEX evidence are required before quantifying this option."], trace: [`Peak-condition thermal load is recalculated at ${stressedBaseline.outdoorTempC.toFixed(1)} °C outdoor temperature.`, `Modeled stressed baseline load: ${baselineStress.baseline.thermalLoadKW.toFixed(1)} kW.`] });
      }
      if (values.proposedCapacity != null && values.proposedCapacity > 0) {
        const stressedBaseline = { ...baselineBuilding, outdoorTempC: baselineBuilding.outdoorTempC + heatStressC };
        const resized = simulatePhysicsScenario({ subject: "building", baseline: stressedBaseline, retrofit: { hvacCapacityKW: values.proposedCapacity } });
        output.push({ id: "resize-hvac", name: "Right-size HVAC", capexINR: null, annualEnergySavingKWh: Math.max(-resized.delta.annualEnergyKWh, 0), annualCostSavingINR: Math.max(resized.delta.annualSavingINR, 0), annualCarbonReductionKg: carbonFactor > 0 ? Math.max(-resized.delta.annualEnergyKWh, 0) * carbonFactor : null, downtimeHours: null, reliabilityScore: 0.7, comfortScore: 0.8, feasible: false, blockedBy: ["Right-sizing must be paired with a validated load model and CAPEX/downtime evidence."], trace: [`Boundary condition: outdoor temperature ${stressedBaseline.outdoorTempC.toFixed(1)} °C.`, `Modelled thermal load: ${resized.proposed.thermalLoadKW.toFixed(1)} kW.`, `Proposed capacity: ${values.proposedCapacity.toFixed(1)} kW.`] });
      }
    }
    return output;
  }, [baselineBuilding, baselineEquipment, carbonFactor, heatStressC, isEquipment, values.proposedCapacity, values.proposedEfficiency]);

  const decision = useMemo(() => evaluateRetrofitDecision({
    scenarios: scenarioSet,
    weights: { capex: 0.18, energy: 0.25, carbon: 0.12, downtime: 0.15, reliability: 0.15, comfort: 0.15 },
    uncertainty: heatStressC !== 0 ? [{ parameter: "heatStressC", min: Math.max(0, heatStressC - 2), max: heatStressC + 2, unit: "°C" }] : [],
    perturb: (scenario, values) => scenario,
    doNothingScenarioId: "do-nothing",
  }), [heatStressC, scenarioSet]);

  const observedEnergy = Number(verifiedEnergy);
  const observedPower = Number(verifiedPower);
  const verification = values.power != null && Number.isFinite(observedPower) && observedPower >= 0
    ? { powerDelta: observedPower - values.power, powerChangePercent: ((observedPower - values.power) / Math.max(values.power, 1)) * 100 }
    : null;

  if (!assessment) return <main className="min-h-screen bg-[#050707] p-10 text-paper">No assessment package found. <Link href="/" className="text-teal underline">Start a new assessment</Link>.</main>;

  const evidenceReady = (assessment.evidence?.length || 0) > 0;
  const modelReady = scope === "equipment" ? baselineEquipment != null : baselineBuilding != null;
  const decisionReady = decision.recommendation != null && decision.recommendation.status !== "blocked";

  return (
    <main className="min-h-screen bg-[#050707] text-paper">
      <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-7 lg:px-10">
        <header className="border-b border-steel/15 pb-5">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <Link href="/" className="font-mono text-[9px] uppercase tracking-[0.16em] text-steel">← new assessment</Link>
              <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.25em] text-teal">OVERHAUL // UNIVERSAL RETROFIT INTELLIGENCE ENGINE</p>
              <h1 className="mt-1 font-display text-4xl tracking-tight sm:text-6xl">{assessment.siteName || assessment.assetClass || "Asset assessment"}</h1>
              <p className="mt-2 text-sm text-steel">{assessment.industry || "other"} · {scope} · objective: {assessment.assessmentGoal || "retrofit"}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 min-w-[330px]">
              <Status label="Evidence" value={evidenceReady ? `${assessment.evidence?.length || 0} captured` : "blocked"} ok={evidenceReady}/>
              <Status label="Engineering model" value={modelReady ? "active" : "awaiting inputs"} ok={modelReady}/>
              <Status label="Decision" value={decisionReady ? "ranked" : "evidence gated"} ok={decisionReady}/>
            </div>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-6">
            {(["observe","model","diagnose","simulate","decide","verify"] as Phase[]).map((item, index) => (
              <button key={item} type="button" onClick={() => setPhase(item)} className={`border p-3 text-left transition ${phase === item ? "border-teal/45 bg-teal/[0.06]" : "border-steel/15 hover:border-steel/35"}`}>
                <div className="flex items-center gap-2"><span className="font-mono text-[8px] text-teal">0{index + 1}</span><span className="font-mono text-[8px] uppercase tracking-[0.15em]">{item}</span></div>
                <p className="mt-2 text-[9px] text-steel">{phaseCopy(item)}</p>
              </button>
            ))}
          </div>
        </header>

        {phase === "observe" && <ObservePanel assessment={assessment} observations={observations} evidenceCount={assessment.evidence?.length || 0} onAddSupplement={setSupplemental} supplemental={supplemental}/>} 
        {phase === "model" && <ModelPanel scope={scope} values={values} heatStressC={heatStressC} setHeatStressC={setHeatStressC} carbonFactor={carbonFactor} setCarbonFactor={setCarbonFactor} baselineBuilding={baselineBuilding} baselineEquipment={baselineEquipment}/>} 
        {phase === "diagnose" && <DiagnosePanel diagnosis={diagnosis} nextMeasurement={nextMeasurement} signals={expectedSignals}/>} 
        {phase === "simulate" && <SimulatePanel scenarioSet={scenarioSet} heatStressC={heatStressC} setHeatStressC={setHeatStressC}/>} 
        {phase === "decide" && <DecidePanel decision={decision} scenarioSet={scenarioSet}/>} 
        {phase === "verify" && <VerifyPanel baselinePower={values.power} baselineEnergy={values.annualHours && values.power ? values.annualHours * values.power : null} verifiedPower={verifiedPower} verifiedEnergy={verifiedEnergy} setVerifiedPower={setVerifiedPower} setVerifiedEnergy={setVerifiedEnergy} verification={verification} observedEnergy={observedEnergy}/>} 

        <footer className="mt-6 border-t border-steel/10 pt-4 text-[9px] text-steel">
          OVERHAUL does not infer engineering outcomes from UI confidence. Every modeled consequence depends on an explicit input, reference, equation/model and evidence state. Missing CAPEX, downtime, carbon-factor or performance data stays visibly blocked.
        </footer>
      </div>
    </main>
  );
}

function phaseCopy(phase: Phase) {
  return ({ observe: "Evidence and provenance", model: "Digital twin + boundary conditions", diagnose: "Residuals → causes → measurement", simulate: "Physics-backed scenarios", decide: "Robust multi-objective choice", verify: "Before / after M&V" } as Record<Phase, string>)[phase];
}
function Status({ label, value, ok }: { label: string; value: string; ok: boolean }) { return <div className="border border-steel/15 px-3 py-3"><p className="font-mono text-[8px] uppercase tracking-[0.12em] text-steel">{label}</p><p className={`mt-2 text-[10px] ${ok ? "text-teal" : "text-amber-200"}`}>{value}</p></div>; }
function Panel({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) { return <section className="mt-5 border border-steel/15 bg-[#080c0c]"><div className="border-b border-steel/10 px-5 py-4"><p className="font-mono text-[8px] uppercase tracking-[0.16em] text-teal">{eyebrow}</p><h2 className="mt-1 font-display text-3xl">{title}</h2></div>{children}</section>; }
function ObservePanel({ assessment, observations, evidenceCount, supplemental, onAddSupplement }: { assessment: Assessment; observations: Observation[]; evidenceCount: number; supplemental: Record<string, string>; onAddSupplement: React.Dispatch<React.SetStateAction<Record<string, string>>> }) {
  return <Panel eyebrow="01 // Evidence graph" title="The asset is the evidence, not a questionnaire."><div className="grid gap-5 p-5 lg:grid-cols-[1.2fr_0.8fr]">
    <div className="border border-steel/15 p-4"><div className="flex items-center justify-between"><div><p className="font-mono text-[8px] uppercase text-steel">Captured sources</p><p className="mt-1 text-sm">{evidenceCount} source{evidenceCount === 1 ? "" : "s"} in this assessment</p></div><span className="font-mono text-[8px] uppercase text-teal">provenance preserved</span></div><div className="mt-4 space-y-2">{(assessment.evidence || []).map((item) => <div key={item.id} className="flex items-center justify-between border border-steel/10 px-3 py-3"><div><p className="text-[11px]">{item.name}</p><p className="mt-1 font-mono text-[8px] uppercase text-steel">{item.kind} · {item.type || "file"}</p></div><span className="font-mono text-[8px] text-steel">{Math.round(item.size / 1024)} KB</span></div>)}</div></div>
    <div className="border border-steel/15 p-4"><p className="font-mono text-[8px] uppercase text-steel">Extracted observations</p><div className="mt-4 max-h-[390px] space-y-2 overflow-auto">{observations.length ? observations.map((item, index) => <div key={`${item.key}-${index}`} className="border border-steel/10 px-3 py-2"><div className="flex justify-between gap-2"><span className="text-[10px]">{item.key}</span><span className="font-mono text-[8px] text-teal">{Math.round(item.confidence * 100)}%</span></div><p className="mt-1 text-xs">{typeof item.value === "number" ? formatNumber(item.value, item.unit || "") : item.value}</p><p className="mt-1 text-[8px] text-steel">{item.sourceText || "evidence extraction"}</p></div>) : <p className="text-[10px] text-steel">No extracted numeric observations yet.</p>}</div></div>
    <div className="border border-teal/20 bg-teal/[0.03] p-4 lg:col-span-2"><p className="font-mono text-[8px] uppercase text-teal">Supplemental measurement bridge</p><p className="mt-1 text-[10px] text-steel">Use this only for measurements you physically know. These values are tagged as operator-supplied and are not presented as detected facts.</p><div className="mt-4 grid gap-3 sm:grid-cols-3">{["power_kw","load_kw","capacity_kw","outdoor_temp_c","indoor_temp_c","annual_hours"].map((key) => <label key={key} className="border border-steel/10 p-3"><span className="font-mono text-[8px] uppercase text-steel">{key.replaceAll("_", " ")}</span><input value={supplemental[key] || ""} onChange={(e) => onAddSupplement((current) => ({ ...current, [key]: e.target.value }))} placeholder="known value" inputMode="decimal" className="mt-2 w-full bg-transparent text-sm outline-none placeholder:text-steel/50"/></label>)}</div></div>
  </div></Panel>;
}
function ModelPanel({ scope, values, heatStressC, setHeatStressC, carbonFactor, setCarbonFactor, baselineBuilding, baselineEquipment }: { scope: Scope; values: ModelValues; heatStressC: number; setHeatStressC: (n: number) => void; carbonFactor: number; setCarbonFactor: (n: number) => void; baselineBuilding: ReturnType<typeof simulatePhysicsScenario> extends never ? never : any; baselineEquipment: any }) {
  const buildingResult = baselineBuilding ? simulatePhysicsScenario({ subject: "building", baseline: baselineBuilding }) : null;
  const equipmentResult = baselineEquipment ? simulatePhysicsScenario({ subject: "equipment", baseline: baselineEquipment }) : null;
  const stressResult = baselineBuilding ? simulatePhysicsScenario({ subject: "building", baseline: { ...baselineBuilding, outdoorTempC: baselineBuilding.outdoorTempC + heatStressC } }) : null;
  return <Panel eyebrow="02 // Engineering model" title="Expected behavior changes when the boundary condition changes."><div className="grid gap-5 p-5 xl:grid-cols-[1.1fr_0.9fr]">
    <div className="grid gap-3 sm:grid-cols-2">{[
      ["Asset scope", scope], ["Area", formatNumber(values.area, "m²")], ["Capacity", formatNumber(values.capacity, "kW")], ["Observed load", formatNumber(values.load, "kW")], ["Observed power", formatNumber(values.power, "kW")], ["Efficiency", formatNumber(values.efficiency)], ["Indoor", formatNumber(values.indoor, "°C")], ["Outdoor", formatNumber(values.outdoor, "°C")],
    ].map(([label, value]) => <div key={label as string} className="border border-steel/10 p-4"><p className="font-mono text-[8px] uppercase text-steel">{label}</p><p className="mt-2 text-lg">{value}</p></div>)}</div>
    <div className="space-y-4"><div className="border border-steel/15 p-4"><p className="font-mono text-[8px] uppercase text-teal">Climate stress lab</p><p className="mt-1 text-[10px] text-steel">Temperature is a model input. There is no arbitrary percentage scaling of load or power.</p><div className="mt-4 flex items-center gap-4"><input type="range" min="0" max="10" step="0.5" value={heatStressC} onChange={(e) => setHeatStressC(Number(e.target.value))} className="w-full"/><span className="font-mono text-xs text-teal">+{heatStressC.toFixed(1)} °C</span></div>{stressResult && <div className="mt-4 grid grid-cols-2 gap-2"><Metric label="baseline load" value={`${buildingResult?.baseline.thermalLoadKW.toFixed(1)} kW`}/><Metric label="stressed load" value={`${stressResult.baseline.thermalLoadKW.toFixed(1)} kW`}/></div>}</div><div className="border border-steel/15 p-4"><p className="font-mono text-[8px] uppercase text-steel">Carbon conversion</p><p className="mt-1 text-[10px] text-steel">Required before operational carbon is quantified. Enter a verified factor from your electricity/source context.</p><input value={carbonFactor || ""} onChange={(e) => setCarbonFactor(Number(e.target.value) || 0)} placeholder="kgCO₂e / kWh" inputMode="decimal" className="mt-3 w-full border border-steel/10 bg-transparent p-2 text-sm outline-none"/></div></div>
    <div className="border border-steel/15 p-4 xl:col-span-2"><p className="font-mono text-[8px] uppercase text-steel">Model basis</p><div className="mt-3 grid gap-3 md:grid-cols-3"><Metric label="Annual energy" value={equipmentResult ? `${equipmentResult.baseline.annualEnergyKWh.toFixed(0)} kWh` : buildingResult ? `${buildingResult.baseline.annualEnergyKWh.toFixed(0)} kWh` : "Blocked"}/><Metric label="Utilization" value={equipmentResult ? pct(equipmentResult.baseline.utilization) : buildingResult ? pct(buildingResult.baseline.utilization) : "Blocked"}/><Metric label="Input completeness" value={`${modelCompleteness(values, scope)}%`}/></div></div>
  </div></Panel>;
}
function modelCompleteness(v: ModelValues, scope: Scope) { const keys = scope === "equipment" ? [v.load, v.capacity, v.efficiency, v.annualHours, v.rate] : [v.area, v.outdoor, v.indoor, v.efficiency, v.coolingHours, v.rate]; return Math.round(keys.filter((x) => x != null).length / keys.length * 100); }
function DiagnosePanel({ diagnosis, nextMeasurement, signals }: { diagnosis: ReturnType<typeof diagnoseResiduals>; nextMeasurement: ReturnType<typeof rankNextBestMeasurement>; signals: Array<{ key: string; observed: number; expected: number; unit?: string; toleranceRelative: number; confidence?: number }> }) { return <Panel eyebrow="03 // Residual reasoning" title="Explain the mismatch before recommending the retrofit."><div className="grid gap-5 p-5 lg:grid-cols-[1fr_0.8fr]"><div><div className="border border-steel/15 p-4"><p className="font-mono text-[8px] uppercase text-steel">Reference comparison</p><div className="mt-3 space-y-2">{signals.length ? signals.map((s) => <div key={s.key} className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-steel/10 py-2 text-[10px]"><span>{s.key}</span><span>{s.observed.toFixed(1)} {s.unit}</span><span className={Math.abs((s.observed - s.expected) / Math.max(Math.abs(s.expected), 1e-9)) > s.toleranceRelative ? "text-amber-200" : "text-teal"}>{s.expected.toFixed(1)} ref</span></div>) : <p className="text-[10px] text-steel">No independent expected signal has been established. Diagnosis is blocked rather than guessed.</p>}</div></div><div className="mt-4 space-y-3">{diagnosis.candidates.length ? diagnosis.candidates.map((candidate) => <div key={candidate.causeId} className="border border-steel/15 p-4"><div className="flex justify-between"><p className="text-sm">{candidate.cause}</p><span className="font-mono text-[8px] uppercase text-amber-200">{candidate.severity}</span></div><p className="mt-2 text-[10px] leading-5 text-steel">{candidate.consequence}</p><p className="mt-3 font-mono text-[8px] uppercase text-steel">Discriminating evidence</p><p className="mt-1 text-[10px] text-paper">{candidate.discriminatingEvidence.join(" ")}</p></div>) : <div className="border border-steel/15 p-4 text-[10px] text-steel">{diagnosis.status === "no-abnormality" ? "No abnormal residual is established against the supplied reference." : "No sufficiently specific diagnosis is established."}</div>}</div></div><div className="border border-teal/20 bg-teal/[0.03] p-5"><p className="font-mono text-[8px] uppercase text-teal">Next-best measurement</p>{nextMeasurement.recommendation ? <><p className="mt-2 font-display text-2xl">{nextMeasurement.recommendation.label}</p><p className="mt-2 text-[10px] leading-5 text-steel">{nextMeasurement.recommendation.method}</p><div className="mt-4 border border-teal/20 p-3"><p className="font-mono text-[8px] uppercase text-teal">Expected uncertainty reduction</p><p className="mt-1 text-2xl">{Math.round(nextMeasurement.recommendation.expectedUncertaintyReduction * 100)}%</p><p className="mt-1 text-[9px] text-steel">Decision impact: {nextMeasurement.recommendation.decisionImpact ? "yes" : "no"}</p></div></> : <p className="mt-2 text-[10px] text-steel">No additional measurement is prioritized from the current diagnostic state.</p>}</div></div></Panel>; }
function SimulatePanel({ scenarioSet, heatStressC, setHeatStressC }: { scenarioSet: Array<DecisionScenario & { trace: string[] }>; heatStressC: number; setHeatStressC: (n: number) => void }) { return <Panel eyebrow="04 // What-if laboratory" title="Every scenario carries a trace, and blocked scenarios stay blocked."><div className="p-5"><div className="flex flex-wrap items-center justify-between gap-3 border border-steel/15 p-4"><div><p className="font-mono text-[8px] uppercase text-steel">Boundary condition</p><p className="mt-1 text-sm">Peak heat stress: +{heatStressC.toFixed(1)} °C</p></div><input type="range" min="0" max="10" step="0.5" value={heatStressC} onChange={(e) => setHeatStressC(Number(e.target.value))} className="w-56"/></div><div className="mt-4 grid gap-3 lg:grid-cols-3">{scenarioSet.map((scenario) => <div key={scenario.id} className={`border p-4 ${scenario.feasible ? "border-teal/30" : "border-steel/15"}`}><div className="flex items-center justify-between"><p className="font-display text-xl">{scenario.name}</p><span className="font-mono text-[8px] uppercase text-steel">{scenario.feasible ? "simulated" : "gated"}</span></div><div className="mt-4 grid grid-cols-2 gap-2 text-[9px]"><Metric label="energy saved" value={scenario.annualEnergySavingKWh == null ? "—" : `${scenario.annualEnergySavingKWh.toFixed(0)} kWh/yr`}/><Metric label="cost saved" value={scenario.annualCostSavingINR == null ? "—" : `₹${scenario.annualCostSavingINR.toFixed(0)}/yr`}/></div><div className="mt-4 border-t border-steel/10 pt-3"><p className="font-mono text-[8px] uppercase text-steel">Trace</p>{scenario.trace.length ? <p className="mt-2 text-[9px] leading-5 text-steel">{scenario.trace.join(" ")}</p> : <p className="mt-2 text-[9px] text-amber-200">{scenario.blockedBy.join(" ")}</p>}</div></div>)}</div></div></Panel>; }
function DecidePanel({ decision, scenarioSet }: { decision: ReturnType<typeof evaluateRetrofitDecision>; scenarioSet: Array<DecisionScenario & { trace: string[] }> }) { return <Panel eyebrow="05 // Decision intelligence" title="Choose an action that survives uncertainty, not a prettier score."><div className="grid gap-5 p-5 xl:grid-cols-[0.95fr_1.05fr]"><div className="border border-teal/25 bg-teal/[0.04] p-5">{decision.recommendation ? <><p className="font-mono text-[8px] uppercase text-teal">Current recommendation</p><p className="mt-2 font-display text-4xl">{scenarioSet.find((x) => x.id === decision.recommendation?.scenarioId)?.name}</p><div className="mt-5 grid grid-cols-2 gap-2"><Metric label="decision score" value={decision.recommendation.score == null ? "—" : decision.recommendation.score.toFixed(2)}/><Metric label="robustness" value={decision.recommendation.robustnessPercent == null ? "—" : `${decision.recommendation.robustnessPercent}%`}/></div><div className="mt-5 space-y-2 text-[10px] text-steel">{decision.recommendation.reasons.map((reason) => <p key={reason}>• {reason}</p>)}{decision.recommendation.whyNot.map((reason) => <p key={reason} className="text-amber-200">Why not: {reason}</p>)}</div></> : <><p className="font-mono text-[8px] uppercase text-amber-200">No actionable recommendation</p><p className="mt-2 font-display text-3xl">Decision blocked.</p><p className="mt-2 text-[10px] leading-5 text-steel">The system is refusing to invent CAPEX, downtime or performance evidence.</p></>}</div><div className="border border-steel/15 p-5"><p className="font-mono text-[8px] uppercase text-steel">Counterfactual + ranking</p><div className="mt-4 space-y-2">{decision.evaluations.map((evaluation) => <div key={evaluation.scenarioId} className="flex items-center justify-between border border-steel/10 px-3 py-3"><div><p className="text-[10px]">{scenarioSet.find((x) => x.id === evaluation.scenarioId)?.name || evaluation.scenarioId}</p><p className="mt-1 font-mono text-[8px] uppercase text-steel">{evaluation.status} · {evaluation.robustnessPercent ?? 0}% robust</p></div><span className="font-mono text-xs">{evaluation.score == null ? "—" : evaluation.score.toFixed(2)}</span></div>)}</div></div></div></Panel>; }
function VerifyPanel({ baselinePower, baselineEnergy, verifiedPower, verifiedEnergy, setVerifiedPower, setVerifiedEnergy, verification, observedEnergy }: { baselinePower: number | null; baselineEnergy: number | null; verifiedPower: string; verifiedEnergy: string; setVerifiedPower: (v: string) => void; setVerifiedEnergy: (v: string) => void; verification: { powerDelta: number; powerChangePercent: number } | null; observedEnergy: number }) { return <Panel eyebrow="06 // Measurement & verification" title="The retrofit is not complete until prediction meets reality."><div className="grid gap-5 p-5 lg:grid-cols-3"><div className="border border-steel/15 p-4"><p className="font-mono text-[8px] uppercase text-steel">Baseline</p><p className="mt-3 text-2xl">{formatNumber(baselinePower, "kW")}</p><p className="mt-1 text-[9px] text-steel">Estimated from recorded annual hours × observed power: {formatNumber(baselineEnergy, "kWh/yr")}</p></div><label className="border border-steel/15 p-4"><span className="font-mono text-[8px] uppercase text-steel">Post-intervention average power</span><input value={verifiedPower} onChange={(e) => setVerifiedPower(e.target.value)} inputMode="decimal" className="mt-3 w-full bg-transparent text-2xl outline-none" placeholder="enter measured kW"/></label><label className="border border-steel/15 p-4"><span className="font-mono text-[8px] uppercase text-steel">Post-intervention measured energy</span><input value={verifiedEnergy} onChange={(e) => setVerifiedEnergy(e.target.value)} inputMode="decimal" className="mt-3 w-full bg-transparent text-2xl outline-none" placeholder="enter measured kWh"/></label>{verification && <div className="border border-teal/20 bg-teal/[0.03] p-5 lg:col-span-3"><p className="font-mono text-[8px] uppercase text-teal">Observed change</p><p className="mt-2 font-display text-3xl">{verification.powerChangePercent.toFixed(1)}%</p><p className="mt-2 text-[10px] text-steel">Power delta: {verification.powerDelta.toFixed(2)} kW. Measured energy entered: {Number.isFinite(observedEnergy) ? `${observedEnergy.toLocaleString()} kWh` : "—"}.</p></div>}</div></Panel>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="border border-steel/10 px-3 py-3"><p className="font-mono text-[7px] uppercase tracking-[0.1em] text-steel">{label}</p><p className="mt-1 text-sm">{value}</p></div>; }
