"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import RoomScanOverlay from "./RoomScanOverlay";
import { normalizeExtractionObservations, type EngineeringObservation } from "@/lib/evidence/normalizeForEngineering";

type Scope = "building" | "facility" | "equipment";
type Mode = "building" | "industry";
type Goal = "retrofit" | "performance" | "energy" | "comfort" | "reliability";
type Industry = "residential" | "commercial" | "healthcare" | "hospitality" | "education" | "retail" | "industrial" | "warehouse" | "cold_storage" | "data_center" | "campus" | "other";
type EvidenceKind = "scan" | "photo" | "document" | "dataset";

type EvidenceItem = {
  id: string;
  kind: EvidenceKind;
  name: string;
  type: string;
  size: number;
  previewUrl: string | null;
  file: File;
};

type ExtractionPayload = {
  observations?: EngineeringObservation[];
  warnings?: string[];
  model?: string;
  [key: string]: unknown;
};

const buildingTypes: Array<[string, string, Industry]> = [
  ["Home", "House / villa / residence", "residential"],
  ["Apartment", "Flat / apartment / residential tower", "residential"],
  ["Office", "Office / commercial building", "commercial"],
  ["Hospital", "Hospital / clinical building", "healthcare"],
  ["Hotel", "Hotel / resort / hospitality", "hospitality"],
  ["School", "School / college / education", "education"],
  ["Retail", "Shop / mall / retail space", "retail"],
  ["Other", "Any other built space", "other"],
];

const industryTypes: Array<[string, Industry, string]> = [
  ["Manufacturing", "industrial", "Plant / factory / production line"],
  ["Warehouse", "warehouse", "Storage / logistics / distribution"],
  ["Cold storage", "cold_storage", "Refrigerated storage / cold chain"],
  ["Data center", "data_center", "Compute / server infrastructure"],
  ["Healthcare", "healthcare", "Hospital / clinic / care facility"],
  ["Hospitality", "hospitality", "Hotel / resort / commercial kitchen"],
  ["Retail / commercial", "commercial", "Commercial building / retail"],
  ["Campus", "campus", "Large multi-building site"],
  ["Other", "other", "Other industrial or facility asset"],
];

const equipmentTypes = [
  "Air conditioner / HVAC",
  "Chiller",
  "Refrigerator / freezer",
  "Heat pump",
  "Fan / motor",
  "Pump",
  "Compressor",
  "Boiler / water heater",
  "Cooling tower",
  "Washing machine / appliance",
  "Process equipment",
  "Other machine",
];

const goals: Array<[Goal, string, string]> = [
  ["retrofit", "Retrofit", "Find an intervention, simulate it, then verify it."],
  ["performance", "Performance", "Compare actual behaviour against a defensible reference."],
  ["energy", "Energy", "Find avoidable energy use without inventing a baseline."],
  ["comfort", "Comfort", "Trace thermal conditions to equipment or envelope changes."],
  ["reliability", "Reliability", "Find maintenance or replacement pathways with evidence."],
];

function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
function inferKind(file: File): EvidenceKind {
  const name = file.name.toLowerCase();
  if (/\.(csv|tsv|json)$/.test(name) || /^(text\/(csv|tab-separated-values)|application\/json)$/.test(file.type)) return "dataset";
  return file.type === "application/pdf" ? "document" : "photo";
}

async function analyzeEvidence(items: EvidenceItem[], scope: Scope, industry: Industry, onProgress: () => void) {
  const results: Array<Record<string, unknown>> = [];
  const failures: string[] = [];
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      const item = items[index];
      if (!item) return;
      try {
        const form = new FormData();
        form.append("file", item.file, item.name);
        form.append("evidenceId", item.id);
        form.append("evidenceKind", item.kind);
        form.append("subject", scope);
        form.append("industry", industry);
        const response = await fetch("/api/evidence/extract", { method: "POST", body: form });
        const payload = await response.json() as { result?: ExtractionPayload; error?: string };
        if (!response.ok || !payload.result) throw new Error(payload.error || "Evidence analysis failed");
        const normalized = normalizeExtractionObservations(payload.result);
        results[index] = { ...normalized, evidenceId: item.id, sourceKind: item.kind, sourceName: item.name };
      } catch (error) {
        failures[index] = `${item.name}: ${error instanceof Error ? error.message : "analysis failed"}`;
      } finally {
        onProgress();
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, items.length) }, () => worker()));
  return { results: results.filter((result): result is Record<string, unknown> => Boolean(result)), failures: failures.filter(Boolean) };
}

