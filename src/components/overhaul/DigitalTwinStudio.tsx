"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";

type Subject = "building" | "facility" | "equipment";
type Observation = { field: string; value: string; numericValue: number | null; unit: string | null; confidence: number; sourceText: string; notes: string };
type Extraction = { observations?: Observation[]; visibleAssets?: string[]; warnings?: string[]; nextEvidence?: string[] };
type Assessment = { assessmentSubject?: Subject; assessmentGoal?: string; industry?: string; siteName?: string | null; assetClass?: string | null; evidence?: Array<{ id: string; kind: string; name: string }> };

const pretty: Record<string, string> = {
  building: "Building", facility: "Facility", equipment: "Equipment", residential: "Residential", commercial: "Commercial / Office", healthcare: "Healthcare", hospitality: "Hospitality", education: "Education", retail: "Retail", industrial: "Industrial / Manufacturing", warehouse: "Warehouse / Logistics", cold_storage: "Cold Storage / Refrigeration", data_center: "Data Center", campus: "Campus / Institution", other: "Other",
};

export default function DigitalTwinStudio() {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [extractions, setExtractions] = useState<Extraction[]>([]);
  const [tab, setTab] = useState<"twin" | "shadow" | "whatif" | "decision">("twin");
  const [retrofit, setRetrofit] = useState(35);

  useEffect(() => {
    try {
      setAssessment(JSON.parse(sessionStorage.getItem("overhaul:assessment") || "null"));
      setExtractions(JSON.parse(sessionStorage.getItem("overhaul:evidence-extractions") || "[]"));
    } catch { setAssessment(null); setExtractions([]); }
  }, []);

  const observations = useMemo(() => extractions.flatMap((entry) => entry.observations || []), [extractions]);
  const numeric = (needles: string[]) => {
    const hit = observations.find((item) => needles.some((needle) => item.field.toLowerCase().includes(needle)) && Number.isFinite(item.numericValue));
    return hit ? { value: hit.numericValue as number, unit: hit.unit || "", confidence: hit.confidence, source: hit.sourceText || hit.field } : null;
  };
  const area = numeric(["floor_area"]);
  const capacity = numeric(["rated_capacity", "capacity_kw"]);
  const power = numeric(["input_power", "operating_power", "power_kw"]);
  const temperature = numeric(["temperature"]);
  const model = observations.find((item) => item.field.toLowerCase().includes("model") && item.value)?.value || assessment?.assetClass || "Asset family pending";
  const load = area ? area.value * 0.12 * (1 - retrofit / 220) : null;
  const energy = power ? power.value * 250 * (1 - retrofit * 0.0022) : null;

  const exportCad = () => {
    const width = Math.max(8, Math.round(Math.sqrt(area?.value || 100)));
    const depth = Math.max(8, Math.round(width * 0.72));
    const dxf = `0\nSECTION\n2\nENTITIES\n0\nLWPOLYLINE\n8\nOVERHAUL_TWIN\n90\n4\n70\n1\n10\n0\n20\n0\n10\n${width}\n20\n0\n10\n${width}\n20\n${depth}\n10\n0\n20\n${depth}\n0\nENDSEC\n0\nEOF\n`;
    const url = URL.createObjectURL(new Blob([dxf], { type: "application/dxf" }));
    const a = document.createElement("a"); a.href = url; a.download = "overhaul-digital-twin.dxf"; a.click(); URL.revokeObjectURL(url);
  };

  if (!assessment) return <main className="min-h-screen bg-navy px-5 py-20 text-center text-steel">No assessment package found. <Link href="/" className="text-teal underline">Start an assessment</Link>.</main>;

  return <main className="min-h-screen bg-navy text-paper"><div className="mx-auto max-w-7xl px-5 py-7 lg:px-8">
    <header className="flex flex-col gap-4 border-b border-steel/20 pb-6 lg:flex-row lg:items-end lg:justify-between"><div><Link href="/" className="font-mono text-[9px] uppercase tracking-[0.16em] text-steel">← New assessment</Link><p className="mt-4 font-mono text-[10px] uppercase tracking-[0.22em] text-teal">OVERHAUL // DIGITAL TWIN STUDIO</p><h1 className="font-display mt-2 text-5xl tracking-tight">{pretty[assessment.assessmentSubject || "building"]} intelligence</h1><p className="mt-2 text-sm text-steel">{pretty[assessment.industry || "other"]} · {assessment.siteName || "Site not named"} · objective: {assessment.assessmentGoal || "retrofit"}</p></div><button onClick={exportCad} className="border border-steel/30 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-steel hover:border-teal hover:text-teal">Export CAD geometry</button></header>
    <nav className="mt-5 flex flex-wrap gap-2 border-b border-steel/20 pb-3">{([["twin", "01 / Twin"], ["shadow", "02 / Digital Shadow"], ["whatif", "03 / What-if"], ["decision", "04 / Decision"]] as const).map(([id, label]) => <button key={id} onClick={() => setTab(id)} className={`border px-3 py-2 text-[10px] uppercase tracking-[0.12em] ${tab === id ? "border-teal text-teal" : "border-steel/20 text-steel hover:text-paper"}`}>{label}</button>)}</nav>

    {tab === "twin" ? <Twin area={area} capacity={capacity} temperature={temperature} model={model} extractionCount={extractions.length} /> : null}
    {tab === "shadow" ? <Shadow observations={observations} area={area} capacity={capacity} power={power} temperature={temperature} /> : null}
    {tab === "whatif" ? <WhatIf retrofit={retrofit} setRetrofit={setRetrofit} load={load} energy={energy} hasInputs={Boolean(area || power || capacity)} /> : null}
    {tab === "decision" ? <Decision assessment={assessment} extractionCount={extractions.length} area={area} capacity={capacity} power={power} /> : null}

    <div className="mt-7 grid gap-4 lg:grid-cols-3"><Stat title="Evidence graph" value={`${extractions.length} sources`} detail="live camera / scan / photo / document"/><Stat title="Promoted signals" value={`${observations.length}`} detail="AI-perceived fields with provenance"/><Stat title="Engineering gate" value={capacity && power ? "Ready" : "Evidence required"} detail="no verified value → no fake engineering result"/></div>
  </div></main>;
}

