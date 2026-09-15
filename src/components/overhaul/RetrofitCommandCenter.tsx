"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { buildTwinModel, type TwinSignal } from "@/lib/twin/domainModel";
import { rescastSurrogateStatus } from "@/lib/ml/rescastSurrogate";
import { simulateIntervention, type InterventionContext, type InterventionResult } from "@/lib/engineering/interventionEngine";
import { buildDigitalShadow, type ExpectedSignal, type ShadowObservation } from "@/lib/engineering/digitalShadow";
import { buildEquipmentReference } from "@/lib/engineering/equipmentReference";

type Scope = "building" | "facility" | "equipment";
type Extraction = { evidenceId?: string; evidenceType?: string; observations?: Array<{ field: string; value: string; numericValue: number | null; unit: string | null; confidence: number; sourceText: string }> };
type Assessment = { assessmentSubject?: Scope; assessmentGoal?: string; industry?: string; siteName?: string | null; assetClass?: string | null; evidence?: Array<{ id: string; kind: string; name: string; type: string; size: number }> };
type Tab = "retrofit" | "model" | "shadow" | "simulate";
type ActionId = "roof" | "glazing" | "shading" | "airseal" | "resize" | "eff" | "controls" | "replace";

const ACTIONS: ReadonlyArray<readonly [ActionId, string, string]> = [
  ["roof", "Roof insulation", "Envelope"],
  ["glazing", "High-performance glazing", "Envelope"],
  ["shading", "External shading", "Envelope"],
  ["airseal", "Air-tightness improvement", "Envelope"],
  ["resize", "Right-size HVAC", "HVAC"],
  ["eff", "Higher-efficiency HVAC", "HVAC"],
  ["controls", "Controls optimisation", "Controls"],
  ["replace", "Equipment replacement", "Equipment"],
];

const INTERVENTION_BY_ACTION: Record<ActionId, string | null> = {
  roof: "env.roof.insulation",
  glazing: "env.glazing.uvalue",
  shading: "env.shading.solar",
  airseal: null,
  resize: "hvac.rightsize",
  eff: "hvac.efficiency.upgrade",
  controls: "controls.runhours",
  replace: "equipment.efficiency.replace",
};

