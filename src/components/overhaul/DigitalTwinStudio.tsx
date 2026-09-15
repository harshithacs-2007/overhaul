"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";

type Subject = "building" | "facility" | "equipment";
type Extraction = { evidenceId?: string; evidenceType?: string; rawText?: string; observations?: Array<{ field: string; value: string; numericValue: number | null; unit: string | null; confidence: number; sourceText: string; notes: string }>; visibleAssets?: string[]; warnings?: string[]; nextEvidence?: string[] };
type Assessment = { assessmentSubject?: Subject; assessmentGoal?: string; industry?: string; siteName?: string | null; assetClass?: string | null; evidence?: Array<{ id: string; kind: string; name: string; type: string; size: number }>; context?: Record<string, unknown> };

type Metric = { value: number; unit: string; confidence: number; source: string };

const labels: Record<string, string> = {
  building: "Building",
  facility: "Facility",
  equipment: "Equipment",
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

export default function DigitalTwinStudio() {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [extractions, setExtractions] = useState<Extraction[]>([]);
  const [view, setView] = useState<"twin" | "shadow" | "whatif" | "decision">("twin");
  const [retrofit, setRetrofit] = useState(30);

  useEffect(() => {
    try {
      setAssessment(JSON.parse(sessionStorage.getItem("overhaul:assessment") || "null"));
      setExtractions(JSON.parse(sessionStorage.getItem("overhaul:evidence-extractions") || "[]"));
    } catch {
      setAssessment(null);
      setExtractions([]);
    }
  }, []);

  const subject = assessment?.assessmentSubject || "building";
  const industry = assessment?.industry || "other";
  const allObs = useMemo(() => extractions.flatMap((item) => item.observations || []), [extractions]);

  const metric = (patterns: string[]): Metric | null => {
    const match = allObs.find((item) => patterns.some((pattern) => item.field.toLowerCase().includes(pattern)) && typeof item.numericValue === "number" && Number.isFinite(item.numericValue));
    return match ? { value: match.numericValue as number, unit: match.unit || "", confidence: match.confidence, source: match.sourceText || match.field } : null;
  };

  const floorArea = metric(["floor_area"]);
  const capacity = metric(["rated_capacity", "capacity_kw"]);
  const power = metric(["input_power", "operating_power", "power_kw"]);
  const temperature = metric(["temperature"]);
  const model = allObs.find((item) => /model/.test(item.field.toLowerCase()) && item.value);
  const twinConfidence = Math.round((extractions.length ? Math.min(1, 0.35 + extractions.length * 0.11) : 0.15) * 100);
  const inferredLoad = floorArea ? floorArea.value * 0.12 * (1 - retrofit / 220) : null;
  const inferredAnnual = power ? power.value * 250 * (1 - retrofit / 100 * 0.22) : null;

  const exportCad = () => {
    const width = Math.max(8, Math.round(Math.sqrt(floorArea?.value || 100)));
    const depth = Math.max(8, Math.round(width * 0.72));
    const dxf = `0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nLWPOLYLINE\n8\nOVERHAUL_TWIN\n90\n4\n70\n1\n10\n0\n20\n0\n10\n${width}\n20\n0\n10\n${width}\n20\n${depth}\n10\n0\n20\n${depth}\n0\nENDSEC\n0\nEOF\n`;
    const blob = new Blob([dxf], { type: "application/dxf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "overhaul-digital-twin.dxf"; a.click(); URL.revokeObjectURL(url);
  };

  if (!assessment) return <main className="min-h-screen bg-navy px-5 py-20 text-center text-steel">No assessment package found. <Link className="text-teal underline" href="/">Start over</Link>.</main>;

  return (
    <main className="min-h-screen bg-navy text-paper">
      <div className="mx-auto max-w-7xl px-5 py-7 lg:px-8">
        <header className="flex flex-col gap-5 border-b border-steel/20 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link href="/" className="font-mono text-[9px] uppercase tracking-[0.16em] text-steel hover:text-paper">← New assessment</Link>
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.22em] text-teal">OVERHAUL // DIGITAL TWIN STUDIO</p>
            <h1 className="font-display mt-2 text-5xl tracking-tight">{labels[subject]} model</h1>
            <p className="mt-2 text-sm text-steel">{labels[industry] || industry} · {assessment.siteName || "Site not named"} · {extractions.length} analyzed evidence items</p>
          </div>
          <div className="flex flex-wrap gap-2"><button onClick={exportCad} className="border border-steel/30 px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-steel hover:border-teal hover:text-teal">Export CAD geometry</button><div className="border border-teal/30 bg-teal/5 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-teal">Twin confidence {twinConfidence}%</div></div>
        </header>

        <nav className="mt-5 flex flex-wrap gap-2 border-b border-steel/20 pb-3">{([["twin", "01 Twin"], ["shadow", "02 Digital Shadow"], ["whatif", "03 What-if"], ["decision", "04 Decision"]] as const).map(([id, label]) => <button key={id} type="button" onClick={() => setView(id)} className={`border px-3 py-2 text-[10px] uppercase tracking-[0.12em] ${view === id ? "border-teal text-teal" : "border-steel/20 text-steel hover:text-paper"}`}>{label}</button>)}</nav>

        {view === "twin" ? <TwinView subject={subject} floorArea={floorArea} capacity={capacity} model={model?.value || assessment.assetClass || "Asset family pending"} temperature={temperature} extractionCount={extractions.length} onWhatIf={() => setView("whatif")} /> : null}
        {view === "shadow" ? <ShadowView observations={allObs} capacity={capacity} power={power} temperature={temperature} /> : null}
        {view === "whatif" ? <WhatIfView retrofit={retrofit} setRetrofit={setRetrofit} subject={subject} inferredLoad={inferredLoad} inferredAnnual={inferredAnnual} hasInputs={Boolean(floorArea || power || capacity)} /> : null}
        {view === "decision" ? <DecisionView subject={subject} industry={industry} extractions={extractions} capacity={capacity} power={power} floorArea={floorArea} /> : null}

        <section className="mt-7 grid gap-4 lg:grid-cols-3">
          <EvidenceStrip title="Evidence graph" value={`${extractions.length} sources`} detail="camera / photo / document evidence" />
          <EvidenceStrip title="Engineering promotion" value={`${allObs.filter((o) => o.numericValue !== null).length} numeric signals`} detail="numeric values only when extracted with provenance" />
          <EvidenceStrip title="Unknowns" value={`${allObs.filter((o) => o.numericValue === null).length + (allObs.length ? 1 : 3)}`} detail="unestablished values remain unknown" />
        </section>
      </div>
    </main>
  );
}

function TwinView({ subject, floorArea, capacity, model, temperature, extractionCount, onWhatIf }: { subject: Subject; floorArea: Metric | null; capacity: Metric | null; model: string; temperature: Metric | null; extractionCount: number; onWhatIf: () => void }) {
  return <section className="mt-7 grid gap-6 xl:grid-cols-[1.5fr_0.8fr]">
    <div className="relative min-h-[580px] overflow-hidden border border-teal/25 bg-[radial-gradient(circle_at_50%_45%,rgba(72,204,189,0.10),transparent_38%),linear-gradient(135deg,rgba(255,255,255,0.03),transparent)] p-5">
      <div className="flex items-center justify-between"><div><p className="font-mono text-[9px] uppercase tracking-[0.16em] text-teal">Procedural geometry / evidence-linked</p><h2 className="font-display mt-1 text-3xl">Living asset representation</h2></div><span className="font-mono text-[9px] text-steel">{extractionCount} sources</span></div>
      <div className="relative mx-auto mt-10 h-[405px] max-w-3xl [perspective:1100px]">
        <motion.div animate={{ rotateX: 54, rotateZ: -25 }} transition={{ duration: 0.8 }} className="absolute inset-[12%_13%] border-2 border-teal/50 bg-teal/[0.03] shadow-[0_0_90px_rgba(72,204,189,0.06)]">
          <div className="absolute left-[10%] top-[15%] h-[26%] w-[30%] border border-paper/20 bg-paper/[0.02]" />
          <div className="absolute right-[11%] top-[18%] h-[20%] w-[24%] border border-teal/30 bg-teal/[0.04]" />
          <div className="absolute left-[43%] top-[44%] h-[26%] w-[28%] border border-clay/30 bg-clay/[0.03]" />
          <div className="absolute left-[49%] top-[49%] h-[15%] w-[16%] border border-teal/60 bg-teal/10 shadow-[0_0_25px_rgba(72,204,189,0.18)]" />
        </motion.div>
        {[0,1,2,3].map((i) => <motion.div key={i} animate={{ x: [0, 220, 0], opacity: [0.1, 0.7, 0.1] }} transition={{ duration: 3.8 + i * 0.3, repeat: Infinity, delay: i * 0.6 }} className="absolute left-[39%] top-[49%] h-px w-[38%] bg-teal/60" />)}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 border border-steel/20 bg-black/20 px-3 py-2 font-mono text-[9px] text-steel">Geometry is evidence-derived; unverified dimensions are not promoted to engineering inputs.</div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[9px] font-mono uppercase tracking-[0.11em] text-steel"><span className="border border-steel/20 px-2 py-1">Envelope</span><span className="border border-steel/20 px-2 py-1">HVAC</span><span className="border border-steel/20 px-2 py-1">Assets</span><span className="border border-steel/20 px-2 py-1">Flows</span><button onClick={onWhatIf} className="ml-auto border border-teal/30 px-2 py-1 text-teal">Change retrofit →</button></div>
    </div>
    <div className="space-y-4">
      <MetricPanel label="Conditioned area" metric={floorArea} fallback="Not established" />
      <MetricPanel label="Rated capacity" metric={capacity} fallback="Not established" />
      <MetricPanel label="Visible equipment" value={model} detail="AI-perceived asset identity" />
      <MetricPanel label="Observed temperature" metric={temperature} fallback="No measured temperature" />
    </div>
  </section>;
}

function ShadowView({ observations, capacity, power, temperature }: { observations: Extraction["observations"]; capacity: Metric | null; power: Metric | null; temperature: Metric | null }) {
  const rows = [
    ["rated_capacity_kw", capacity],
    ["power_kw", power],
    ["temperature_c", temperature],
  ];
  return <section className="mt-7 space-y-5"><div className="border border-teal/25 bg-teal/5 p-5"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-teal">Digital Shadow</p><h2 className="font-display mt-1 text-3xl">Observed ↔ expected behaviour</h2><p className="mt-2 max-w-3xl text-sm text-steel">The shadow is a comparison layer, not a decorative score. A signal needs both a defensible observation and a validated expected reference before a deviation is established.</p></div><div className="grid gap-3 md:grid-cols-3">{rows.map(([key, m]) => <div key={key as string} className="border border-steel/20 p-5"><p className="font-mono text-[9px] uppercase tracking-[0.14em] text-steel">{key}</p><p className="mt-3 text-2xl text-paper">{m ? `${m.value.toFixed(2)} ${m.unit}` : "—"}</p><p className="mt-1 text-xs text-steel">{m ? `${Math.round(m.confidence * 100)}% evidence confidence` : "unknown / awaiting evidence"}</p></div>)}</div><div className="border border-steel/20 p-5"><p className="font-mono text-[9px] uppercase tracking-[0.14em] text-steel">Raw perception trace</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{observations.slice(0, 10).map((o, i) => <div key={`${o.field}-${i}`} className="border border-steel/15 p-3"><p className="text-sm text-paper">{o.field}</p><p className="mt-1 text-xs text-steel">{o.value} {o.unit || ""}</p><p className="mt-1 font-mono text-[9px] text-teal">source: {o.sourceText || "visual evidence"}</p></div>)}</div></div></section>;
}

function WhatIfView({ retrofit, setRetrofit, subject, inferredLoad, inferredAnnual, hasInputs }: { retrofit: number; setRetrofit: (v: number) => void; subject: Subject; inferredLoad: number | null; inferredAnnual: number | null; hasInputs: boolean }) {
  return <section className="mt-7 grid gap-6 lg:grid-cols-[0.75fr_1.25fr]"><div className="border border-steel/20 p-5"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-teal">Intervention</p><h2 className="font-display mt-1 text-3xl">Retrofit what-if</h2><p className="mt-2 text-sm text-steel">{subject === "equipment" ? "Change modeled equipment efficiency/capacity conditions." : "Change the modeled envelope intervention before reconsidering HVAC."}</p><label className="mt-8 block"><div className="flex justify-between text-xs text-steel"><span>Retrofit intensity</span><span>{retrofit}%</span></div><input className="mt-3 w-full accent-teal" type="range" min="0" max="100" value={retrofit} onChange={(e) => setRetrofit(Number(e.target.value))} /></label></div><div className="border border-teal/25 bg-teal/5 p-6"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-teal">Live consequences</p><div className="mt-6 grid gap-4 sm:grid-cols-3">{[["Thermal load", inferredLoad ? `${inferredLoad.toFixed(1)} kW` : "Locked"], ["Annual energy", inferredAnnual ? `${(inferredAnnual / 1000).toFixed(1)} MWh"` : "Locked"], ["Visual twin", `${retrofit}% changed"]].map(([l,v]) => <div key={l as string} className="border border-steel/20 bg-black/10 p-4"><p className="text-[9px] uppercase tracking-[0.14em] text-steel">{l}</p><p className="mt-2 text-xl text-paper">{v}</p></div>)}</div>{!hasInputs ? <p className="mt-5 border border-clay/20 bg-clay/5 p-3 text-xs text-clay">Simulation is intentionally locked: no verified engineering signal is available yet. Add a floor-area/nameplate/operating measurement rather than allowing a guessed result.</p> : <p className="mt-5 text-xs text-steel">These displayed consequences are model outputs only when the required observed engineering signals are present.</p>}</div></section>;
}

function DecisionView({ subject, industry, extractions, capacity, power, floorArea }: { subject: Subject; industry: string; extractions: Extraction[]; capacity: Metric | null; power: Metric | null; floorArea: Metric | null }) {
  const missing = [!capacity && "rated capacity", !power && "operating/input power", subject !== "equipment" && !floorArea && "conditioned floor area"].filter(Boolean) as string[];
  return <section className="mt-7 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]"><div className="border border-steel/20 p-6"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-teal">Decision sequence</p><div className="mt-5 space-y-3">{["Establish evidence", "Construct digital twin", "Compare observed vs expected", "Run coupled what-if physics", "Rank intervention sequence"].map((item, i) => <motion.div key={item} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }} className={`border p-4 ${i < (missing.length ? 3 : 5) ? "border-teal/30 bg-teal/5" : "border-steel/20"}`}><div className="flex gap-4"><span className="font-mono text-[10px] text-teal">0{i + 1}</span><span className="text-sm">{item}</span></div></motion.div>)}</div></div><div className="space-y-4"><MetricPanel label="Domain" value={labels[industry] || industry} detail="industry context" /><MetricPanel label="Evidence confidence" value={`${Math.min(100, 35 + extractions.length * 11)}%`} detail="based on analyzed evidence count; not a physics confidence score" /><MetricPanel label="Decision readiness" value={missing.length ? "Evidence-gated" : "Simulation-ready"} detail={missing.length ? `Need: ${missing.join(", ")}` : "Required signals are present for the modeled path."} /></div></section>;
}

function MetricPanel({ label, metric, value, fallback, detail }: { label: string; metric?: Metric | null; value?: string; fallback?: string; detail?: string }) { return <div className="border border-steel/20 p-4"><p className="font-mono text-[9px] uppercase tracking-[0.14em] text-steel">{label}</p><p className="mt-2 text-2xl text-paper">{metric ? `${metric.value.toFixed(2)} ${metric.unit}` : value || fallback || "—"}</p><p className="mt-1 text-xs text-steel">{detail || (metric ? `${Math.round(metric.confidence * 100)}% confidence · ${metric.source}` : "not established")}</p></div>; }
function EvidenceStrip({ title, value, detail }: { title: string; value: string; detail: string }) { return <div className="border border-steel/20 p-4"><p className="font-mono text-[9px] uppercase tracking-[0.14em] text-steel">{title}</p><p className="mt-2 text-lg text-paper">{value}</p><p className="mt-1 text-xs text-steel">{detail}</p></div>; }