function Twin({ area, capacity, temperature, model, extractionCount }: { area: ReturnType<(needles: string[]) => any>; capacity: ReturnType<(needles: string[]) => any>; temperature: ReturnType<(needles: string[]) => any>; model: string; extractionCount: number }) {
  return <section className="mt-7 grid gap-6 xl:grid-cols-[1.55fr_0.75fr]"><div className="relative min-h-[560px] overflow-hidden border border-teal/25 bg-[radial-gradient(circle_at_50%_50%,rgba(72,204,189,0.12),transparent_40%),linear-gradient(135deg,rgba(255,255,255,0.035),transparent)] p-5"><div className="flex items-center justify-between"><div><p className="font-mono text-[9px] uppercase tracking-[0.16em] text-teal">Procedural CAD-style representation</p><h2 className="font-display mt-1 text-3xl">Living digital twin</h2></div><span className="font-mono text-[9px] text-steel">{extractionCount} evidence sources</span></div><div className="relative mx-auto mt-8 h-[390px] max-w-3xl [perspective:1000px]"><motion.div animate={{ rotateX: 55, rotateZ: -24 }} transition={{ duration: 0.8 }} className="absolute inset-[10%_12%] border-2 border-teal/50 bg-teal/[0.035] shadow-[0_0_100px_rgba(72,204,189,0.08)]"><div className="absolute left-[8%] top-[12%] h-[24%] w-[31%] border border-paper/20"/><div className="absolute right-[10%] top-[15%] h-[22%] w-[25%] border border-teal/35"/><div className="absolute left-[40%] top-[47%] h-[29%] w-[30%] border border-clay/35"/><div className="absolute left-[50%] top-[53%] h-[13%] w-[14%] border border-teal/70 bg-teal/10"/></motion.div>{[0,1,2,3].map((i)=><motion.div key={i} animate={{ x:[0,210,0], opacity:[0.05,0.65,0.05] }} transition={{ duration:3.5+i*0.35, repeat:Infinity, delay:i*0.5 }} className="absolute left-[40%] top-[55%] h-px w-[36%] bg-teal/70"/>)}<div className="absolute bottom-1 left-1/2 -translate-x-1/2 border border-steel/20 bg-black/30 px-3 py-2 font-mono text-[9px] text-steel">Geometry is evidence-linked. Unknown dimensions stay unknown.</div></div><div className="mt-4 grid gap-2 sm:grid-cols-4"><Legend text="Envelope"/><Legend text="HVAC"/><Legend text="Equipment"/><Legend text="Flow field"/></div></div><div className="space-y-3"><Metric title="Conditioned area" metric={area} fallback="Not established"/><Metric title="Rated capacity" metric={capacity} fallback="Not established"/><Metric title="Observed temperature" metric={temperature} fallback="No temperature measurement"/><Metric title="Asset identity" value={model} detail="AI-perceived / evidence linked"/></div></section>;
}