export default function RetrofitCommandCenter() {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [extracts, setExtracts] = useState<Extraction[]>([]);
  const [tab, setTab] = useState<Tab>("retrofit");
  const [actionId, setActionId] = useState<ActionId>("roof");
  const [heatStress, setHeatStress] = useState(0);
  const [selectedAsset, setSelectedAsset] = useState("asset-core");

  useEffect(() => {
    try {
      setAssessment(JSON.parse(sessionStorage.getItem("overhaul:assessment") || "null"));
      setExtracts(JSON.parse(sessionStorage.getItem("overhaul:evidence-extractions") || "[]"));
    } catch {
      setAssessment(null);
      setExtracts([]);
    }
  }, []);

  const scope = assessment?.assessmentSubject || "building";
  const industry = assessment?.industry || "other";
  const observations = useMemo<TwinSignal[]>(() => extracts.flatMap((x) => (x.observations || []).map((o) => ({
    key: canonical(o.field), value: o.numericValue ?? o.value, unit: o.unit || undefined,
    confidence: o.confidence, source: x.evidenceType === "document" ? "documented" : "ocr", sourceText: o.sourceText, evidenceId: x.evidenceId,
  }))), [extracts]);
  const twin = useMemo(() => buildTwinModel({ scope, industry, title: assessment?.siteName || assessment?.assetClass || `${scope} assessment`, evidence: assessment?.evidence || [], observations }), [assessment, industry, observations, scope]);
  const getNum = (keys: string[]) => { const hit = observations.find((o) => keys.includes(o.key) && typeof o.value === "number" && Number.isFinite(o.value)); return typeof hit?.value === "number" ? hit.value : null; };
  const metrics = {
    area: getNum(["floor_area_m2", "floor_area"]),
    capacity: getNum(["rated_capacity_kw", "capacity_kw"]),
    power: getNum(["power_kw"]),
    load: getNum(["cooling_load_kw", "hvac_load_kw", "load_kw"]),
    indoor: getNum(["indoor_temp_c", "temperature_c"]),
    efficiency: getNum(["efficiency", "cop", "eer"]),
    annualHours: getNum(["annual_hours", "runtime_hours", "annual_runtime_hours"]),
    coolingHours: getNum(["annual_cooling_hours", "cooling_hours"]),
    electricityRate: getNum(["electricity_rate_inr_per_kwh", "electricity_rate", "tariff_inr_per_kwh"]),
    outdoor: getNum(["outdoor_temp_c", "design_outdoor_temp_c"]),
    existingR: getNum(["existing_r_value_m2k_w", "r_value_m2k_w"]),
    insulationThickness: getNum(["added_insulation_thickness_m"]),
    insulationK: getNum(["insulation_conductivity_w_mk", "conductivity_w_mk"]),
    glazingArea: getNum(["glazing_area_m2"]),
    glazingUOld: getNum(["baseline_glazing_u_w_m2k", "glazing_u_old"]),
    glazingUNew: getNum(["proposed_glazing_u_w_m2k", "glazing_u_new"]),
    solarOld: getNum(["baseline_solar_heat_gain_kw"]),
    solarNew: getNum(["proposed_solar_heat_gain_kw"]),
    proposedEfficiency: getNum(["proposed_efficiency", "proposed_cop"]),
    proposedCapacity: getNum(["proposed_capacity_kw"]),
    baselineRuntime: getNum(["baseline_runtime_hours"]),
    proposedRuntime: getNum(["proposed_runtime_hours"]),
    expectedPower: getNum(["expected_power_kw", "healthy_power_kw", "reference_power_kw", "design_power_kw"]),
    expectedLoad: getNum(["expected_load_kw", "healthy_load_kw", "reference_load_kw", "design_load_kw"]),
    expectedCapacity: getNum(["expected_capacity_kw", "healthy_capacity_kw", "reference_capacity_kw", "design_capacity_kw"]),
    expectedIndoor: getNum(["expected_indoor_temp_c", "healthy_indoor_temp_c", "reference_indoor_temp_c"]),
  };
  const action = ACTIONS.find((a) => a[0] === actionId) || ACTIONS[0];
  const interventionId = INTERVENTION_BY_ACTION[actionId];
  const interventionContext = buildInterventionContext(metrics, heatStress);
  const interventionResult: InterventionResult | null = interventionId ? simulateIntervention(interventionId, interventionContext) : null;
  const scenarioLoad = scenarioLoadFromResult(metrics.load, interventionResult, heatStress);
  const scenarioPower = scenarioPowerFromResult(metrics.power, interventionResult, heatStress);
  const headroom = metrics.capacity != null && scenarioLoad != null ? metrics.capacity - scenarioLoad : null;
  const shadow = makeShadow(scope, metrics, extracts);
  const sequence = scope === "equipment" ? ["Condition diagnosis", "Evidence-gated replacement", "Controls optimisation", "Capacity verification"] : ["Envelope heat-flow reduction", "HVAC capacity / efficiency check", "Controls optimisation", "Post-implementation verification"];
  const ml = rescastSurrogateStatus();

  useEffect(() => {
    try {
      if (interventionResult) sessionStorage.setItem("overhaul:latest-intervention", JSON.stringify(interventionResult));
    } catch {
      // Session storage is an optional audit bridge; the current calculation remains local.
    }
  }, [interventionResult]);

  if (!assessment) return <main className="min-h-screen bg-navy p-12 text-center text-steel">No assessment package found. <Link href="/" className="text-teal underline">Start a new assessment</Link>.</main>;

  return <main className="min-h-screen bg-navy text-paper"><div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8">
    <header className="flex flex-col gap-4 border-b border-steel/20 pb-5 xl:flex-row xl:items-end xl:justify-between"><div><Link href="/" className="font-mono text-[9px] uppercase tracking-[0.16em] text-steel">← new assessment</Link><p className="mt-4 font-mono text-[10px] uppercase tracking-[0.24em] text-teal">OVERHAUL // RETROFIT INTELLIGENCE ENGINE</p><h1 className="font-display mt-1 text-4xl tracking-tight sm:text-6xl">{assessment.siteName || assessment.assetClass || "Retrofit assessment"}</h1><p className="mt-2 text-sm text-steel">{industry} · {scope} · objective: {assessment.assessmentGoal || "retrofit"}</p></div><div className="grid grid-cols-3 gap-2"><Badge label="Evidence" value={`${assessment.evidence?.length || 0}`} /><Badge label="Model confidence" value={`${twin.confidence}%`} /><Badge label="RESCAST" value={ml.available ? "trained model" : "training-ready"} /></div></header>
    <div className="mt-5 flex flex-wrap items-center gap-2 border border-steel/20 bg-black/10 p-3 font-mono text-[9px] uppercase tracking-[0.12em] text-steel"><span>Evidence</span><span>→</span><span>Asset model</span><span>→</span><span>Expected state</span><span>↔</span><span>Actual state</span><span>→</span><span className="text-teal">Residual</span><span>→</span><span>Engineering model</span><span>→</span><span className="text-paper">Decision</span></div>
    <nav className="mt-5 grid gap-2 sm:grid-cols-4">{(["retrofit","model","shadow","simulate"] as Tab[]).map((v,i)=><button key={v} type="button" onClick={()=>setTab(v)} className={`border p-3 text-left font-mono text-[9px] uppercase tracking-[0.12em] ${tab===v?"border-teal bg-teal/5 text-teal":"border-steel/20 text-steel hover:text-paper"}`}>0{i+1} · {v==="retrofit"?"Retrofit overview":v==="model"?"Asset model":v==="shadow"?"Digital Shadow":"Coupled what-if"}</button>)}</nav>
    {tab==="retrofit"?<RetrofitView sequence={sequence} twin={twin} metrics={metrics}/>:null}
    {tab==="model"?<ModelView twin={twin} metrics={metrics} selectedAsset={selectedAsset} setSelectedAsset={setSelectedAsset}/>:null}
    {tab==="shadow"?<ShadowView shadow={shadow}/>:null}
    {tab==="simulate"?<SimulationView action={action} actionId={actionId} setActionId={setActionId} heatStress={heatStress} setHeatStress={setHeatStress} result={interventionResult} baseLoad={metrics.load} basePower={metrics.power} scenarioLoad={scenarioLoad} scenarioPower={scenarioPower} headroom={headroom} capacity={metrics.capacity}/>:null}
    <section className="mt-5 grid gap-3 md:grid-cols-4"><Card title="Current thermal load" value={metrics.load!=null?`${metrics.load.toFixed(1)} kW`:"Not established"} note="measured / validated evidence"/><Card title="Current operating power" value={metrics.power!=null?`${metrics.power.toFixed(1)} kW`:"Not established"} note="meter / evidence-derived"/><Card title="Post-intervention load" value={scenarioLoad!=null?`${scenarioLoad.toFixed(1)} kW`:"Evidence required"} note="deterministic intervention model"/><Card title="Capacity headroom" value={headroom!=null?`${headroom.toFixed(1)} kW`:"Needs load + capacity"} note="post-action check"/></section>
  </div></main>;
}