export default function OverhaulIntakeV2() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [mode, setMode] = useState<Mode | null>(null);
  const [scope, setScope] = useState<Scope>("building");
  const [industry, setIndustry] = useState<Industry>("commercial");
  const [goal, setGoal] = useState<Goal>("retrofit");
  const [assetClass, setAssetClass] = useState("");
  const [siteName, setSiteName] = useState("");
  const [assetAge, setAssetAge] = useState("");
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisCount, setAnalysisCount] = useState(0);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [scanMeta, setScanMeta] = useState<{ coveragePercent?: number; completed?: boolean } | null>(null);
  const [details, setDetails] = useState<Record<string, string>>({});

  useEffect(() => {
    const sync = () => {
      try { setScanMeta(JSON.parse(sessionStorage.getItem("overhaul:room-scan") || "null")); } catch { setScanMeta(null); }
    };
    sync();
    window.addEventListener("overhaul:evidence-change", sync);
    return () => window.removeEventListener("overhaul:evidence-change", sync);
  }, []);

  const selectedIndustryName = useMemo(() => industryTypes.find(([, value]) => value === industry)?.[0] || "Other", [industry]);

  const chooseMode = (nextMode: Mode) => {
    setMode(nextMode);
    if (nextMode === "building") {
      setScope("building");
      setAssetClass("Home");
      setIndustry("residential");
    } else {
      setScope("facility");
      setAssetClass("Facility");
      setIndustry("industrial");
    }
    setStep(1);
  };

  const selectBuildingType = (label: string, nextIndustry: Industry) => {
    setScope("building");
    setAssetClass(label);
    setIndustry(nextIndustry);
  };

  const addFiles = (files: File[]) => {
    const remaining = Math.max(0, 8 - evidence.length);
    const next = files.filter((file) => file.size > 0 && file.size <= 25 * 1024 * 1024).slice(0, remaining).map((file) => ({
      id: uid(), kind: inferKind(file), name: file.name || "Evidence", type: file.type, size: file.size,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null, file,
    }));
    setEvidence((current) => [...current, ...next]);
    setAnalysisError(null);
  };

  const removeEvidence = (id: string) => {
    setEvidence((current) => {
      const item = current.find((value) => value.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return current.filter((value) => value.id !== id);
    });
  };

  const openScan = () => window.dispatchEvent(new CustomEvent("overhaul:open-room-scan"));

  const numericDetails = () => {
    const next: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(details)) {
      if (!value.trim()) continue;
      const number = Number(value);
      next[key] = Number.isFinite(number) ? number : value;
    }
    return next;
  };

  const startAnalysis = async () => {
    if ((!evidence.length && !scanMeta?.coveragePercent) || analyzing) return;
    setAnalyzing(true);
    setAnalysisError(null);
    setAnalysisCount(0);
    try {
      const { results, failures } = evidence.length ? await analyzeEvidence(evidence, scope, industry, () => setAnalysisCount((value) => value + 1)) : { results: [], failures: [] };
      const mergedDetails = numericDetails();
      try {
        const current = JSON.parse(sessionStorage.getItem("overhaul:supplemental-values") || "{}");
        sessionStorage.setItem("overhaul:supplemental-values", JSON.stringify({ ...current, ...mergedDetails }));
      } catch {}
      const assessment = {
        assessmentSubject: scope,
        assessmentGoal: goal,
        industry,
        siteName: siteName.trim() || null,
        assetClass: assetClass.trim() || (scope === "equipment" ? "Other machine" : "Site"),
        assetAgeYears: assetAge.trim() ? Number(assetAge) : null,
        createdAt: new Date().toISOString(),
        evidence: evidence.map(({ file: _file, previewUrl: _preview, ...item }) => item),
        context: { industry, siteName: siteName.trim() || null, assetClass: assetClass.trim(), mode },
        status: "model-ready" as const,
      };
      sessionStorage.setItem("overhaul:evidence-extractions", JSON.stringify(results));
      sessionStorage.setItem("overhaul:assessment", JSON.stringify(assessment));
      window.dispatchEvent(new CustomEvent("overhaul:supplemental-change"));
      window.dispatchEvent(new CustomEvent("overhaul:evidence-change"));
      if (failures.length) setAnalysisError(`${failures.length} evidence item${failures.length === 1 ? "" : "s"} could not be analyzed. The successful evidence and scan were retained.`);
      router.push("/assessment");
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "Could not prepare the assessment.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDetailsSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void startAnalysis();
  };

  const buildingSelected = assetClass || "Home";
  const industrySelected = assetClass || "Facility";
  const canContinueFromEvidence = Boolean(evidence.length || scanMeta?.coveragePercent);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050707] text-paper">
      <RoomScanOverlay scope={scope} />
      <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between border-b border-steel/15 pb-4"><div><p className="font-mono text-[9px] uppercase tracking-[0.28em] text-teal">OVERHAUL</p><p className="mt-1 font-mono text-[8px] uppercase tracking-[0.14em] text-steel">Universal retrofit intelligence</p></div><div className="font-mono text-[8px] uppercase tracking-[0.12em] text-steel">{step === 0 ? "Entry" : `0${step} / 03`}</div></header>

        {step === 0 && <section className="grid flex-1 place-items-center py-12 sm:py-20"><div className="w-full max-w-6xl"><div className="grid gap-8 lg:grid-cols-[1.2fr_.8fr] lg:items-end"><div><p className="font-mono text-[9px] uppercase tracking-[0.24em] text-teal">Welcome to OVERHAUL</p><h1 className="mt-4 max-w-4xl font-display text-6xl leading-[0.88] sm:text-7xl lg:text-8xl">Know what it is.<br/><span className="text-teal">Know how it behaves.</span><br/>Then overhaul it.</h1><p className="mt-7 max-w-2xl text-sm leading-6 text-steel sm:text-base">A retrofit intelligence system for buildings, industrial assets, machines and everyday appliances. Give it evidence. OVERHAUL builds an engineering model, compares actual behaviour with a defensible reference, simulates interventions and shows what changes before you spend.</p></div><div className="border-l border-steel/15 pl-5 lg:pl-7"><p className="font-mono text-[8px] uppercase tracking-[0.18em] text-steel">What happens next</p><div className="mt-4 space-y-3 text-[11px] text-paper"><p><span className="mr-3 font-mono text-teal">01</span>Choose the asset path.</p><p><span className="mr-3 font-mono text-teal">02</span>Scan / upload what you already have.</p><p><span className="mr-3 font-mono text-teal">03</span>Fill only the missing engineering details.</p><p><span className="mr-3 font-mono text-teal">04</span>Generate the twin → compare → retrofit.</p></div><p className="mt-7 font-mono text-[7px] uppercase tracking-[0.16em] text-steel">Evidence-bound · physics-backed · no guessed measurements</p></div></div><div className="mt-12 grid gap-4 md:grid-cols-2"><button type="button" onClick={() => chooseMode("building")} className="group border border-steel/20 bg-[#080c0c] p-6 text-left transition hover:-translate-y-0.5 hover:border-teal/50 hover:bg-teal/[0.035]"><div className="flex items-start justify-between"><span className="font-mono text-[8px] uppercase tracking-[0.16em] text-teal">01 · Building mode</span><span className="font-mono text-[9px] text-steel group-hover:text-teal">→</span></div><h2 className="mt-5 font-display text-4xl">Buildings & spaces</h2><p className="mt-2 max-w-xl text-[10px] leading-5 text-steel">Home, apartment, office, hospital, hotel, school, retail and other built spaces.</p><div className="mt-7 flex flex-wrap gap-2 font-mono text-[7px] uppercase tracking-[0.1em] text-steel"><span>envelope</span><span>hvac</span><span>comfort</span><span>energy</span></div></button><button type="button" onClick={() => chooseMode("industry")} className="group border border-steel/20 bg-[#080c0c] p-6 text-left transition hover:-translate-y-0.5 hover:border-amber-200/45 hover:bg-amber-200/[0.02]"><div className="flex items-start justify-between"><span className="font-mono text-[8px] uppercase tracking-[0.16em] text-amber-200">02 · Industry mode</span><span className="font-mono text-[9px] text-steel group-hover:text-amber-200">→</span></div><h2 className="mt-5 font-display text-4xl">Industry, machines & appliances</h2><p className="mt-2 max-w-xl text-[10px] leading-5 text-steel">Factories, warehouses, cold chain, data centers, facilities — and the individual machines inside them.</p><div className="mt-7 flex flex-wrap gap-2 font-mono text-[7px] uppercase tracking-[0.1em] text-steel"><span>machines</span><span>appliances</span><span>process</span><span>reliability</span></div></button></div></div></section>}

        {step === 1 && <section className="flex-1 py-8 sm:py-12"><div className="mx-auto max-w-6xl"><button type="button" onClick={() => setStep(0)} className="font-mono text-[8px] uppercase tracking-[0.12em] text-steel hover:text-paper">← Back</button><div className="mt-5 grid gap-8 lg:grid-cols-[.72fr_1.28fr]"><div><p className="font-mono text-[8px] uppercase tracking-[0.18em] text-teal">Step 01 · Define the asset</p><h2 className="mt-2 font-display text-5xl">What are we overhauling?</h2><p className="mt-3 text-[11px] leading-5 text-steel">Pick the closest category. This only shapes the evidence and engineering path; it does not create measurements.</p><div className="mt-7 border border-steel/15 p-4"><p className="font-mono text-[7px] uppercase text-steel">Objective</p><div className="mt-3 space-y-2">{goals.map(([value, label, note]) => <button key={value} type="button" onClick={() => setGoal(value)} className={`w-full border p-3 text-left ${goal === value ? "border-teal/40 bg-teal/[0.04]" : "border-steel/10 hover:border-steel/30"}`}><p className="text-[11px]">{label}</p><p className="mt-1 text-[8px] leading-4 text-steel">{note}</p></button>)}</div></div></div><div>{mode === "building" ? <><p className="font-mono text-[7px] uppercase tracking-[0.14em] text-steel">Building type</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{buildingTypes.map(([label, note, nextIndustry]) => <button key={label} type="button" onClick={() => selectBuildingType(label, nextIndustry)} className={`border p-5 text-left transition ${buildingSelected === label ? "border-teal/45 bg-teal/[0.05]" : "border-steel/15 bg-[#080c0c] hover:border-steel/35"}`}><p className="font-display text-2xl">{label}</p><p className="mt-1 text-[9px] leading-4 text-steel">{note}</p></button>)}</div></> : <><p className="font-mono text-[7px] uppercase tracking-[0.14em] text-steel">Industry / facility</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{industryTypes.map(([label, value, note]) => <button key={label} type="button" onClick={() => { setIndustry(value); setScope("facility"); setAssetClass(label); }} className={`border p-5 text-left transition ${industrySelected === label ? "border-amber-200/45 bg-amber-200/[0.03]" : "border-steel/15 bg-[#080c0c] hover:border-steel/35"}`}><p className="font-display text-2xl">{label}</p><p className="mt-1 text-[9px] leading-4 text-steel">{note}</p></button>)}</div><div className="mt-5 border border-steel/15 p-5"><p className="font-mono text-[7px] uppercase tracking-[0.12em] text-amber-200">Or inspect one machine / appliance</p><div className="mt-3 flex flex-wrap gap-2">{equipmentTypes.map((value) => <button key={value} type="button" onClick={() => { setScope("equipment"); setAssetClass(value); }} className={`border px-3 py-2 text-[9px] ${scope === "equipment" && assetClass === value ? "border-amber-200/50 bg-amber-200/[0.04] text-amber-100" : "border-steel/15 text-steel hover:border-steel/35 hover:text-paper"}`}>{value}</button>)}</div></div></>}<div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-steel/15 pt-5"><div className="text-[9px] text-steel">Selected · <span className="text-paper">{assetClass || "Choose a type"}</span><span className="ml-2 text-steel">· {selectedIndustryName}</span></div><button type="button" disabled={!assetClass} onClick={() => setStep(2)} className="border border-teal/40 bg-teal/[0.06] px-5 py-3 font-mono text-[8px] uppercase tracking-[0.14em] text-teal disabled:cursor-not-allowed disabled:opacity-30">Continue to evidence →</button></div></div></div></div></section>}

        {step === 2 && <section className="flex-1 py-8 sm:py-12"><div className="mx-auto max-w-6xl"><button type="button" onClick={() => setStep(1)} className="font-mono text-[8px] uppercase tracking-[0.12em] text-steel hover:text-paper">← Back</button><div className="mt-5 grid gap-7 lg:grid-cols-[1fr_340px]"><div><p className="font-mono text-[8px] uppercase tracking-[0.18em] text-teal">Step 02 · Evidence first</p><h2 className="mt-2 font-display text-5xl">Show me the real asset.</h2><p className="mt-3 max-w-2xl text-[11px] leading-5 text-steel">Start with a 360° room sweep, a machine scan, a nameplate, bills, drawings, manuals, photos or meter data. OVERHAUL will ask for only what the engineering model still needs.</p><div className="mt-7 grid gap-4 md:grid-cols-[1.2fr_.8fr]"><button type="button" onClick={openScan} className="group relative min-h-[330px] overflow-hidden border border-teal/30 bg-[radial-gradient(circle_at_50%_50%,rgba(52,211,188,.10),transparent_55%)] p-6 text-left transition hover:border-teal/60"><div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px)] bg-[size:38px_38px] opacity-40"/><div className="relative flex h-full flex-col justify-between"><div><p className="font-mono text-[8px] uppercase tracking-[0.16em] text-teal">Recommended</p><h3 className="mt-3 font-display text-4xl">Hold to scan</h3><p className="mt-2 max-w-md text-[10px] leading-5 text-steel">Keep the button held and slowly rotate around the room or asset. OVERHAUL captures a guided evidence sweep instead of forcing you through 12 separate screenshots.</p></div><div className="mt-8 flex items-center justify-between border-t border-steel/15 pt-5"><span className="font-mono text-[7px] uppercase tracking-[0.12em] text-steel">360° guided capture</span><span className="font-mono text-sm text-teal">◎</span></div></div></button><div className="border border-steel/15 bg-[#080c0c] p-5"><p className="font-mono text-[8px] uppercase text-steel">Upload evidence</p><button type="button" onClick={() => fileInput.current?.click()} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(Array.from(event.dataTransfer.files)); }} className={`mt-4 grid min-h-[245px] w-full place-items-center border-2 border-dashed p-5 text-center transition ${dragging ? "border-teal bg-teal/[0.04]" : "border-steel/20 hover:border-steel/35"}`}><div><div className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-teal/25 font-mono text-xl text-teal">+</div><p className="mt-4 text-sm">Drop files here</p><p className="mt-2 text-[8px] leading-4 text-steel">PDF · images · CSV · TSV · JSON<br/>Up to 8 files · 25 MB each</p></div></button><input ref={fileInput} type="file" className="hidden" multiple accept="image/*,.pdf,.csv,.tsv,.json,text/csv,text/tab-separated-values,application/json" onChange={(event) => { addFiles(Array.from(event.target.files || [])); event.currentTarget.value = ""; }}/></div></div><div className="mt-4 grid gap-2">{evidence.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 border border-steel/10 bg-[#080c0c] px-3 py-3"><div className="min-w-0"><p className="truncate text-[10px] text-paper">{item.name}</p><p className="mt-1 font-mono text-[7px] uppercase text-steel">{item.kind} · {(item.size / 1024 / 1024).toFixed(1)} MB</p></div><button type="button" onClick={() => removeEvidence(item.id)} className="font-mono text-[7px] uppercase text-steel hover:text-red-200">remove</button></div>)}</div>{scanMeta?.coveragePercent ? <div className="mt-4 flex items-center justify-between border border-teal/20 bg-teal/[0.04] px-4 py-3"><div><p className="font-mono text-[8px] uppercase text-teal">Spatial evidence captured</p><p className="mt-1 text-[9px] text-steel">{scanMeta.completed ? "360° sweep complete." : `${scanMeta.coveragePercent}% coverage retained.`}</p></div><button type="button" onClick={openScan} className="font-mono text-[8px] uppercase text-teal">scan again →</button></div> : null}</div><aside className="border border-steel/15 bg-[#080c0c] p-5"><p className="font-mono text-[8px] uppercase tracking-[0.12em] text-steel">Inspection rule</p><p className="mt-3 text-sm leading-6">Do not type numbers you do not know. A photograph can establish existence and condition; it does not establish hidden geometry.</p><div className="mt-6 border-t border-steel/10 pt-5"><p className="font-mono text-[8px] uppercase text-teal">Current path</p><p className="mt-2 text-[10px]">{assetClass}</p><p className="mt-1 text-[9px] text-steel">{scope === "equipment" ? "Machine / appliance" : scope === "facility" ? "Facility / industrial site" : "Building / space"}</p></div><div className="mt-5 border-t border-steel/10 pt-5"><p className="font-mono text-[8px] uppercase text-steel">Next</p><p className="mt-2 text-[9px] leading-5 text-steel">After evidence, OVERHAUL asks for missing physical and operating details. Then the digital twin is created and the retrofit loop begins.</p></div></aside></div><div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-steel/15 pt-5"><div className="text-[9px] text-steel">{analysisError ? <span className="text-amber-200">{analysisError}</span> : canContinueFromEvidence ? `${evidence.length} file${evidence.length === 1 ? "" : "s"} ready${scanMeta?.coveragePercent ? ` · ${scanMeta.coveragePercent}% scan` : ""}.` : "Add evidence or run a scan to continue."}</div><button type="button" onClick={() => setStep(3)} disabled={!canContinueFromEvidence} className="border border-teal/40 bg-teal/[0.06] px-5 py-3 font-mono text-[8px] uppercase tracking-[0.14em] text-teal disabled:cursor-not-allowed disabled:opacity-30">Continue to asset details →</button></div></div></section>}

        {step === 3 && <section className="flex-1 py-8 sm:py-12"><div className="mx-auto max-w-5xl"><button type="button" onClick={() => setStep(2)} className="font-mono text-[8px] uppercase tracking-[0.12em] text-steel hover:text-paper">← Back</button><div className="mt-5"><p className="font-mono text-[8px] uppercase tracking-[0.18em] text-teal">Step 03 · Missing details</p><h2 className="mt-2 font-display text-5xl">Give the twin what the evidence could not.</h2><p className="mt-3 max-w-3xl text-[11px] leading-5 text-steel">Only enter values you know or can measure. These become explicit user inputs. They are never disguised as AI observations.</p><form onSubmit={handleDetailsSubmit} className="mt-8 grid gap-4 md:grid-cols-2"><Field label="Asset / site name" value={siteName} onChange={setSiteName} placeholder="e.g. West wing / AC-01" /><Field label="Age (years)" value={assetAge} onChange={setAssetAge} placeholder="optional" type="number" />{scope === "equipment" ? <><Field label="Rated capacity (kW)" value={details.rated_capacity_kw || ""} onChange={(value) => setDetails((x) => ({ ...x, rated_capacity_kw: value }))} placeholder="nameplate" type="number" /><Field label="Operating load (kW)" value={details.load_kw || ""} onChange={(value) => setDetails((x) => ({ ...x, load_kw: value }))} placeholder="measured / observed" type="number" /><Field label="Input power (kW)" value={details.power_kw || ""} onChange={(value) => setDetails((x) => ({ ...x, power_kw: value }))} placeholder="meter / nameplate" type="number" /><Field label="Efficiency / COP" value={details.efficiency || ""} onChange={(value) => setDetails((x) => ({ ...x, efficiency: value }))} placeholder="e.g. 3.2 or 0.85" type="number" /><Field label="Runtime (hours / year)" value={details.annual_hours || ""} onChange={(value) => setDetails((x) => ({ ...x, annual_hours: value }))} placeholder="optional" type="number" /></> : <><Field label="Floor area (m²)" value={details.floor_area_m2 || ""} onChange={(value) => setDetails((x) => ({ ...x, floor_area_m2: value }))} placeholder="optional" type="number" /><Field label="Width (m)" value={details.geometry_width_m || ""} onChange={(value) => setDetails((x) => ({ ...x, geometry_width_m: value }))} placeholder="known dimension" type="number" /><Field label="Depth (m)" value={details.geometry_depth_m || ""} onChange={(value) => setDetails((x) => ({ ...x, geometry_depth_m: value }))} placeholder="known dimension" type="number" /><Field label="Height (m)" value={details.geometry_height_m || ""} onChange={(value) => setDetails((x) => ({ ...x, geometry_height_m: value }))} placeholder="known dimension" type="number" /><Field label="HVAC capacity (kW)" value={details.capacity_kw || ""} onChange={(value) => setDetails((x) => ({ ...x, capacity_kw: value }))} placeholder="optional" type="number" /><Field label="HVAC COP / efficiency" value={details.cop || ""} onChange={(value) => setDetails((x) => ({ ...x, cop: value }))} placeholder="optional" type="number" /><Field label="Annual cooling hours" value={details.annual_cooling_hours || ""} onChange={(value) => setDetails((x) => ({ ...x, annual_cooling_hours: value }))} placeholder="optional" type="number" /></>}<div className="md:col-span-2 border border-steel/15 bg-[#080c0c] p-5"><p className="font-mono text-[8px] uppercase tracking-[0.12em] text-teal">What you will get next</p><div className="mt-4 grid gap-3 md:grid-cols-4"><Mini n="01" title="Evidence model"/><Mini n="02" title="Digital twin"/><Mini n="03" title="Expected vs actual"/><Mini n="04" title="Retrofit what-if"/></div><p className="mt-5 text-[9px] leading-5 text-steel">A missing value stays missing. OVERHAUL will show what cannot yet be quantified instead of filling the gap with a guess.</p></div><div className="md:col-span-2 flex flex-wrap items-center justify-between gap-4 border-t border-steel/15 pt-5"><div className="font-mono text-[8px] uppercase tracking-[0.12em] text-steel">Ready to build · <span className="text-paper">{assetClass}</span></div><button type="submit" disabled={analyzing} className="border border-amber-200/45 bg-amber-200/[0.04] px-6 py-3 font-mono text-[8px] uppercase tracking-[0.14em] text-amber-100 disabled:cursor-not-allowed disabled:opacity-40">{analyzing ? `Processing ${analysisCount}/${evidence.length}` : "Build the digital twin →"}</button></div></form></div></div></section>}

        <footer className="border-t border-steel/10 pt-3 font-mono text-[7px] uppercase tracking-[0.12em] text-steel">OVERHAUL · Evidence → Model → Expected behaviour → Retrofit simulation → Verification</footer>
      </div>
    </main>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return <label className="block"><span className="font-mono text-[7px] uppercase tracking-[0.12em] text-steel">{label}</span><input type={type} inputMode={type === "number" ? "decimal" : undefined} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-2 w-full border border-steel/15 bg-[#080c0c] px-3 py-3 text-sm text-paper outline-none placeholder:text-steel/35 focus:border-teal/45" /></label>;
}

function Mini({ n, title }: { n: string; title: string }) {
  return <div className="border border-steel/10 p-3"><p className="font-mono text-[8px] text-teal">{n}</p><p className="mt-2 text-[10px] text-paper">{title}</p></div>;
}
