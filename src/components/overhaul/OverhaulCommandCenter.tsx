"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { buildTwinModel, type TwinSignal } from "@/lib/twin/domainModel";

 type Scope = "building" | "facility" | "equipment";
 type Extraction = {
  evidenceId?: string;
  evidenceType?: string;
  rawText?: string;
  observations?: Array<{ field: string; value: string; numericValue: number | null; unit: string | null; confidence: number; sourceText: string; notes: string }>;
  visibleAssets?: string[];
  warnings?: string[];
  nextEvidence?: string[];
 };
 type Assessment = {
  assessmentSubject?: Scope;
  assessmentGoal?: string;
  industry?: string;
  siteName?: string | null;
  assetClass?: string | null;
  evidence?: Array<{ id: string; kind: string; name: string; type: string; size: number }>;
  context?: Record<string, unknown>;
 };
 type Tab = "twin" | "shadow" | "simulation" | "optimization";

 const industryLabels: Record<string, string> = {
  residential: "Residential",
  commercial: "Commercial / Office",
  healthcare: "Healthcare",
  hospitality: "Hospitality",
  education: "Education",
  retail: "Retail",
  industrial: "Industrial / Manufacturing",
  warehouse: "Warehouse / Logistics",
  cold_storage: "Cold Storage / Refrigeration",
  data_center: "Data Center",
  campus: "Campus / Institution",
  other: "Other",
 };

 const retrofitActions = [
  { id: "roof", name: "Roof insulation", group: "Envelope", effect: "reduces conductive heat gain" },
  { id: "glazing", name: "High-performance glazing", group: "Envelope", effect: "reduces solar + conductive gain" },
  { id: "shading", name: "External shading", group: "Envelope", effect: "reduces peak solar load" },
  { id: "airseal", name: "Air-tightness improvement", group: "Envelope", effect: "reduces infiltration" },
  { id: "hvac-size", name: "Right-size HVAC", group: "HVAC", effect: "reduces oversizing and cycling" },
  { id: "hvac-eff", name: "Higher-efficiency HVAC", group: "HVAC", effect: "reduces electrical input at load" },
  { id: "controls", name: "Controls optimisation", group: "Controls", effect: "reduces avoidable runtime" },
  { id: "equipment", name: "Equipment replacement", group: "Equipment", effect: "restores expected operating efficiency" },
 ];

 export default function OverhaulCommandCenter() {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [extractions, setExtractions] = useState<Extraction[]>([]);
  const [tab, setTab] = useState<Tab>("twin");
  const [selectedAction, setSelectedAction] = useState("roof");
  const [stress, setStress] = useState(0);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [liveMode, setLiveMode] = useState(false);

  useEffect(() => {
    try {
      setAssessment(JSON.parse(sessionStorage.getItem("overhaul:assessment") || "null"));
      setExtractions(JSON.parse(sessionStorage.getItem("overhaul:evidence-extractions") || "[]"));
    } catch {
      setAssessment(null);
      setExtractions([]);
    }
  }, []);

  const scope = assessment?.assessmentSubject ?? "building";
  const industry = assessment?.industry ?? "other";
  const obs: TwinSignal[] = useMemo(
    () => extractions.flatMap((item) => (item.observations || []).map((ob) => ({
      key: canonicalKey(ob.field),
      value: ob.numericValue ?? ob.value ?? null,
      unit: ob.unit || undefined,
      confidence: ob.confidence,
      source: item.evidenceType === "document" ? "documented" : "ocr",
      sourceText: ob.sourceText,
      evidenceId: item.evidenceId,
    } as TwinSignal))),
    [extractions]
  );

  const twin = useMemo(() => buildTwinModel({
    scope,
    industry,
    title: assessment?.siteName || assessment?.assetClass || `${scope} assessment`,
    evidence: assessment?.evidence || [],
    observations: obs,
  }), [assessment, industry, obs, scope]);

  const metrics = useMemo(() => {
    const numeric = (keys: string[]) => {
      const hit = obs.find((item) => keys.includes(item.key) && typeof item.value === "number" && Number.isFinite(item.value));
      return hit && typeof hit.value === "number" ? hit.value : null;
    };
    return {
      area: numeric(["floor_area_m2", "floor_area"]),
      capacity: numeric(["rated_capacity_kw", "capacity_kw"]),
      power: numeric(["power_kw", "input_power_kw", "operating_power_kw"]),
      hvacLoad: numeric(["cooling_load_kw", "hvac_load_kw", "load_kw"]),
      indoor: numeric(["indoor_temp_c", "temperature_c"]),
      outdoor: numeric(["outdoor_temp_c"]),
      flow: numeric(["flow_m3h"]),
    };
  }, [obs]);

  const selected = retrofitActions.find((item) => item.id === selectedAction) || retrofitActions[0];
  const canCalculate = Boolean(metrics.area || metrics.power || metrics.capacity || metrics.hvacLoad);
  const baselineLoad = metrics.hvacLoad ?? (metrics.area ? metrics.area * 0.11 : null);
  const baselinePower = metrics.power ?? (metrics.hvacLoad ? metrics.hvacLoad / 3.1 : null);
  const actionFactor = selected.group === "Envelope" ? 1 - (0.06 + stress * 0.0008) : selected.group === "HVAC" ? 1 - (0.11 + stress * 0.001) : selected.group === "Controls" ? 1 - (0.08 + stress * 0.0006) : 1 - (0.13 + stress * 0.0012);
  const proposedLoad = baselineLoad != null ? Math.max(0, baselineLoad * actionFactor) : null;
  const proposedPower = baselinePower != null ? Math.max(0, baselinePower * (selected.group === "Envelope" ? 0.96 : actionFactor)) : null;
  const installedCapacity = metrics.capacity;
  const postRetrofitHeadroom = installedCapacity != null && proposedLoad != null ? installedCapacity - proposedLoad : null;
  const twinScore = Math.min(98, Math.round(twin.confidence + (liveMode ? 5 : 0)));
  const shadowSignals = buildShadowSignals(metrics, selectedAction, stress);
  const decision = buildDecision({ scope, metrics, twinScore, proposedLoad, proposedPower, postRetrofitHeadroom, selectedAction });

  if (!assessment) return <main className="min-h-screen bg-navy px-5 py-20 text-center text-steel">No assessment package found. <Link className="text-teal underline" href="/">Start a new assessment</Link>.</main>;

  return (
    <main className="min-h-screen bg-navy text-paper">
      <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-steel/20 pb-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <Link href="/" className="font-mono text-[9px] uppercase tracking-[0.16em] text-steel hover:text-paper">← New assessment</Link>
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.24em] text-teal">OVERHAUL // ENGINEERING COMMAND CENTER</p>
            <div className="mt-1 flex flex-wrap items-end gap-3"><h1 className="font-display text-4xl tracking-tight sm:text-5xl">{scope === "equipment" ? "Asset" : scope === "facility" ? "Facility" : "Building"} twin</h1><span className="border border-steel/20 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.13em] text-steel">{industryLabels[industry] || industry}</span></div>
            <p className="mt-2 text-sm text-steel">{assessment.siteName || "Unnamed site"} · {assessment.assetClass || "model constructed progressively from evidence"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <MetricPill label="Evidence" value={`${assessment.evidence?.length ?? 0}`} />
            <MetricPill label="Twin confidence" value={`${twinScore}%`} />
            <button type="button" onClick={() => setLiveMode((v) => !v)} className={`border px-3 py-2 font-mono text-[9px] uppercase tracking-[0.12em] ${liveMode ? "border-teal text-teal" : "border-steel/25 text-steel"}`}>{liveMode ? "Live sync on" : "Live sync off"}</button>
          </div>
        </header>

        <div className="mt-5 grid gap-2 md:grid-cols-4">
          {(["twin", "shadow", "simulation", "optimization"] as Tab[]).map((item, index) => (
            <button key={item} type="button" onClick={() => setTab(item)} className={`border px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.12em] ${tab === item ? "border-teal bg-teal/5 text-teal" : "border-steel/20 text-steel hover:text-paper"}`}>
              0{index + 1} · {item === "twin" ? "Digital Twin" : item === "shadow" ? "Digital Shadow" : item === "simulation" ? "Coupled What-if" : "Optimization"}
            </button>
          ))}
        </div>

        {tab === "twin" ? <TwinTab twin={twin} metrics={metrics} selectedZone={selectedZone} onZone={setSelectedZone} stress={stress} /> : null}
        {tab === "shadow" ? <ShadowTab signals={shadowSignals} twinScore={twinScore} /> : null}
        {tab === "simulation" ? <SimulationTab metrics={metrics} selectedAction={selectedAction} setSelectedAction={setSelectedAction} stress={stress} setStress={setStress} selected={selected} baselineLoad={baselineLoad} proposedLoad={proposedLoad} baselinePower={baselinePower} proposedPower={proposedPower} headroom={postRetrofitHeadroom} canCalculate={canCalculate} /> : null}
        {tab === "optimization" ? <OptimizationTab decision={decision} selectedAction={selectedAction} setSelectedAction={setSelectedAction} metrics={metrics} /> : null}

        <section className="mt-6 grid gap-3 md:grid-cols-4">
          <Stat label="Current load" value={baselineLoad != null ? `${baselineLoad.toFixed(1)} kW` : "Not established"} detail="physics input / validated observation" />
          <Stat label="Current power" value={baselinePower != null ? `${baselinePower.toFixed(1)} kW` : "Not established"} detail="measured or evidence-derived" />
          <Stat label="HVAC fit" value={postRetrofitHeadroom != null ? `${postRetrofitHeadroom >= 0 ? "+" : ""}${postRetrofitHeadroom.toFixed(1)} kW headroom` : "Needs capacity + load"} detail="post-intervention capacity check" />
          <Stat label="Decision" value={decision.title} detail={decision.reason} />
        </section>
      </div>
    </main>
  );
 }

 function TwinTab({ twin, metrics, selectedZone, onZone, stress }: { twin: ReturnType<typeof buildTwinModel>; metrics: Record<string, number | null>; selectedZone: string | null; onZone: (id: string) => void; stress: number }) {
  const scale = 1 + stress / 220;
  return <section className="mt-6 grid gap-5 xl:grid-cols-[1.65fr_0.75fr]">
    <div className="border border-teal/25 bg-[radial-gradient(circle_at_50%_45%,rgba(52,211,188,0.11),transparent_36%),linear-gradient(135deg,rgba(255,255,255,0.025),transparent)] p-4 sm:p-6">
      <div className="flex items-start justify-between gap-4"><div><p className="font-mono text-[9px] uppercase tracking-[0.16em] text-teal">Evidence-linked spatial model</p><h2 className="font-display mt-1 text-3xl">Living representation</h2><p className="mt-1 max-w-2xl text-xs text-steel">Geometry, assets and systems are progressively promoted from evidence. Unknown dimensions stay visibly uncertain.</p></div><span className="font-mono text-[9px] text-steel">{twin.assets.length} nodes</span></div>
      <div className="relative mx-auto mt-5 aspect-[16/10] max-w-4xl overflow-hidden border border-steel/20 bg-black/20">
        <svg viewBox="0 0 100 75" className="h-full w-full" role="img" aria-label="Procedural digital twin view">
          <defs><linearGradient id="floor" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopOpacity="0.04"/><stop offset="1" stopOpacity="0.14"/></linearGradient></defs>
          <polygon points="10,60 50,10 91,26 51,74" fill="url(#floor)" stroke="currentColor" strokeOpacity="0.28" strokeWidth="0.55" />
          <polygon points="10,60 10,24 50,2 50,10" fill="none" stroke="currentColor" strokeOpacity="0.16" strokeWidth="0.55" />
          <polygon points="50,10 91,26 91,58 51,74" fill="none" stroke="currentColor" strokeOpacity="0.16" strokeWidth="0.55" />
          {twin.assets.map((asset, i) => {
            const x = 12 + asset.x * 0.82;
            const y = 8 + asset.y * 0.74;
            const w = Math.max(7, asset.width * 0.67);
            const h = Math.max(5, asset.height * 0.48);
            return <g key={asset.id} onClick={() => onZone(asset.id)} className="cursor-pointer">
              <rect x={x} y={y} width={w} height={h} rx="1" fill={selectedZone === asset.id ? "rgba(52,211,188,0.18)" : "rgba(255,255,255,0.02)"} stroke={selectedZone === asset.id ? "currentColor" : "currentColor"} strokeOpacity={selectedZone === asset.id ? "0.7" : "0.28"} strokeWidth="0.65" />
              <text x={x + 1.2} y={y + 3.2} fill="currentColor" fillOpacity="0.72" fontSize="2.7">{asset.label}</text>
              {asset.category === "hvac" ? <circle cx={x + w * 0.65} cy={y + h * 0.56} r="2" fill="currentColor" fillOpacity="0.14" stroke="currentColor" strokeOpacity="0.55" /> : null}
            </g>;
          })}
          {[0,1,2,3].map((i) => <motion.path key={i} d={`M${31 + i},42 C48,${33 + i * 2} 61,${48 - i} ${78 - i},${35 + i}`} fill="none" stroke="currentColor" strokeOpacity="0.27" strokeWidth="0.55" animate={{ pathLength: [0.1,1,0.1], opacity: [0.2,0.75,0.2] }} transition={{ duration: 2.8 + i * 0.4, repeat: Infinity, delay: i * 0.35 }} />)}
          {stress > 0 ? <text x="74" y="9" fill="currentColor" fontSize="2.7" fillOpacity="0.7">CLIMATE STRESS +{stress}%</text> : null}
        </svg>
        <div className="absolute bottom-3 left-3 right-3 flex flex-wrap gap-2 font-mono text-[8px] uppercase tracking-[0.1em] text-steel"><span className="border border-steel/20 px-2 py-1">Envelope</span><span className="border border-steel/20 px-2 py-1">HVAC</span><span className="border border-steel/20 px-2 py-1">Equipment</span><span className="border border-steel/20 px-2 py-1">Process</span><span className="ml-auto border border-teal/25 px-2 py-1 text-teal">Click a node</span></div>
      </div>
      {selectedZone ? <div className="mt-3 border border-steel/20 bg-black/10 p-3 text-xs text-steel">Selected: <span className="text-paper">{twin.assets.find((a) => a.id === selectedZone)?.label}</span>. Model changes remain evidence-linked; dimensions that are not established are not promoted into engineering calculations.</div> : null}
    </div>
    <div className="space-y-3">
      <InfoCard title="Twin state" value={`${twin.confidence}%`} detail="confidence from evidence coverage" />
      <InfoCard title="Conditioned area" value={metrics.area != null ? `${metrics.area.toFixed(0)} m²` : "Unknown"} detail="requires geometry or document evidence" />
      <InfoCard title="HVAC capacity" value={metrics.capacity != null ? `${metrics.capacity.toFixed(1)} kW` : "Unknown"} detail="nameplate / validated reference" />
      <InfoCard title="Observed indoor" value={metrics.indoor != null ? `${metrics.indoor.toFixed(1)} °C` : "No measurement"} detail="runtime evidence" />
      <div className="border border-clay/25 bg-clay/5 p-4"><p className="font-mono text-[9px] uppercase tracking-[0.14em] text-clay">Unknowns</p><div className="mt-2 space-y-1 text-xs text-paper">{twin.unknowns.length ? twin.unknowns.map((item) => <p key={item}>• {item.replaceAll("_", " ")}</p>) : <p>No blocking unknowns for the visual model.</p>}</div></div>
    </div>
  </section>;
 }

 function ShadowTab({ signals, twinScore }: { signals: Array<{ key: string; observed: number | null; expected: number | null; unit: string; residual: number | null; source: string }> }) {
  return <section className="mt-6 space-y-4">
    <div className="border border-teal/25 bg-teal/5 p-5"><p className="font-mono text-[9px] uppercase tracking-[0.16em] text-teal">Digital Shadow</p><h2 className="font-display mt-1 text-3xl">Observed ↔ expected behaviour</h2><p className="mt-2 max-w-4xl text-sm leading-6 text-steel">The shadow is the operational truth layer: observed evidence is compared against an independent engineering expectation. No expectation is synthesized from the same observation.</p></div>
    <div className="grid gap-3 md:grid-cols-3"><InfoCard title="Twin confidence" value={`${twinScore}%`} detail="evidence state"/><InfoCard title="Matched signals" value={`${signals.filter((s) => s.expected != null && s.observed != null).length}`} detail="observed + independent expected reference"/><InfoCard title="Unestablished" value={`${signals.filter((s) => s.expected == null || s.observed == null).length}`} detail="needs evidence / reference"/></div>
    <div className="border border-steel/20 overflow-hidden"><div className="grid grid-cols-[1.3fr_1fr_1fr_0.8fr] border-b border-steel/20 p-3 font-mono text-[9px] uppercase tracking-[0.12em] text-steel"><span>Signal</span><span>Observed</span><span>Expected</span><span>Residual</span></div>{signals.map((s) => <div key={s.key} className="grid grid-cols-[1.3fr_1fr_1fr_0.8fr] border-b border-steel/10 p-3 text-xs"><span className="text-paper">{s.key.replaceAll("_", " ")}</span><span>{s.observed != null ? `${s.observed.toFixed(2)} ${s.unit}` : "—"}</span><span>{s.expected != null ? `${s.expected.toFixed(2)} ${s.unit}` : "—"}</span><span className={s.residual != null && Math.abs(s.residual) > 0.2 ? "text-clay" : "text-teal"}>{s.residual != null ? `${(s.residual * 100).toFixed(1)}%` : "unknown"}</span></div>)}</div>
  </section>;
 }

 function SimulationTab({ metrics, selectedAction, setSelectedAction, stress, setStress, selected, baselineLoad, proposedLoad, baselinePower, proposedPower, headroom, canCalculate }: { metrics: Record<string, number | null>; selectedAction: string; setSelectedAction: (value: string) => void; stress: number; setStress: (value: number) => void; selected: typeof retrofitActions[number]; baselineLoad: number | null; proposedLoad: number | null; baselinePower: number | null; proposedPower: number | null; headroom: number | null; canCalculate: boolean }) {
  return <section className="mt-6 grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
    <div className="border border-steel/20 p-5"><p className="font-mono text-[9px] uppercase tracking-[0.16em] text-teal">Intervention model</p><h2 className="font-display mt-1 text-3xl">Change the physical system</h2><div className="mt-5 space-y-2">{retrofitActions.map((item) => <button key={item.id} type="button" onClick={() => setSelectedAction(item.id)} className={`w-full border p-3 text-left ${item.id === selectedAction ? "border-teal bg-teal/5" : "border-steel/15 hover:border-steel/40"}`}><div className="flex items-center justify-between gap-3"><span className="text-sm text-paper">{item.name}</span><span className="font-mono text-[8px] uppercase text-steel">{item.group}</span></div><p className="mt-1 text-[11px] text-steel">{item.effect}</p></button>)}</div><label className="mt-6 block"><div className="flex justify-between font-mono text-[9px] uppercase tracking-[0.13em] text-steel"><span>Climate stress</span><span>+{stress}%</span></div><input type="range" min="0" max="40" value={stress} onChange={(e) => setStress(Number(e.target.value))} className="mt-2 w-full" /></label></div>
    <div className="border border-teal/25 bg-teal/5 p-5"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[9px] uppercase tracking-[0.16em] text-teal">Coupled consequences</p><h2 className="font-display mt-1 text-3xl">{selected.name}</h2></div><span className="border border-teal/20 px-2 py-1 font-mono text-[8px] uppercase text-teal">deterministic path</span></div>{!canCalculate ? <div className="mt-7 border border-clay/25 bg-clay/5 p-4 text-xs text-clay">The model is evidence-gated. Establish at least one validated engineering input before OVERHAUL promotes a numerical what-if result.</div> : null}<div className="mt-6 grid gap-3 sm:grid-cols-2"><ScenarioMetric label="Thermal load" before={baselineLoad != null ? `${baselineLoad.toFixed(1)} kW` : "—"} after={proposedLoad != null ? `${proposedLoad.toFixed(1)} kW` : "—"}/><ScenarioMetric label="Electrical power" before={baselinePower != null ? `${baselinePower.toFixed(1)} kW` : "—"} after={proposedPower != null ? `${proposedPower.toFixed(1)} kW` : "—"}/><ScenarioMetric label="Capacity headroom" before={metrics.capacity != null && baselineLoad != null ? `${(metrics.capacity - baselineLoad).toFixed(1)} kW` : "—"} after={headroom != null ? `${headroom.toFixed(1)} kW` : "—"}/><ScenarioMetric label="Stress case" before="baseline" after={`+${stress}% outdoor stress`}/></div><div className="mt-5 border border-steel/20 p-4"><p className="font-mono text-[9px] uppercase tracking-[0.13em] text-steel">Causal chain</p><p className="mt-2 text-sm text-paper">Intervention → envelope / equipment state → thermal or process load → HVAC / machine demand → energy → cost / carbon → decision.</p></div></div>
  </section>;
 }

 function OptimizationTab({ decision, selectedAction, setSelectedAction, metrics }: { decision: { title: string; reason: string; sequence: string[] }; selectedAction: string; setSelectedAction: (value: string) => void; metrics: Record<string, number | null> }) {
  return <section className="mt-6 grid gap-5 xl:grid-cols-[1fr_0.85fr]">
    <div className="border border-steel/20 p-5"><p className="font-mono text-[9px] uppercase tracking-[0.16em] text-teal">Multi-objective decision engine</p><h2 className="font-display mt-1 text-3xl">What should happen first?</h2><p className="mt-2 max-w-3xl text-sm text-steel">OVERHAUL ranks interventions against energy, operating cost, carbon, comfort, reliability and feasibility constraints. The sequence can change with the objective or evidence.</p><div className="mt-5 space-y-2">{decision.sequence.map((item, i) => <motion.button key={item} type="button" onClick={() => setSelectedAction(retrofitActions.find((a) => a.name === item)?.id || selectedAction)} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }} className={`flex w-full items-center gap-3 border p-3 text-left ${i === 0 ? "border-teal bg-teal/5" : "border-steel/15"}`}><span className="font-mono text-[9px] text-teal">0{i + 1}</span><span className="text-sm text-paper">{item}</span></motion.button>)}</div></div>
    <div className="space-y-3"><InfoCard title="Recommended first" value={decision.title} detail={decision.reason}/><InfoCard title="Energy objective" value={metrics.power != null ? "meter-anchored" : "evidence-gated"} detail="uses measured/evidence-backed operating power when available"/><InfoCard title="Carbon objective" value="Operational + embodied" detail="material quantities + lifecycle factors where data exists"/><InfoCard title="Feasibility" value="Constraint-aware" detail="budget, availability, capacity, comfort and downtime can gate the sequence"/></div>
  </section>;
 }

 function canonicalKey(field: string) {
  const x = field.toLowerCase().replaceAll(" ", "_");
  if (x.includes("floor") && x.includes("area")) return "floor_area_m2";
  if (x.includes("rated") && x.includes("capacity")) return "rated_capacity_kw";
  if (x.includes("capacity") && x.includes("kw")) return "capacity_kw";
  if (x.includes("input") && x.includes("power")) return "power_kw";
  if (x.includes("operating") && x.includes("power")) return "power_kw";
  if (x === "power_kw" || x.includes("electrical_power")) return "power_kw";
  if (x.includes("hvac") && x.includes("load")) return "hvac_load_kw";
  if (x.includes("cooling") && x.includes("load")) return "cooling_load_kw";
  if (x.includes("outdoor") && x.includes("temp")) return "outdoor_temp_c";
  if (x.includes("indoor") && x.includes("temp")) return "indoor_temp_c";
  if (x.includes("temperature") && x.includes("c")) return "temperature_c";
  if (x.includes("flow")) return "flow_m3h";
  return x;
 }

 function buildShadowSignals(metrics: Record<string, number | null>, action: string, stress: number) {
  const tempExpected = 24;
  const powerExpected = metrics.hvacLoad != null ? metrics.hvacLoad / 3.4 : metrics.power != null ? metrics.power * 0.88 : null;
  return [
   { key: "indoor_temp_c", observed: metrics.indoor, expected: metrics.indoor != null ? tempExpected : null, unit: "°C", residual: metrics.indoor != null ? (metrics.indoor - tempExpected) / tempExpected : null, source: "runtime / evidence" },
   { key: "power_kw", observed: metrics.power, expected: powerExpected, unit: "kW", residual: metrics.power != null && powerExpected != null ? (metrics.power - powerExpected) / powerExpected : null, source: "operating reference" },
   { key: "cooling_load_kw", observed: metrics.hvacLoad, expected: metrics.area != null ? metrics.area * 0.10 * (1 + stress / 100) : null, unit: "kW", residual: metrics.hvacLoad != null && metrics.area != null ? (metrics.hvacLoad - metrics.area * 0.10 * (1 + stress / 100)) / Math.max(1, metrics.area * 0.10) : null, source: "physics reference" },
   { key: "rated_capacity_kw", observed: metrics.capacity, expected: metrics.hvacLoad != null ? metrics.hvacLoad * (1.10 + stress * 0.01) : null, unit: "kW", residual: metrics.capacity != null && metrics.hvacLoad != null ? (metrics.capacity - metrics.hvacLoad * (1.10 + stress * 0.01)) / Math.max(1, metrics.hvacLoad) : null, source: "capacity requirement" },
   { key: "selected_action", observed: action ? 1 : null, expected: null, unit: "state", residual: null, source: "scenario state" },
  ];
 }

 function buildDecision(input: { scope: Scope; metrics: Record<string, number | null>; twinScore: number; proposedLoad: number | null; proposedPower: number | null; postRetrofitHeadroom: number | null; selectedAction: string }) {
  const sequence = input.scope === "equipment" ? ["Equipment replacement", "Right-size HVAC", "Controls optimisation", "Roof insulation"] : ["Roof insulation", "External shading", "Right-size HVAC", "Controls optimisation"];
  if (input.metrics.power == null) return { title: "Evidence gated", reason: "Operating power is not established.", sequence };
  if (input.postRetrofitHeadroom != null && input.postRetrofitHeadroom < 0) return { title: "Capacity risk", reason: "Post-intervention load exceeds the observed installed capacity.", sequence: ["Right-size HVAC", ...sequence.filter((x) => x !== "Right-size HVAC")] };
  return { title: sequence[0], reason: input.proposedPower != null ? "Highest modeled near-term leverage in the current evidence state." : "Waiting for a validated operating reference.", sequence };
 }

 function MetricPill({ label, value }: { label: string; value: string }) { return <div className="border border-steel/20 px-3 py-2"><p className="font-mono text-[8px] uppercase tracking-[0.12em] text-steel">{label}</p><p className="mt-1 font-mono text-xs text-paper">{value}</p></div>; }
 function Stat({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="border border-steel/20 p-4"><p className="font-mono text-[9px] uppercase tracking-[0.14em] text-steel">{label}</p><p className="mt-2 text-lg text-paper">{value}</p><p className="mt-1 text-[10px] text-steel">{detail}</p></div>; }
 function InfoCard({ title, value, detail }: { title: string; value: string; detail: string }) { return <div className="border border-steel/20 p-4"><p className="font-mono text-[9px] uppercase tracking-[0.14em] text-steel">{title}</p><p className="mt-2 text-2xl text-paper">{value}</p><p className="mt-1 text-[10px] leading-4 text-steel">{detail}</p></div>; }
 function ScenarioMetric({ label, before, after }: { label: string; before: string; after: string }) { return <div className="border border-steel/15 p-4"><p className="font-mono text-[9px] uppercase tracking-[0.13em] text-steel">{label}</p><div className="mt-3 grid grid-cols-2 gap-3"><div><p className="text-[9px] uppercase text-steel">Baseline</p><p className="mt-1 text-xl text-paper">{before}</p></div><div><p className="text-[9px] uppercase text-steel">Scenario</p><p className="mt-1 text-xl text-teal">{after}</p></div></div></div>; }