function buildInterventionContext(m: Record<string, number | null>, stress: number): InterventionContext {
  const outdoor = m.outdoor != null ? m.outdoor + stress * 0.1 : null;
  return {
    floorAreaM2: m.area ?? undefined,
    outdoorTempC: outdoor ?? undefined,
    indoorTempC: m.indoor ?? undefined,
    hvacCapacityKW: m.capacity ?? undefined,
    hvacCOP: m.efficiency ?? undefined,
    annualCoolingHours: m.coolingHours ?? undefined,
    loadKW: m.load ?? undefined,
    ratedCapacityKW: m.capacity ?? undefined,
    efficiency: m.efficiency ?? undefined,
    annualHours: m.annualHours ?? undefined,
    electricityRateINRPerKWh: m.electricityRate ?? undefined,
    existingRValue_m2K_W: m.existingR ?? undefined,
    addedInsulationThicknessM: m.insulationThickness ?? undefined,
    insulationConductivity_W_mK: m.insulationK ?? undefined,
    baselineGlazingU_W_m2K: m.glazingUOld ?? undefined,
    proposedGlazingU_W_m2K: m.glazingUNew ?? undefined,
    glazingAreaM2: m.glazingArea ?? undefined,
    baselineSolarHeatGainKW: m.solarOld ?? undefined,
    proposedSolarHeatGainKW: m.solarNew ?? undefined,
    baselineEfficiency: m.efficiency ?? undefined,
    proposedEfficiency: m.proposedEfficiency ?? undefined,
    proposedCapacityKW: m.proposedCapacity ?? undefined,
    baselineRuntimeHours: m.baselineRuntime ?? undefined,
    proposedRuntimeHours: m.proposedRuntime ?? undefined,
  };
}

