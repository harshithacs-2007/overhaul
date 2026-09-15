"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { diagnoseResiduals, rankNextBestMeasurement, evaluateRetrofitDecision, simulatePhysicsScenario, type DecisionScenario } from "@/lib/engineering";

type Scope = "building" | "facility" | "equipment";
type Stage = "evidence" | "model" | "diagnose" | "simulate" | "decide" | "verify";
type Obs = { key: string; value: number | string; unit?: string; confidence: number; evidenceId?: string; sourceText?: string };
type Extraction = { evidenceId?: string; evidenceType?: string; sourceKind?: string; sourceName?: string; observations?: Array<{ field: string; value: string; numericValue: number | null; unit: string | null; confidence: number; sourceText: string }> };
type Assessment = { assessmentSubject?: Scope; assessmentGoal?: string; industry?: string; siteName?: string | null; assetClass?: string | null; evidence?: Array<{ id: string; kind: string; name: string; type: string; size: number }> };

type Values = Record<string, number | null>;

const fieldGroups = {
  building: [
    ["floor_area_m2", "Floor area", "m²"], ["envelope_ua_w_per_k", "Envelope UA", "W/K"], ["outdoor_temp_c", "Outdoor", "°C"], ["indoor_temp_c", "Indoor", "°C"],
    ["capacity_kw", "HVAC capacity", "kW"], ["cop", "HVAC efficiency", "COP"], ["annual_cooling_hours", "Cooling hours", "h/yr"], ["electricity_rate_inr_per_kwh", "Electricity rate", "INR/kWh"],
    ["existing_r_value_m2k_w", "Existing R", "m²K/W"], ["proposed_r_value_m2k_w", "Proposed R", "m²K/W"],
  ],
  facility: [
    ["floor_area_m2", "Floor / process area", "m²"], ["envelope_ua_w_per_k", "Envelope UA", "W/K"], ["outdoor_temp_c", "Outdoor", "°C"], ["indoor_temp_c", "Indoor", "°C"],
    ["capacity_kw", "System capacity", "kW"], ["cop", "System efficiency", "COP"], ["annual_cooling_hours", "Operating hours", "h/yr"], ["electricity_rate_inr_per_kwh", "Electricity rate", "INR/kWh"],
  ],
  equipment: [
    ["load_kw", "Operating load", "kW"], ["capacity_kw", "Rated capacity", "kW"], ["efficiency", "Efficiency", "kW/kW or COP"], ["annual_hours", "Annual runtime", "h/yr"],
    ["electricity_rate_inr_per_kwh", "Electricity rate", "INR/kWh"], ["proposed_efficiency", "Proposed efficiency", "kW/kW or COP"], ["baseline_runtime_hours", "Baseline runtime", "h/yr"], ["proposed_runtime_hours", "Proposed runtime", "h/yr"],
  ],
} as const;