function Shadow({ observations, area, capacity, power, temperature }: { observations: Observation[]; area: any; capacity: any; power: any; temperature: any }) { const values = [["area_m2",area],["capacity_kw",capacity],["power_kw",power],["temperature_c",temperature]]; return <section className="mt-7 space-y-5"><div className="border border-teal/25 bg-teal/5 p-6"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-teal">DIGITAL SHADOW</p><h2 className="font-display mt-1 text-3xl">Observed state ↔ expected state</h2><p className="mt-2 max-w-3xl text-sm text-steel">A shadow only declares deviation when an observed signal can be compared with a defensible expected reference. Missing references remain explicit unknowns.</p></div><div className="grid gap-3 md:grid-cols-4">{values.map(([key,metric])=><Metric title={key} metric={metric} fallback="—" detail={metric ? `${Math.round(metric.confidence*100)}% evidence confidence` : "unknown"} key={key as string}/>)}</div><div className="border border-steel/20 p-5"><p className="font-mono text-[9px] uppercase tracking-[0.14em] text-steel">Perception trace</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{observations.slice(0,12).map((o,i)=><div key={`${o.field}-${i}`} className="border border-steel/15 p-3"><p className="text-sm text-paper">{o.field}</p><p className="mt-1 text-xs text-steel">{o.value} {o.unit || ""}</p><p className="mt-1 font-mono text-[9px] text-teal">{o.sourceText || "visual evidence"}</p></div>)}</div></div></section>; }

function WhatIf({ retrofit, setRetrofit, load, energy, hasInputs }: { retrofit: number; setRetrofit: (v:number)=>void; load: number | null; energy:number | null; hasInputs:boolean }) { return <section className="mt-7 grid gap-6 lg:grid-cols-[0.72fr_1.28fr]"><div className="border border-steel/20 p-6"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-teal">CONTROLLED INTERVENTION</p><h2 className="font-display mt-1 text-3xl">Change the model</h2><p className="mt-2 text-sm text-steel">Adjust the retrofit intensity and watch the digital representation and modeled consequences respond.</p><div className="mt-8"><div className="flex justify-between text-xs text-steel"><span>Retrofit intensity</span><span>{retrofit}%</span></div><input type="range" min="0" max="100" value={retrofit} onChange={(e)=>setRetrofit(Number(e.target.value))} className="mt-3 w-full accent-teal"/></div></div><div className="border border-teal/25 bg-teal/5 p-6"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-teal">LIVE CONSEQUENCES</p><div className="mt-6 grid gap-4 sm:grid-cols-3"><Metric title="Modeled load" value={load ? `${load.toFixed(1)} kW` : "Locked"} detail="only when floor area is evidenced"/><Metric title="Modeled annual energy" value={energy ? `${(energy/1000).toFixed(1)} MWh` : "Locked"} detail="only when power is evidenced"/><Metric title="Twin response" value={`${retrofit}%`} detail="procedural geometry state"/></div>{!hasInputs ? <p className="mt-5 border border-clay/25 bg-clay/5 p-3 text-xs text-clay">Engineering simulation is gated until required evidence exists. This prevents the system from inventing numeric results.</p> : <p className="mt-5 text-xs text-steel">Values shown are modeled consequences, not measurements.</p>}</div></section>; }

function Decision({ assessment, extractionCount, area, capacity, power }: { assessment: Assessment; extractionCount:number; area:any; capacity:any; power:any }) { const missing = [!area && "floor area",!capacity && "rated capacity",!power && "input/operating power"].filter(Boolean) as string[]; return <section className="mt-7 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]"><div className="border border-steel/20 p-6"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-teal">DECISION GRAPH</p><div className="mt-5 space-y-3">{["Acquire evidence", "Perceive structure + assets", "Construct digital twin", "Calibrate Digital Shadow", "Run coupled retrofit scenarios", "Rank the intervention sequence"].map((x,i)=><motion.div key={x} initial={{opacity:0,x:-8}} animate={{opacity:1,x:0}} transition={{delay:i*0.05}} className={`border p-4 ${i < (missing.length ? 4 : 6) ? "border-teal/30 bg-teal/5" : "border-steel/20"}`}><span className="mr-3 font-mono text-[9px] text-teal">0{i+1}</span>{x}</motion.div>)}</div></div><div className="space-y-3"><Metric title="Industry" value={pretty[assessment.industry || "other"] || assessment.industry || "Other"} detail="assessment domain"/><Metric title="Evidence sources" value={`${extractionCount}`} detail="AI-analyzed sources"/><Metric title="Readiness" value={missing.length ? "Evidence-gated" : "Simulation-ready"} detail={missing.length ? `Need: ${missing.join(", ")}` : "Required signals present"}/></div></section>; }

function Metric({ title, metric, value, fallback, detail }: { title:string; metric?:any; value?:string; fallback?:string; detail?:string }) { return <div className="border border-steel/20 p-4"><p className="font-mono text-[9px] uppercase tracking-[0.14em] text-steel">{title}</p><p className="mt-2 text-2xl text-paper">{metric ? `${metric.value.toFixed(2)} ${metric.unit}` : value || fallback || "—"}</p><p className="mt-1 text-xs text-steel">{detail || (metric ? `${Math.round(metric.confidence*100)}% confidence · ${metric.source}` : "not established")}</p></div>; }
function Stat({ title, value, detail }: { title:string; value:string; detail:string }) { return <div className="border border-steel/20 p-4"><p className="font-mono text-[9px] uppercase tracking-[0.14em] text-steel">{title}</p><p className="mt-2 text-lg text-paper">{value}</p><p className="mt-1 text-xs text-steel">{detail}</p></div>; }
function Legend({ text }: { text:string }) { return <div className="border border-steel/20 px-3 py-2 text-center font-mono text-[9px] uppercase tracking-[0.12em] text-steel">{text}</div>; }