function scenarioLoadFromResult(baseLoad: number | null, result: InterventionResult | null, stress: number): number | null {
  if (baseLoad == null) return null;
  if (!result || result.status !== "simulated") return baseLoad;
  if (result.thermalDeltaKW == null) return baseLoad * (1 + stress / 1000);
  return Math.max(baseLoad + result.thermalDeltaKW + (baseLoad * stress / 1000), 0);
}

function scenarioPowerFromResult(basePower: number | null, result: InterventionResult | null, stress: number): number | null {
  if (basePower == null) return null;
  if (!result || result.status !== "simulated") return basePower * (1 + stress / 1000);
  if (result.electricalPowerDeltaKW == null) return basePower * (1 + stress / 1000);
  return Math.max(basePower + result.electricalPowerDeltaKW + (basePower * stress / 1200), 0);
}

function RetrofitView({sequence,twin,metrics}:{sequence:string[];twin:ReturnType<typeof buildTwinModel>;metrics:Record<string,number|null>}){return <section className="mt-5 grid gap-5 xl:grid-cols-[1.25fr_0.85fr]"><div className="border border-teal/25 bg-teal/5 p-6"><p className="font-mono text-[9px] uppercase text-teal">Retrofit engine</p><h2 className="font-display mt-1 text-4xl">Reduce the load. Then change the machine.</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-steel">OVERHAUL links envelope, HVAC and equipment decisions through one model. Evidence builds the asset representation; deterministic intervention models calculate consequences only when the required parameters are available.</p><div className="mt-6 grid gap-3 sm:grid-cols-3"><Insight label="Model confidence" value={`${twin.confidence}%`} note="evidence coverage"/><Insight label="Area" value={metrics.area!=null?`${metrics.area.toFixed(0)} m²`:"unknown"} note="geometry evidence"/><Insight label="HVAC capacity" value={metrics.capacity!=null?`${metrics.capacity.toFixed(1)} kW`:"unknown"} note="nameplate / validated"/></div></div><div className="border border-steel/20 p-5"><p className="font-mono text-[9px] uppercase text-teal">Recommended sequence</p><div className="mt-4 space-y-2">{sequence.map((s,i)=><div key={s} className="flex items-center gap-3 border border-steel/15 p-3"><span className="font-mono text-[9px] text-teal">0{i+1}</span><span className="text-sm">{s}</span></div>)}</div></div></section>}

function ModelView({twin,metrics,selectedAsset,setSelectedAsset}:{twin:ReturnType<typeof buildTwinModel>;metrics:Record<string,number|null>;selectedAsset:string;setSelectedAsset:(id:string)=>void}){return <section className="mt-5 grid gap-5 xl:grid-cols-[1.7fr_0.75fr]"><div className="border border-steel/20 bg-black/15 p-5"><p className="font-mono text-[9px] uppercase text-teal">Asset reconstruction</p><h2 className="font-display mt-1 text-3xl">The model behind the retrofit calculation.</h2><p className="mt-2 text-xs leading-5 text-steel">The same semantic graph drives the browser visualization and Blender/CAD export. Complex assets are built progressively; unknown dimensions are never silently invented.</p><div className="mt-5 overflow-hidden border border-steel/20 bg-[radial-gradient(circle_at_50%_45%,rgba(52,211,188,0.08),transparent_35%)]"><svg viewBox="0 0 120 78" className="h-[450px] w-full text-paper"><polygon points="10,61 60,17 110,34 59,76" fill="currentColor" fillOpacity="0.025" stroke="currentColor" strokeOpacity="0.22"/><polygon points="10,61 10,26 60,2 60,17" fill="none" stroke="currentColor" strokeOpacity="0.12"/><polygon points="60,17 110,34 110,64 59,76" fill="none" stroke="currentColor" strokeOpacity="0.12"/>{twin.assets.map(a=>{const x=7+a.x*.9,y=5+a.y*.78,w=Math.max(9,a.width*.72),h=Math.max(6,a.height*.5);return <g key={a.id} onClick={()=>setSelectedAsset(a.id)} className="cursor-pointer"><rect x={x} y={y} width={w} height={h} fill="currentColor" fillOpacity={selectedAsset===a.id?.08:0} stroke="currentColor" strokeOpacity={selectedAsset===a.id?.75:.24} strokeWidth=".7"/><text x={x+1.4} y={y+3.5} fontSize="2.8" fill="currentColor" fillOpacity=".72">{a.label}</text></g>})}{Array.from({length:4}).map((_,i)=><motion.path key={i} d={`M29,44 C46,${31+i*4} 66,${51-i*2} ${92-i},${38+i*2}`} fill="none" stroke="currentColor" strokeOpacity=".22" strokeWidth=".5" animate={{pathLength:[0,1,0]}} transition={{duration:2.4+i*.3,repeat:Infinity,delay:i*.18}}/>)}</svg></div></div><div className="space-y-3"><Card title="Conditioned area" value={metrics.area!=null?`${metrics.area.toFixed(0)} m²`:"Unknown"} note="geometry / document evidence"/><Card title="Rated capacity" value={metrics.capacity!=null?`${metrics.capacity.toFixed(1)} kW`:"Unknown"} note="nameplate / validated reference"/><Card title="Operating power" value={metrics.power!=null?`${metrics.power.toFixed(1)} kW`:"Unknown"} note="measured evidence"/><div className="border border-clay/25 bg-clay/5 p-4"><p className="font-mono text-[9px] uppercase text-clay">Uncertainty</p><p className="mt-2 text-xs leading-5">{twin.unknowns.length?twin.unknowns.join(" · "):"No blocking unknowns for the current representation."}</p></div></div></section>}

function ShadowView({shadow}:{shadow:Array<{key:string;observed:number|null;expected:number|null;unit:string;residual:number|null;basis:string}>}){return <section className="mt-5 space-y-4"><div className="border border-steel/20 p-5"><p className="font-mono text-[9px] uppercase text-teal">Digital Shadow</p><h2 className="font-display mt-1 text-3xl">Does the real asset behave like it should?</h2><p className="mt-2 max-w-4xl text-sm text-steel">Expected values come from an independent physics/reference basis. Actual values come from the scanned asset's evidence. Their difference is the residual used for diagnosis.</p></div><div className="grid gap-3 md:grid-cols-4">{shadow.map(s=><Card key={s.key} title={s.key} value={s.observed!=null?`${s.observed.toFixed(1)} ${s.unit}`:"Unknown"} note={s.expected!=null?`expected ${s.expected.toFixed(1)} ${s.unit} · residual ${((s.residual||0)*100).toFixed(1)}%`:s.basis}/>)}</div><div className="border border-steel/20 p-5"><p className="font-mono text-[9px] uppercase text-steel">Diagnosis path</p><div className="mt-4 grid gap-2 sm:grid-cols-5">{["Observed signal","Independent expectation","Residual","Cause candidates","Evidence request"].map((s,i)=><div key={s} className="border border-steel/15 p-3"><p className="font-mono text-[8px] text-teal">0{i+1}</p><p className="mt-2 text-xs">{s}</p></div>)}</div></div></section>}

function SimulationView({action,actionId,setActionId,heatStress,setHeatStress,result,baseLoad,basePower,scenarioLoad,scenarioPower,headroom,capacity}:{action:typeof ACTIONS[number];actionId:ActionId;setActionId:(x:ActionId)=>void;heatStress:number;setHeatStress:(x:number)=>void;result:InterventionResult|null;baseLoad:number|null;basePower:number|null;scenarioLoad:number|null;scenarioPower:number|null;headroom:number|null;capacity:number|null}){return <section className="mt-5 grid gap-5 xl:grid-cols-[.82fr_1.18fr]"><div className="border border-steel/20 p-5"><p className="font-mono text-[9px] uppercase text-teal">Scenario editor</p><h2 className="font-display mt-1 text-3xl">Change the retrofit. Watch the consequences.</h2><div className="mt-5 space-y-2">{ACTIONS.map(a=><button key={a[0]} type="button" onClick={()=>setActionId(a[0])} className={`w-full border p-3 text-left ${a[0]===actionId?"border-teal bg-teal/5":"border-steel/15 hover:border-steel/40"}`}><div className="flex items-center justify-between"><span className="text-sm">{a[1]}</span><span className="font-mono text-[8px] uppercase text-steel">{a[2]}</span></div><p className="mt-1 text-[10px] text-steel">{INTERVENTION_BY_ACTION[a[0]] ? "deterministic engineering model" : "evidence model pending"}</p></button>)}</div><label className="mt-6 block"><div className="flex justify-between font-mono text-[9px] uppercase text-steel"><span>Extreme heat stress</span><span>+{heatStress}%</span></div><input type="range" min="0" max="40" value={heatStress} onChange={e=>setHeatStress(Number(e.target.value))} className="mt-2 w-full"/></label></div><div className="border border-teal/25 bg-teal/5 p-5"><p className="font-mono text-[9px] uppercase text-teal">Coupled result</p><h2 className="font-display mt-1 text-3xl">{action[1]}</h2><div className="mt-4 flex flex-wrap gap-2">{result ? <Badge label="Status" value={result.status}/>:<Badge label="Status" value="model pending"/>}{result?.missingInputs.length ? <Badge label="Missing" value={`${result.missingInputs.length} inputs`}/>:null}</div><div className="mt-6 grid gap-3 sm:grid-cols-2"><Scenario label="Thermal load" before={baseLoad!=null?`${baseLoad.toFixed(1)} kW`:"—"} after={scenarioLoad!=null?`${scenarioLoad.toFixed(1)} kW`:"needs evidence"}/><Scenario label="Electrical power" before={basePower!=null?`${basePower.toFixed(1)} kW`:"—"} after={scenarioPower!=null?`${scenarioPower.toFixed(1)} kW`:"needs evidence"}/><Scenario label="Installed capacity" before={capacity!=null?`${capacity.toFixed(1)} kW`:"—"} after={headroom!=null?`${headroom.toFixed(1)} kW headroom`:"needs load + capacity"}/><Scenario label="Climate case" before="baseline" after={`+${heatStress}% stress`}/></div>{result ? <div className="mt-5 grid gap-3 md:grid-cols-3"><Mini title="Equation" value={result.equation}/><Mini title="Annual energy" value={result.annualEnergyDeltaKWh!=null?`${result.annualEnergyDeltaKWh.toFixed(0)} kWh`:"not quantified"}/><Mini title="Annual saving" value={result.annualSavingINR!=null?`₹${Math.round(result.annualSavingINR).toLocaleString("en-IN")}`:"not quantified"}/></div>:null}<p className="mt-5 border border-steel/20 p-4 text-sm leading-6">Intervention → physical consequence → equipment demand → energy → cost → portfolio decision. No numeric savings are shown until required evidence is present.</p></div></section>}

function makeShadow(scope:Scope, m:Record<string,number|null>, extracts:Extraction[]){
  const shadowObservations: ShadowObservation[] = extracts.flatMap((extract) => (extract.observations ?? []).map((observation) => ({
    key: canonical(observation.field),
    value: observation.numericValue,
    unit: observation.unit ?? "",
    source: observationSource(extract.evidenceType),
    confidence: Number.isFinite(observation.confidence) ? observation.confidence : 0,
  })).filter((item): item is ShadowObservation => typeof item.value === "number" && Number.isFinite(item.value)));

  const expectedSignals: ExpectedSignal[] = [];
  if (m.expectedLoad != null) expectedSignals.push({ key: "cooling_load_kw", expected: m.expectedLoad, unit: "kW", toleranceRelative: 0.1, basis: "explicit expected / healthy / reference load supplied in evidence" });
  if (m.expectedCapacity != null) expectedSignals.push({ key: "rated_capacity_kw", expected: m.expectedCapacity, unit: "kW", toleranceRelative: 0.1, basis: "explicit expected / healthy / reference capacity supplied in evidence" });
  if (m.expectedIndoor != null) expectedSignals.push({ key: "indoor_temp_c", expected: m.expectedIndoor, unit: "°C", toleranceRelative: 0.05, basis: "explicit expected / healthy indoor temperature supplied in evidence" });

  if (scope === "equipment") {
    const referenceEvidence = extracts.map((extract) => ({
      evidenceId: extract.evidenceId,
      evidenceType: extract.evidenceType,
      observations: (extract.observations ?? []).map((observation) => ({
        field: observation.field,
        value: observation.numericValue == null ? "" : String(observation.numericValue),
        numericValue: observation.numericValue,
        unit: observation.unit,
        sourceText: observation.sourceText,
      })),
    }));
    const reference = buildEquipmentReference(referenceEvidence);
    for (const expected of reference) {
      expectedSignals.push({
        key: expected.key,
        expected: expected.expected,
        unit: expected.unit,
        toleranceRelative: expected.toleranceRelative,
        basis: expected.reference.basis,
      });
    }
  }

  const result = buildDigitalShadow(scope, shadowObservations, dedupeExpected(expectedSignals));
  const signalsByKey = new Map(result.signals.map((signal) => [signal.key, signal]));
  const expectedByKey = new Map(expectedSignals.map((signal) => [signal.key, signal]));
  const observedKeys = scope === "equipment"
    ? ["power_kw"]
    : ["indoor_temp_c", "cooling_load_kw", "power_kw", "rated_capacity_kw"];

  return observedKeys.map((key) => {
    const matched = signalsByKey.get(key);
    const expected = expectedByKey.get(key);
    const observed = shadowObservations.find((item) => item.key === key)?.value ?? null;
    return sig(
      labelForShadowKey(key),
      observed,
      matched?.expected ?? null,
      expected?.unit ?? unitForShadowKey(key),
      matched?.basis ?? result.unknowns.includes(key) ? `Evidence required: ${result.nextEvidence[0] ?? "provide an independent reference value"}` : "independent reference",
    );
  });
}

function observationSource(evidenceType?: string): ShadowObservation["source"] {
  const text = (evidenceType ?? "").toLowerCase();
  if (text.includes("measure") || text.includes("meter") || text.includes("telemetry")) return "measured";
  if (text.includes("document") || text.includes("bill") || text.includes("manual")) return "document";
  if (text.includes("vision") || text.includes("photo") || text.includes("image")) return "vision";
  if (text.includes("ocr")) return "ocr";
  if (text.includes("infer")) return "inferred";
  return "unknown";
}

function dedupeExpected(signals: ExpectedSignal[]): ExpectedSignal[] {
  const seen = new Set<string>();
  return signals.filter((signal) => {
    const key = `${signal.key}:${signal.unit}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function labelForShadowKey(key:string){return key.replaceAll("_", " ")}
function unitForShadowKey(key:string){if(key.includes("temp"))return "°C";if(key.includes("capacity")||key.includes("load")||key.includes("power"))return "kW";return ""}
function sig(key:string,observed:number|null,expected:number|null,unit:string,basis:string){return {key,observed,expected,unit,residual:observed!=null&&expected!=null?(observed-expected)/Math.max(Math.abs(expected),1e-9):null,basis}}
function canonical(field:string){const x=field.toLowerCase().replaceAll(" ","_");if(x.includes("expected")&&x.includes("power"))return"expected_power_kw";if(x.includes("healthy")&&x.includes("power"))return"healthy_power_kw";if(x.includes("reference")&&x.includes("power"))return"reference_power_kw";if(x.includes("design")&&x.includes("power"))return"design_power_kw";if(x.includes("expected")&&x.includes("load"))return"expected_load_kw";if(x.includes("healthy")&&x.includes("load"))return"healthy_load_kw";if(x.includes("reference")&&x.includes("load"))return"reference_load_kw";if(x.includes("design")&&x.includes("load"))return"design_load_kw";if(x.includes("expected")&&x.includes("capacity"))return"expected_capacity_kw";if(x.includes("healthy")&&x.includes("capacity"))return"healthy_capacity_kw";if(x.includes("reference")&&x.includes("capacity"))return"reference_capacity_kw";if(x.includes("design")&&x.includes("capacity"))return"design_capacity_kw";if(x.includes("expected")&&x.includes("indoor")&&x.includes("temp"))return"expected_indoor_temp_c";if(x.includes("healthy")&&x.includes("indoor")&&x.includes("temp"))return"healthy_indoor_temp_c";if(x.includes("reference")&&x.includes("indoor")&&x.includes("temp"))return"reference_indoor_temp_c";if(x.includes("floor")&&x.includes("area"))return"floor_area_m2";if(x.includes("rated")&&x.includes("capacity"))return"rated_capacity_kw";if(x.includes("capacity")&&x.includes("kw"))return"capacity_kw";if(x.includes("power"))return"power_kw";if(x.includes("cooling")&&x.includes("load"))return"cooling_load_kw";if(x.includes("hvac")&&x.includes("load"))return"hvac_load_kw";if(x.includes("indoor")&&x.includes("temp"))return"indoor_temp_c";if(x.includes("outdoor")&&x.includes("temp"))return"outdoor_temp_c";if(x.includes("temperature")&&x.includes("c"))return"temperature_c";if(x.includes("annual")&&x.includes("cool"))return"annual_cooling_hours";if(x.includes("annual")&&x.includes("runtime"))return"annual_runtime_hours";if(x.includes("runtime")&&x.includes("baseline"))return"baseline_runtime_hours";if(x.includes("runtime")&&x.includes("proposed"))return"proposed_runtime_hours";if(x.includes("efficiency"))return"efficiency";if(x.includes("cop"))return"cop";if(x.includes("electricity")&&x.includes("rate"))return"electricity_rate_inr_per_kwh";return x}
function Badge({label,value}:{label:string;value:string}){return <div className="border border-steel/20 px-3 py-2"><p className="font-mono text-[8px] uppercase text-steel">{label}</p><p className="mt-1 font-mono text-xs">{value}</p></div>}
function Card({title,value,note}:{title:string;value:string;note:string}){return <div className="border border-steel/20 p-4"><p className="font-mono text-[9px] uppercase text-steel">{title}</p><p className="mt-2 text-xl">{value}</p><p className="mt-1 text-[10px] leading-4 text-steel">{note}</p></div>}
function Insight({label,value,note}:{label:string;value:string;note:string}){return <div className="border border-steel/15 p-3"><p className="font-mono text-[8px] uppercase text-steel">{label}</p><p className="mt-2 text-lg">{value}</p><p className="mt-1 text-[10px] text-steel">{note}</p></div>}
function Scenario({label,before,after}:{label:string;before:string;after:string}){return <div className="border border-steel/15 p-4"><p className="font-mono text-[9px] uppercase text-steel">{label}</p><div className="mt-3 grid grid-cols-2 gap-3"><div><p className="text-[8px] uppercase text-steel">Baseline</p><p className="mt-1 text-lg">{before}</p></div><div><p className="text-[8px] uppercase text-steel">Scenario</p><p className="mt-1 text-lg text-teal">{after}</p></div></div></div>}
function Mini({title,value}:{title:string;value:string}){return <div className="border border-steel/15 p-3"><p className="font-mono text-[8px] uppercase text-steel">{title}</p><p className="mt-2 text-xs leading-5 text-paper">{value}</p></div>}