function canonical(field: string) { return field.toLowerCase().trim().replace(/[()\-\/]+/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_"); }
function finite(x: unknown): x is number { return typeof x === "number" && Number.isFinite(x); }
function fmt(value: number | null, unit = "") { return value == null ? "—" : `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}${unit ? ` ${unit}` : ""}`; }
function numFrom(observations: Obs[], supplemental: Values, keys: string[]) { const found = observations.find((o) => keys.includes(o.key) && finite(o.value)); if (finite(found?.value)) return found.value; for (const key of keys) if (finite(supplemental[key])) return supplemental[key] as number; return null; }
function pctOf(x: number | null, y: number | null) { return x != null && y != null && Math.abs(y) > 0 ? (x / y) * 100 : null; }

export default function UniversalDecisionWorkspaceV2() {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [extracts, setExtracts] = useState<Extraction[]>([]);
  const [stage, setStage] = useState<Stage>("evidence");
  const [supplemental, setSupplemental] = useState<Values>({});
  const [heatStress, setHeatStress] = useState(0);
  const [carbonFactor, setCarbonFactor] = useState<number | null>(null);
  const [capex, setCapex] = useState<number | null>(null);
  const [downtime, setDowntime] = useState<number | null>(null);
  const [verifiedEnergy, setVerifiedEnergy] = useState("");
  const [verifiedPower, setVerifiedPower] = useState("");

  useEffect(() => {
    try {
      setAssessment(JSON.parse(sessionStorage.getItem("overhaul:assessment") || "null"));
      setExtracts(JSON.parse(sessionStorage.getItem("overhaul:evidence-extractions") || "[]"));
      setSupplemental(JSON.parse(sessionStorage.getItem("overhaul:supplemental-values") || "{}"));
    } catch { setAssessment(null); setExtracts([]); }
  }, []);
  useEffect(() => { try { sessionStorage.setItem("overhaul:supplemental-values", JSON.stringify(supplemental)); } catch {} }, [supplemental]);

  const observations = useMemo<Obs[]>(() => extracts.flatMap((x) => (x.observations || []).map((o) => ({ key: canonical(o.field), value: o.numericValue ?? o.value, unit: o.unit || undefined, confidence: o.confidence, evidenceId: x.evidenceId, sourceText: o.sourceText }))), [extracts]);
  const scope = assessment?.assessmentSubject || "building";
  const values = useMemo<Values>(() => {
    const keys = (name: string) => numFrom(observations, supplemental, [name]);
    return {
      floor_area_m2: keys("floor_area_m2") ?? keys("floor_area"), envelope_ua_w_per_k: keys("envelope_ua_w_per_k") ?? keys("envelope_ua"),
      outdoor_temp_c: keys("outdoor_temp_c") ?? keys("design_outdoor_temp_c"), indoor_temp_c: keys("indoor_temp_c") ?? keys("temperature_c"),
      capacity_kw: keys("capacity_kw") ?? keys("rated_capacity_kw") ?? keys("hvac_capacity_kw"), load_kw: keys("load_kw") ?? keys("cooling_load_kw") ?? keys("hvac_load_kw"),
      efficiency: keys("efficiency") ?? keys("cop") ?? keys("eer"), annual_hours: keys("annual_hours") ?? keys("runtime_hours") ?? keys("annual_runtime_hours"),
      annual_cooling_hours: keys("annual_cooling_hours") ?? keys("cooling_hours"), electricity_rate_inr_per_kwh: keys("electricity_rate_inr_per_kwh") ?? keys("electricity_rate") ?? keys("tariff_inr_per_kwh"),
      existing_r_value_m2k_w: keys("existing_r_value_m2k_w") ?? keys("r_value_m2k_w"), proposed_r_value_m2k_w: keys("proposed_r_value_m2k_w"),
      proposed_efficiency: keys("proposed_efficiency") ?? keys("proposed_cop"), baseline_runtime_hours: keys("baseline_runtime_hours"), proposed_runtime_hours: keys("proposed_runtime_hours"),
      expected_power_kw: keys("expected_power_kw") ?? keys("healthy_power_kw") ?? keys("reference_power_kw") ?? keys("design_power_kw"), expected_capacity_kw: keys("expected_capacity_kw") ?? keys("healthy_capacity_kw") ?? keys("reference_capacity_kw"),
    };
  }, [observations, supplemental]);

  const buildingBase = scope !== "equipment" && values.outdoor_temp_c != null && values.indoor_temp_c != null && values.electricity_rate_inr_per_kwh != null && values.annual_cooling_hours != null && values.efficiency != null && values.capacity_kw != null
    ? { floorAreaM2: values.floor_area_m2 ?? 0, envelopeUA_W_per_K: values.envelope_ua_w_per_k ?? 0, ventilationM3s: 0, outdoorTempC: values.outdoor_temp_c, indoorTempC: values.indoor_temp_c, solarGainKW: 0, internalGainKW: 0, hvacCapacityKW: values.capacity_kw, hvacCOP: values.efficiency, annualCoolingHours: values.annual_cooling_hours, electricityRateINRPerKWh: values.electricity_rate_inr_per_kwh }
    : null;
  const equipmentBase = scope === "equipment" && values.load_kw != null && values.capacity_kw != null && values.efficiency != null && values.annual_hours != null && values.electricity_rate_inr_per_kwh != null
    ? { loadKW: values.load_kw, ratedCapacityKW: values.capacity_kw, efficiency: values.efficiency, annualHours: values.annual_hours, electricityRateINRPerKWh: values.electricity_rate_inr_per_kwh }
    : null;

  const expectedSignals = scope === "equipment" ? [
    ...(values.load_kw != null && values.expected_capacity_kw != null ? [{ key: "capacity_kw", observed: values.load_kw, expected: values.expected_capacity_kw, unit: "kW", toleranceRelative: 0.1 }] : []),
    ...(values.efficiency != null && values.proposed_efficiency != null ? [] : []),
    ...(values.capacity_kw != null && values.expected_capacity_kw != null ? [{ key: "capacity_kw", observed: values.capacity_kw, expected: values.expected_capacity_kw, unit: "kW", toleranceRelative: 0.1 }] : []),
    ...(values.expected_power_kw != null && observations.some((o) => o.key === "power_kw" && finite(o.value)) ? [{ key: "power_kw", observed: numFrom(observations, supplemental, ["power_kw"]) as number, expected: values.expected_power_kw, unit: "kW", toleranceRelative: 0.1 }] : []),
  ] : [];
  const dedupSignals = expectedSignals.filter((signal, i, arr) => arr.findIndex((x) => x.key === signal.key) === i);
  const diagnosis = diagnoseResiduals({ domain: scope === "equipment" ? "equipment" : "hvac", signals: dedupSignals });
  const nextMeasurement = rankNextBestMeasurement({ diagnostic: diagnosis, availableSignals: observations.map((o) => o.key), blockedDecisions: diagnosis.evidenceRequests });

  const simulation = useMemo(() => {
    const rows: Array<DecisionScenario & { trace: string[] }> = [{ id: "do-nothing", name: "Do nothing", capexINR: 0, annualEnergySavingKWh: 0, annualCostSavingINR: 0, annualCarbonReductionKg: carbonFactor != null ? 0 : null, downtimeHours: 0, reliabilityScore: null, comfortScore: null, feasible: true, blockedBy: [], trace: ["Counterfactual only."] }];
    if (equipmentBase) {
      if (values.proposed_efficiency != null && values.proposed_efficiency > 0 && values.proposed_efficiency !== values.efficiency) {
        const r = simulatePhysicsScenario({ subject: "equipment", baseline: equipmentBase, retrofit: { efficiency: values.proposed_efficiency } });
        const saved = Math.max(-r.delta.annualEnergyKWh, 0);
        rows.push({ id: "efficiency-upgrade", name: "Efficiency upgrade", capexINR: capex, annualEnergySavingKWh: saved, annualCostSavingINR: Math.max(r.delta.annualSavingINR, 0), annualCarbonReductionKg: carbonFactor != null ? saved * carbonFactor : null, downtimeHours: downtime, reliabilityScore: null, comfortScore: null, feasible: true, blockedBy: [], trace: ["Electrical power = load / efficiency.", `Annual energy = ${r.proposed.annualEnergyKWh.toFixed(0)} kWh.`, `Annual energy reduction = ${saved.toFixed(0)} kWh.`] });
      }
      if (values.baseline_runtime_hours != null && values.proposed_runtime_hours != null && values.proposed_runtime_hours >= 0 && values.baseline_runtime_hours !== values.proposed_runtime_hours) {
        const r = simulatePhysicsScenario({ subject: "equipment", baseline: { ...equipmentBase, annualHours: values.baseline_runtime_hours }, retrofit: { annualHours: values.proposed_runtime_hours } });
        const saved = Math.max(-r.delta.annualEnergyKWh, 0);
        rows.push({ id: "controls-runtime", name: "Controls / runtime optimisation", capexINR: capex, annualEnergySavingKWh: saved, annualCostSavingINR: Math.max(r.delta.annualSavingINR, 0), annualCarbonReductionKg: carbonFactor != null ? saved * carbonFactor : null, downtimeHours: downtime, reliabilityScore: null, comfortScore: null, feasible: true, blockedBy: [], trace: ["Annual runtime changed; load and efficiency held to the stated baseline.", `Annual energy reduction = ${saved.toFixed(0)} kWh.`] });
      }
    }
    if (buildingBase) {
      const stressed = { ...buildingBase, outdoorTempC: buildingBase.outdoorTempC + heatStress };
      const baseStress = simulatePhysicsScenario({ subject: "building", baseline: stressed });
      if (values.proposed_r_value_m2k_w != null && values.proposed_r_value_m2k_w > 0 && values.envelope_ua_w_per_k != null && values.envelope_ua_w_per_k > 0 && values.floor_area_m2 != null) {
        const proposedUA = values.floor_area_m2 / values.proposed_r_value_m2k_w;
        const r = simulatePhysicsScenario({ subject: "building", baseline: stressed, retrofit: { envelopeUA_W_per_K: proposedUA } });
        const saved = Math.max(-r.delta.annualEnergyKWh, 0);
        rows.push({ id: "envelope-insulation", name: "Envelope insulation", capexINR: capex, annualEnergySavingKWh: saved, annualCostSavingINR: Math.max(r.delta.annualSavingINR, 0), annualCarbonReductionKg: carbonFactor != null ? saved * carbonFactor : null, downtimeHours: downtime, reliabilityScore: null, comfortScore: null, feasible: true, blockedBy: [], trace: [`Peak boundary: ${stressed.outdoorTempC.toFixed(1)} °C.`, `UA changed from ${stressed.envelopeUA_W_per_K.toFixed(2)} to ${proposedUA.toFixed(2)} W/K using supplied R-value evidence.`, `Annual energy reduction = ${saved.toFixed(0)} kWh.`] });
      }
      if (values.capacity_kw != null) rows.push({ id: "capacity-check", name: "HVAC capacity resize check", capexINR: capex, annualEnergySavingKWh: 0, annualCostSavingINR: 0, annualCarbonReductionKg: carbonFactor != null ? 0 : null, downtimeHours: downtime, reliabilityScore: null, comfortScore: null, feasible: true, blockedBy: [], trace: [`Stressed thermal load recalculated at ${stressed.outdoorTempC.toFixed(1)} °C: ${baseStress.baseline.thermalLoadKW.toFixed(1)} kW.`, `Current capacity utilization: ${(baseStress.baseline.utilization * 100).toFixed(1)}%.`, "Capacity change is treated as a sizing/operability decision; no energy saving is invented."] });
    }
    return rows;
  }, [buildingBase, carbonFactor, capex, downtime, equipmentBase, heatStress, values.baseline_runtime_hours, values.capacity_kw, values.efficiency, values.envelope_ua_w_per_k, values.floor_area_m2, values.load_kw, values.proposed_efficiency, values.proposed_r_value_m2k_w, values.proposed_runtime_hours]);

  const decision = useMemo(() => evaluateRetrofitDecision({
    scenarios: simulation,
    weights: { capex: 0.2, energy: 0.35, carbon: 0.15, downtime: 0.1, reliability: 0.1, comfort: 0.1 },
    doNothingScenarioId: "do-nothing",
  }), [simulation]);
  const modelReady = scope === "equipment" ? equipmentBase != null : buildingBase != null;
  const recommended = decision.recommendation && decision.recommendation.scenarioId !== "do-nothing" ? decision.recommendation : null;
  const baselineEnergy = scope === "equipment" && values.power_kw != null && values.annual_hours != null ? values.power_kw * values.annual_hours : equipmentBase ? simulatePhysicsScenario({ subject: "equipment", baseline: equipmentBase }).baseline.annualEnergyKWh : buildingBase ? simulatePhysicsScenario({ subject: "building", baseline: buildingBase }).baseline.annualEnergyKWh : null;
  const vPower = Number(verifiedPower); const vEnergy = Number(verifiedEnergy);
  const measuredChange = Number.isFinite(vPower) && values.power_kw != null ? ((vPower - values.power_kw) / Math.max(values.power_kw, 1)) * 100 : null;

  if (!assessment) return <main className="min-h-screen bg-[#050707] p-10 text-paper">No assessment package found. <Link href="/" className="text-teal underline">Start a new assessment</Link>.</main>;

  return <main className="min-h-screen bg-[#050707] text-paper"><div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-7 lg:px-10">
    <header className="border-b border-steel/15 pb-5"><div className="flex flex-wrap items-end justify-between gap-5"><div><Link href="/" className="font-mono text-[9px] uppercase tracking-[0.16em] text-steel">← new assessment</Link><p className="mt-4 font-mono text-[9px] uppercase tracking-[0.24em] text-teal">OVERHAUL // UNIVERSAL RETROFIT INTELLIGENCE</p><h1 className="mt-1 font-display text-4xl tracking-tight sm:text-6xl">{assessment.siteName || assessment.assetClass || "Asset assessment"}</h1><p className="mt-2 text-sm text-steel">{assessment.industry || "other"} · {scope} · {assessment.assessmentGoal || "decision support"}</p></div><div className="grid grid-cols-3 gap-2"><State label="Evidence" value={`${assessment.evidence?.length || 0}`} ok={(assessment.evidence?.length || 0) > 0}/><State label="Model" value={modelReady ? "ready" : "gated"} ok={modelReady}/><State label="Decision" value={recommended ? "action" : "gated"} ok={!!recommended}/></div></div>
      <nav className="mt-5 grid gap-2 sm:grid-cols-6">{(["evidence","model","diagnose","simulate","decide","verify"] as Stage[]).map((s, i) => <button key={s} type="button" onClick={() => setStage(s)} className={`border p-3 text-left ${stage === s ? "border-teal/40 bg-teal/[0.05]" : "border-steel/15 hover:border-steel/35"}`}><span className="font-mono text-[8px] text-teal">0{i + 1}</span><span className="ml-2 font-mono text-[8px] uppercase tracking-[0.14em]">{s}</span><p className="mt-2 text-[9px] text-steel">{stageHint(s)}</p></button>)}</nav></header>

    {stage === "evidence" && <Section eyebrow="01 // Observe" title="Evidence in. Engineering facts out."><div className="grid gap-5 p-5 lg:grid-cols-[1fr_1fr]"><div><p className="font-mono text-[8px] uppercase text-steel">Sources</p><div className="mt-3 space-y-2">{(assessment.evidence || []).map((e) => <div key={e.id} className="border border-steel/10 p-3"><p className="text-[11px]">{e.name}</p><p className="mt-1 font-mono text-[8px] uppercase text-steel">{e.kind} · {e.type || "file"} · {Math.round(e.size / 1024)} KB</p></div>)}</div></div><div><p className="font-mono text-[8px] uppercase text-steel">Extracted values</p><div className="mt-3 max-h-[350px] space-y-2 overflow-auto">{observations.length ? observations.map((o, i) => <div key={`${o.key}-${i}`} className="border border-steel/10 p-3"><div className="flex justify-between"><span className="text-[10px]">{o.key}</span><span className="font-mono text-[8px] text-teal">{Math.round(o.confidence * 100)}%</span></div><p className="mt-1 text-sm">{typeof o.value === "number" ? fmt(o.value, o.unit || "") : o.value}</p><p className="mt-1 text-[8px] text-steel">{o.sourceText || "evidence extraction"}</p></div>) : <p className="text-[10px] text-steel">No extracted observations.</p>}</div></div><div className="border border-teal/15 bg-teal/[0.03] p-4 lg:col-span-2"><p className="font-mono text-[8px] uppercase text-teal">Operator-supplied measurements</p><p className="mt-1 text-[10px] text-steel">Only enter values you physically know. They remain tagged as supplemental inputs.</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{fieldGroups[scope].map(([key, label, unit]) => <label key={key} className="border border-steel/10 p-3"><span className="font-mono text-[7px] uppercase text-steel">{label} · {unit}</span><input value={supplemental[key] == null ? "" : String(supplemental[key])} onChange={(e) => setSupplemental((v) => ({ ...v, [key]: e.target.value === "" ? null : Number(e.target.value) }))} className="mt-2 w-full bg-transparent text-sm outline-none" placeholder="known value" inputMode="decimal"/></label>)}</div></div></div></Section>}
    {stage === "model" && <Section eyebrow="02 // Model" title="Digital twin + boundary conditions."><div className="grid gap-4 p-5 lg:grid-cols-3">{Object.entries(values).filter(([, v]) => v != null).map(([key, value]) => <Metric key={key} label={key.replaceAll("_", " ")} value={fmt(value)}/>)}</div><div className="grid gap-4 border-t border-steel/10 p-5 lg:grid-cols-2"><div className="border border-steel/15 p-4"><p className="font-mono text-[8px] uppercase text-teal">Climate stress</p><p className="mt-1 text-[10px] text-steel">Recalculates the physics model using a changed outdoor boundary; no percentage multiplier is applied.</p><div className="mt-4 flex items-center gap-4"><input type="range" min="0" max="10" step="0.5" value={heatStress} onChange={(e) => setHeatStress(Number(e.target.value))} className="w-full"/><span className="font-mono text-xs text-teal">+{heatStress.toFixed(1)} °C</span></div></div><div className="border border-steel/15 p-4"><p className="font-mono text-[8px] uppercase text-steel">Carbon factor</p><p className="mt-1 text-[10px] text-steel">Required before carbon is quantified.</p><input value={carbonFactor == null ? "" : String(carbonFactor)} onChange={(e) => setCarbonFactor(e.target.value === "" ? null : Number(e.target.value))} className="mt-3 w-full border border-steel/10 bg-transparent p-2" placeholder="kgCO₂e/kWh" inputMode="decimal"/></div></div></Section>}
    {stage === "diagnose" && <Section eyebrow="03 // Diagnose" title="Residual → cause → next measurement."><div className="grid gap-5 p-5 lg:grid-cols-[1.15fr_0.85fr]"><div>{diagnosis.candidates.length ? diagnosis.candidates.map((c) => <div key={c.causeId} className="mb-3 border border-steel/15 p-4"><div className="flex justify-between gap-3"><p className="text-sm">{c.cause}</p><span className="font-mono text-[8px] uppercase text-amber-200">{c.severity}</span></div><p className="mt-2 text-[10px] text-steel">{c.consequence}</p><p className="mt-3 font-mono text-[8px] uppercase text-steel">Discriminating evidence</p><p className="mt-1 text-[10px]">{c.discriminatingEvidence.join(" ")}</p></div>) : <div className="border border-steel/15 p-4 text-[10px] text-steel">{diagnosis.status === "no-abnormality" ? "No abnormal residual established." : "Diagnosis gated: an independent expected state and observed signal are required."}</div>}</div><div className="border border-teal/20 bg-teal/[0.03] p-5"><p className="font-mono text-[8px] uppercase text-teal">Next-best measurement</p>{nextMeasurement.recommendation ? <><p className="mt-2 font-display text-2xl">{nextMeasurement.recommendation.label}</p><p className="mt-2 text-[10px] leading-5 text-steel">{nextMeasurement.recommendation.method}</p><p className="mt-4 font-mono text-[8px] uppercase text-teal">Expected uncertainty reduction</p><p className="mt-1 text-3xl">{Math.round(nextMeasurement.recommendation.expectedUncertaintyReduction * 100)}%</p></> : <p className="mt-2 text-[10px] text-steel">No additional measurement is ranked from the current state.</p>}</div></div></Section>}
    {stage === "simulate" && <Section eyebrow="04 // Simulate" title="What changes, and what does not."><div className="flex flex-wrap items-center justify-between gap-4 border-b border-steel/10 p-5"><div><p className="font-mono text-[8px] uppercase text-steel">Heat boundary</p><p className="mt-1 text-sm">+{heatStress.toFixed(1)} °C</p></div><div className="grid grid-cols-2 gap-2"><label className="border border-steel/10 p-2"><span className="font-mono text-[7px] uppercase text-steel">CAPEX (verified)</span><input value={capex == null ? "" : String(capex)} onChange={(e) => setCapex(e.target.value === "" ? null : Number(e.target.value))} className="mt-1 w-28 bg-transparent text-sm outline-none" placeholder="INR"/></label><label className="border border-steel/10 p-2"><span className="font-mono text-[7px] uppercase text-steel">Downtime (verified)</span><input value={downtime == null ? "" : String(downtime)} onChange={(e) => setDowntime(e.target.value === "" ? null : Number(e.target.value))} className="mt-1 w-28 bg-transparent text-sm outline-none" placeholder="hours"/></label></div></div><div className="grid gap-3 p-5 lg:grid-cols-3">{simulation.map((s) => <div key={s.id} className={`border p-4 ${s.feasible ? "border-teal/25" : "border-steel/15"}`}><div className="flex items-center justify-between"><p className="font-display text-xl">{s.name}</p><span className="font-mono text-[8px] uppercase text-steel">{s.feasible ? "simulated" : "blocked"}</span></div><div className="mt-4 grid grid-cols-2 gap-2"><Metric label="energy saved" value={s.annualEnergySavingKWh == null ? "—" : `${s.annualEnergySavingKWh.toFixed(0)} kWh/yr`}/><Metric label="cost saved" value={s.annualCostSavingINR == null ? "—" : `₹${s.annualCostSavingINR.toFixed(0)}/yr`}/></div><p className="mt-4 border-t border-steel/10 pt-3 text-[9px] leading-5 text-steel">{s.trace.join(" ")}</p></div>)}</div></Section>}
    {stage === "decide" && <Section eyebrow="05 // Decide" title="Decision robustness without fake certainty."><div className="grid gap-5 p-5 lg:grid-cols-[0.9fr_1.1fr]"><div className="border border-teal/25 bg-teal/[0.04] p-5">{recommended ? <><p className="font-mono text-[8px] uppercase text-teal">Recommended action</p><p className="mt-2 font-display text-4xl">{simulation.find((s) => s.id === recommended.scenarioId)?.name}</p><p className="mt-4 text-[10px] text-steel">Score {recommended.score?.toFixed(2) ?? "—"} · robustness {recommended.robustnessPercent ?? 0}%</p>{recommended.reasons.map((r) => <p key={r} className="mt-2 text-[10px]">{r}</p>)}{recommended.whyNot.map((r) => <p key={r} className="mt-2 text-[10px] text-amber-200">Why not alternatives: {r}</p>)}</> : <><p className="font-mono text-[8px] uppercase text-amber-200">No defensible retrofit recommendation</p><p className="mt-2 font-display text-3xl">Evidence gate active.</p><p className="mt-2 text-[10px] leading-5 text-steel">Provide a physically supported retrofit scenario, then OVERHAUL will rank it against the counterfactual.</p></>}</div><div className="border border-steel/15 p-5"><p className="font-mono text-[8px] uppercase text-steel">Scenario ranking</p><div className="mt-4 space-y-2">{decision.evaluations.map((e) => <div key={e.scenarioId} className="flex items-center justify-between border border-steel/10 px-3 py-3"><div><p className="text-[10px]">{simulation.find((s) => s.id === e.scenarioId)?.name || e.scenarioId}</p><p className="mt-1 font-mono text-[8px] uppercase text-steel">{e.status} · {e.robustnessPercent ?? 0}% robust</p></div><span className="font-mono text-xs">{e.score == null ? "—" : e.score.toFixed(2)}</span></div>)}</div></div></div></Section>}
    {stage === "verify" && <Section eyebrow="06 // Verify" title="Prediction → intervention → measured reality."><div className="grid gap-4 p-5 lg:grid-cols-4"><Metric label="baseline power" value={fmt(values.power_kw, "kW")}/><Metric label="baseline annual energy" value={fmt(baselineEnergy, "kWh/yr")}/><label className="border border-steel/10 p-3"><span className="font-mono text-[7px] uppercase text-steel">Measured post power</span><input value={verifiedPower} onChange={(e) => setVerifiedPower(e.target.value)} className="mt-2 w-full bg-transparent text-lg outline-none" placeholder="kW" inputMode="decimal"/></label><label className="border border-steel/10 p-3"><span className="font-mono text-[7px] uppercase text-steel">Measured post energy</span><input value={verifiedEnergy} onChange={(e) => setVerifiedEnergy(e.target.value)} className="mt-2 w-full bg-transparent text-lg outline-none" placeholder="kWh" inputMode="decimal"/></label></div>{measuredChange != null && <div className="mx-5 mb-5 border border-teal/20 bg-teal/[0.03] p-5"><p className="font-mono text-[8px] uppercase text-teal">Measured change</p><p className="mt-1 font-display text-4xl">{measuredChange.toFixed(1)}%</p><p className="mt-2 text-[10px] text-steel">Power delta relative to the recorded baseline: {(vPower - (values.power_kw as number)).toFixed(2)} kW. Measured energy supplied: {Number.isFinite(vEnergy) ? `${vEnergy.toLocaleString()} kWh` : "—"}.</p></div>}</Section>}

    <footer className="mt-5 border-t border-steel/10 pt-4 text-[9px] leading-5 text-steel">Every number displayed as a modeled consequence is tied to an explicit engineering model. CAPEX, downtime, carbon factors and reference performance remain user/data supplied; OVERHAUL never invents them.</footer>
  </div></main>;
}

function stageHint(s: Stage) { return ({ evidence: "sources + observations", model: "twin + boundary conditions", diagnose: "residual + cause", simulate: "physics what-if", decide: "rank supported options", verify: "measured M&V" } as Record<Stage, string>)[s]; }
function State({ label, value, ok }: { label: string; value: string; ok: boolean }) { return <div className="border border-steel/15 px-3 py-3"><p className="font-mono text-[8px] uppercase text-steel">{label}</p><p className={`mt-2 text-[10px] ${ok ? "text-teal" : "text-amber-200"}`}>{value}</p></div>; }
function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) { return <section className="mt-5 border border-steel/15 bg-[#080c0c]"><div className="border-b border-steel/10 px-5 py-4"><p className="font-mono text-[8px] uppercase tracking-[0.16em] text-teal">{eyebrow}</p><h2 className="mt-1 font-display text-3xl">{title}</h2></div>{children}</section>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="border border-steel/10 px-3 py-3"><p className="font-mono text-[7px] uppercase tracking-[0.1em] text-steel">{label}</p><p className="mt-1 text-sm">{value}</p></div>; }
