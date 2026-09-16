"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import RoomScanOverlay from "./RoomScanOverlay";
import { normalizeExtractionObservations, type EngineeringObservation } from "@/lib/evidence/normalizeForEngineering";
import type { TwinModel } from "@/lib/engineering/twinModel";

type Scope = "building" | "facility" | "equipment";
type Mode = "building" | "industry";
type Goal = "retrofit" | "performance" | "energy" | "comfort" | "reliability";
type Industry = "residential" | "commercial" | "healthcare" | "hospitality" | "education" | "retail" | "industrial" | "warehouse" | "cold_storage" | "data_center" | "campus" | "other";
type EvidenceKind = "scan" | "photo" | "document" | "dataset";
type EvidenceItem = { id: string; kind: EvidenceKind; name: string; type: string; size: number; previewUrl: string | null; file: File };
type ExtractionPayload = { observations?: EngineeringObservation[]; warnings?: string[]; model?: string; [key: string]: unknown };

type TwinContext = {
  scope: Scope;
  className: string;
  industry: Industry;
  title: string;
  extracted: unknown[];
  supplemental: Record<string, number | string>;
  scanFusion: unknown;
};

const buildings: Array<[string, string, Industry]> = [
  ["Home", "House / villa / residence", "residential"],
  ["Apartment", "Flat / residential tower", "residential"],
  ["Office", "Office / commercial building", "commercial"],
  ["Hospital", "Hospital / clinical building", "healthcare"],
  ["Hotel", "Hotel / resort", "hospitality"],
  ["School", "School / college", "education"],
  ["Retail", "Shop / mall", "retail"],
  ["Other", "Any built space", "other"],
];
const industries: Array<[string, Industry, string]> = [
  ["Manufacturing", "industrial", "Plant / factory / production line"],
  ["Warehouse", "warehouse", "Storage / logistics"],
  ["Cold storage", "cold_storage", "Cold chain / refrigeration"],
  ["Data center", "data_center", "Compute / server infrastructure"],
  ["Healthcare", "healthcare", "Hospital / care facility"],
  ["Hospitality", "hospitality", "Hotel / commercial kitchen"],
  ["Retail / commercial", "commercial", "Commercial / retail"],
  ["Campus", "campus", "Multi-building site"],
  ["Other", "other", "Other facility"],
];
const machines = ["Air conditioner / HVAC", "Chiller", "Refrigerator / freezer", "Heat pump", "Fan / motor", "Pump", "Compressor", "Boiler / water heater", "Cooling tower", "Washing machine / appliance", "Process equipment", "Other machine"];
const goals: Array<[Goal, string, string]> = [
  ["retrofit", "Retrofit", "Find an intervention, simulate it, verify it."],
  ["performance", "Performance", "Compare current behaviour with a reference."],
  ["energy", "Energy", "Find avoidable energy use without a guessed baseline."],
  ["comfort", "Comfort", "Connect thermal conditions to physical interventions."],
  ["reliability", "Reliability", "Find maintenance and replacement pathways."],
];
const numericDetailKeys = new Set(["floor_area_m2", "geometry_height_m", "electricity_rate_inr_per_kwh", "capacity_kw", "load_kw", "power_kw", "annual_hours", "bill_history_months", "bill_energy_kwh"]);

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
function evidenceKind(file: File): EvidenceKind {
  const name = file.name.toLowerCase();
  if (/\.(csv|tsv|json)$/.test(name) || /^(text\/(csv|tab-separated-values)|application\/json)$/.test(file.type)) return "dataset";
  return file.type === "application/pdf" ? "document" : "photo";
}
function saveSession(key: string, value: unknown) { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {} }
function readSession<T>(key: string, fallback: T): T { try { return JSON.parse(sessionStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; } }

async function extractEvidence(items: EvidenceItem[], scope: Scope, industry: Industry, setProgress: (n: number) => void) {
  const out: Array<Record<string, unknown>> = [];
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
        out[index] = { ...normalizeExtractionObservations(payload.result), evidenceId: item.id, sourceKind: item.kind, sourceName: item.name };
      } catch (error) {
        failures[index] = `${item.name}: ${error instanceof Error ? error.message : "analysis failed"}`;
      } finally {
        setProgress(Object.keys(out).length + failures.length);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, items.length) }, worker));
  return { results: out.filter(Boolean), failures: failures.filter(Boolean) };
}

async function buildTwin(items: EvidenceItem[], context: TwinContext) {
  const images = items.filter((item) => item.file.type.startsWith("image/")).slice(0, 6);
  const form = new FormData();
  form.append("scope", context.scope);
  form.append("className", context.className);
  form.append("industry", context.industry);
  form.append("title", context.title || context.className || "OVERHAUL Twin");
  form.append("extracted", JSON.stringify({ observations: context.extracted, supplemental: context.supplemental, scanFusion: context.scanFusion }).slice(0, 45000));
  images.forEach((item) => form.append("file", item.file, item.name));
  const response = await fetch("/api/model/generate", { method: "POST", body: form });
  const payload = await response.json() as { model?: TwinModel; error?: string };
  if (!response.ok || !payload.model) throw new Error(payload.error || "Twin generation failed");
  return payload.model;
}

export default function OverhaulIntakeV2() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [mode, setMode] = useState<Mode | null>(null);
  const [scope, setScope] = useState<Scope>("building");
  const [industry, setIndustry] = useState<Industry>("commercial");
  const [goal, setGoal] = useState<Goal>("retrofit");
  const [assetClass, setAssetClass] = useState("");
  const [siteName, setSiteName] = useState("");
  const [age, setAge] = useState("");
  const [files, setFiles] = useState<EvidenceItem[]>([]);
  const [drag, setDrag] = useState(false);
  const [scan, setScan] = useState<{ coveragePercent?: number; completed?: boolean } | null>(null);
  const [modelState, setModelState] = useState<"idle" | "generating" | "ready" | "error">("idle");
  const [modelError, setModelError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [details, setDetails] = useState<Record<string, string>>({});

  useEffect(() => {
    const sync = () => setScan(readSession("overhaul:room-scan", null));
    sync();
    window.addEventListener("overhaul:evidence-change", sync);
    return () => window.removeEventListener("overhaul:evidence-change", sync);
  }, []);

  useEffect(() => {
    if (!assetClass) return;
    saveSession("overhaul:intake-context", { className: assetClass, industry, scope, title: siteName || assetClass });
  }, [assetClass, industry, scope, siteName]);

  const isEquipment = scope === "equipment";
  const canEvidence = Boolean(files.length || scan?.coveragePercent);
  const billFiles = useMemo(() => files.filter((item) => /bill|electric|utility|energy/i.test(`${item.name} ${item.kind}`)), [files]);

  const addFiles = (incoming: File[]) => {
    const allowed = incoming.filter((file) => file.size > 0 && file.size <= 25 * 1024 * 1024 && (file.type.startsWith("image/") || file.type === "application/pdf" || /\.(csv|tsv|json)$/i.test(file.name)));
    const next = allowed.slice(0, Math.max(0, 10 - files.length)).map((file) => ({ id: uid(), kind: evidenceKind(file), name: file.name || "Evidence", type: file.type, size: file.size, previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null, file }));
    setFiles((current) => [...current, ...next]);
    setModelError(null);
  };

  const launchScan = () => {
    saveSession("overhaul:intake-context", { className: assetClass || scope, industry, scope, title: siteName || assetClass || "OVERHAUL Twin" });
    window.dispatchEvent(new CustomEvent("overhaul:open-room-scan"));
  };

  const submit = async () => {
    if (!canEvidence || running) return;
    setRunning(true);
    setProgress(0);
    setModelError(null);
    try {
      const invalidAge = age.trim() && (!Number.isFinite(Number(age)) || Number(age) < 0);
      const invalidDetails = Object.entries(details).some(([key, value]) => numericDetailKeys.has(key) && value.trim() && (!Number.isFinite(Number(value)) || Number(value) < 0));
      if (invalidAge || invalidDetails) {
        setModelError("One or more numeric inputs are invalid. Enter non-negative finite values before continuing.");
        return;
      }

      const extractionResult = files.length ? await extractEvidence(files, scope, industry, setProgress) : { results: [], failures: [] };
      const numeric = Object.fromEntries(Object.entries(details).filter(([, value]) => value.trim()).map(([key, value]) => [key, Number(value)]));
      const previous = readSession<Record<string, unknown>>("overhaul:supplemental-values", {});
      const supplemental = { ...previous, ...numeric } as Record<string, number | string>;
      saveSession("overhaul:supplemental-values", supplemental);
      saveSession("overhaul:evidence-extraction-failures", extractionResult.failures);

      let twin = readSession<TwinModel | null>("overhaul:twin-model", null);
      const fusion = readSession<unknown>("overhaul:scan-fusion", null);
      setModelState("generating");
      try {
        twin = await buildTwin(files, { scope, className: assetClass || (isEquipment ? "Other machine" : "Site"), industry, title: siteName || assetClass, extracted: extractionResult.results, supplemental, scanFusion: fusion });
        saveSession("overhaul:twin-model", twin);
        setModelState("ready");
      } catch (error) {
        setModelState("error");
        setModelError(error instanceof Error ? error.message : "Twin generation failed.");
      }

      const assessment = {
        assessmentSubject: scope,
        assessmentGoal: goal,
        industry,
        siteName: siteName.trim() || null,
        assetClass: assetClass.trim() || (isEquipment ? "Other machine" : "Site"),
        assetAgeYears: age.trim() ? Number(age) : null,
        createdAt: new Date().toISOString(),
        evidence: files.map(({ file: _file, previewUrl: _preview, ...meta }) => meta),
        context: { industry, siteName: siteName.trim() || null, assetClass: assetClass.trim(), mode, scope },
        status: twin ? "model-ready" : "evidence-ready",
        twinStatus: twin ? "generated" : "pending",
      };
      saveSession("overhaul:evidence-extractions", extractionResult.results);
      saveSession("overhaul:assessment", assessment);
      window.dispatchEvent(new CustomEvent("overhaul:supplemental-change"));
      window.dispatchEvent(new CustomEvent("overhaul:evidence-change"));
      window.dispatchEvent(new CustomEvent("overhaul:twin-change"));
      router.push("/assessment");
    } finally {
      setRunning(false);
    }
  };

  return (
    <main className="min-h-screen overflow-hidden bg-[#040606] text-paper">
      <RoomScanOverlay scope={scope} />
      <div className="pointer-events-none fixed inset-0 opacity-50 [background-image:radial-gradient(circle_at_20%_15%,rgba(44,224,202,.11),transparent_28%),radial-gradient(circle_at_80%_80%,rgba(228,184,96,.08),transparent_24%)]" />
      <div className="relative mx-auto flex min-h-screen max-w-[1500px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between border-b border-steel/15 pb-4">
          <div><p className="font-mono text-[9px] uppercase tracking-[.28em] text-teal">OVERHAUL</p><p className="mt-1 font-mono text-[8px] uppercase tracking-[.14em] text-steel">Universal retrofit intelligence</p></div>
          <p className="font-mono text-[8px] uppercase text-steel">{step === 0 ? "Entry" : `0${step} / 03`}</p>
        </header>

        <AnimatePresence mode="wait">
          {step === 0 && <motion.section key="0" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="flex flex-1 items-center py-12"><div className="w-full"><div className="grid gap-8 lg:grid-cols-[1.15fr_.85fr] lg:items-center"><div><p className="font-mono text-[9px] uppercase tracking-[.24em] text-teal">Welcome to OVERHAUL</p><motion.h1 className="mt-4 max-w-5xl font-display text-6xl leading-[.86] sm:text-7xl lg:text-[7.2rem]" animate={{ letterSpacing: [".03em", "-.045em", "-.045em"] }} transition={{ duration: 1.2, ease: "easeOut" }}>See what it is.<br/><span className="text-teal">Model how it behaves.</span><br/>Then overhaul it.</motion.h1><p className="mt-7 max-w-2xl text-sm leading-6 text-steel">Turn real asset evidence into a reconstructable engineering twin. Compare current behaviour with a reference, simulate retrofit changes before spending, and preserve the evidence trail.</p></div><div className="relative h-[310px] overflow-hidden border border-teal/20 bg-black/20"><div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px)] bg-[size:30px_30px]"/><motion.div className="absolute left-1/2 top-1/2 h-40 w-64 -translate-x-1/2 -translate-y-1/2 border border-teal/45" animate={{ rotateX: [42, 58, 42], rotateZ: [-7, 3, -7], scale: [.88, 1, .88] }} transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}><div className="absolute inset-3 border border-teal/20"/><motion.div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-200/40" animate={{ rotate: 360 }} transition={{ duration: 4.5, repeat: Infinity, ease: "linear" }} /></motion.div><div className="absolute bottom-4 left-4 right-4 flex justify-between font-mono text-[7px] uppercase tracking-[.14em] text-steel"><span>evidence graph</span><span>3d twin</span><span className="text-teal">retrofit delta</span></div></div></div><div className="mt-10 grid gap-4 md:grid-cols-2"><ModeCard title="Building mode" note="Homes, apartments, offices, hospitals, hotels, schools and retail." accent="teal" onClick={() => { setMode("building"); setScope("building"); setAssetClass("Home"); setIndustry("residential"); setStep(1); }} /><ModeCard title="Industry / asset mode" note="Facilities, machinery, HVAC, refrigeration and everyday appliances." accent="amber" onClick={() => { setMode("industry"); setScope("facility"); setAssetClass("Facility"); setIndustry("industrial"); setStep(1); }} /></div></div></motion.section>}

          {step === 1 && <motion.section key="1" initial={{ opacity: 0, x: 25 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -25 }} className="flex-1 py-8 sm:py-12"><div className="mx-auto max-w-6xl"><button type="button" onClick={() => setStep(0)} className="font-mono text-[8px] uppercase text-steel">← Back</button><div className="mt-5 grid gap-8 lg:grid-cols-[.68fr_1.32fr]"><div><p className="font-mono text-[8px] uppercase text-teal">Step 01 · Define</p><h2 className="mt-2 font-display text-5xl">What are we overhauling?</h2><div className="mt-6 space-y-2">{goals.map(([value, label, note]) => <button key={value} type="button" onClick={() => setGoal(value)} className={`w-full border p-3 text-left ${goal === value ? "border-teal/40 bg-teal/[.05]" : "border-steel/10"}`}><p className="text-[11px]">{label}</p><p className="mt-1 text-[8px] text-steel">{note}</p></button>)}</div></div><div>{mode === "building" ? <><p className="font-mono text-[8px] uppercase text-steel">Building type</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{buildings.map(([label, note, value]) => <Select key={label} label={label} note={note} active={assetClass === label} onClick={() => { setScope("building"); setAssetClass(label); setIndustry(value); }} />)}</div></> : <><p className="font-mono text-[8px] uppercase text-steel">Facility / machine</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{industries.map(([label, value, note]) => <Select key={label} label={label} note={note} active={scope !== "equipment" && assetClass === label} amber onClick={() => { setScope("facility"); setAssetClass(label); setIndustry(value); }} />)}</div><div className="mt-5 border border-amber-200/15 p-5"><p className="font-mono text-[8px] uppercase text-amber-200">Standalone machine / appliance</p><p className="mt-1 text-[9px] leading-4 text-steel">No floor plan. Scan the asset, capture the nameplate/model, upload whatever electric-bill history you have, then add age and operating details.</p><div className="mt-3 flex flex-wrap gap-2">{machines.map((value) => <button key={value} type="button" onClick={() => { setScope("equipment"); setAssetClass(value); }} className={`border px-3 py-2 text-[9px] ${isEquipment && assetClass === value ? "border-amber-200/50 text-amber-100" : "border-steel/15 text-steel"}`}>{value}</button>)}</div></div></>}</div></div><div className="mt-6 flex items-center justify-between border-t border-steel/15 pt-5"><p className="text-[9px] text-steel">Selected · <span className="text-paper">{assetClass || "—"}</span></p><button type="button" disabled={!assetClass} onClick={() => setStep(2)} className="border border-teal/40 px-5 py-3 font-mono text-[8px] uppercase text-teal disabled:opacity-30">Continue to evidence →</button></div></div></motion.section>}

          {step === 2 && <motion.section key="2" initial={{ opacity: 0, x: 25 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -25 }} className="flex-1 py-8 sm:py-12"><div className="mx-auto max-w-6xl"><button type="button" onClick={() => setStep(1)} className="font-mono text-[8px] uppercase text-steel">← Back</button><div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><p className="font-mono text-[8px] uppercase text-teal">Step 02 · Inspect</p><h2 className="mt-2 font-display text-5xl">{isEquipment ? "Scan + document the asset." : "Give us the evidence."}</h2></div><div className={`border px-4 py-3 font-mono text-[8px] uppercase ${modelState === "ready" ? "border-teal/30 text-teal" : modelState === "generating" ? "border-amber-200/30 text-amber-200" : "border-steel/15 text-steel"}`}>{modelState === "ready" ? "Twin generated" : modelState === "generating" ? "Reconstructing twin…" : isEquipment ? "Scan + nameplate + bills" : "Plan + photos + scan"}</div></div><p className="mt-3 max-w-4xl text-[11px] leading-5 text-steel">{isEquipment ? "Primary evidence: live scan of the machine/appliance. Add a clear nameplate or model photo, manufacturer manual/datasheet, and electricity bills for any period you have — 12 months is useful, but partial history is accepted." : "Floor plans establish plan geometry. Photos and scan views establish visible assets and placement. Bills, nameplates and datasets anchor engineering values."}</p><div className="mt-7 grid gap-4 md:grid-cols-2"><button type="button" onClick={launchScan} className="group relative min-h-[300px] overflow-hidden border border-teal/30 bg-teal/[.025] p-6 text-left transition hover:-translate-y-1 hover:border-teal/60"><motion.div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px)] bg-[size:36px_36px]" animate={{ backgroundPosition: ["0px 0px", "36px 36px"] }} transition={{ duration: 8, repeat: Infinity, ease: "linear" }}/><div className="relative"><p className="font-mono text-[8px] uppercase text-teal">Computer vision</p><h3 className="mt-4 font-display text-4xl">Hold to scan</h3><p className="mt-2 max-w-md text-[10px] leading-5 text-steel">{isEquipment ? "Walk around the asset slowly. Capture front, sides, service areas, connections and the nameplate when visible." : "Rotate slowly through the space. Capture complementary views so visible assets and conditions can be cross-checked."}</p><div className="mt-10 flex items-center justify-between font-mono text-[7px] uppercase text-steel"><span>{isEquipment ? "asset evidence sweep" : "multi-view evidence sweep"}</span><span className="text-lg text-teal">◎</span></div></div></button><button type="button" onClick={() => fileRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(event) => { event.preventDefault(); setDrag(false); addFiles(Array.from(event.dataTransfer.files)); }} className={`min-h-[300px] border border-dashed p-6 text-left transition ${drag ? "border-teal bg-teal/[.04]" : "border-steel/20 hover:border-teal/40"}`}><motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 2.2, repeat: Infinity }} className="text-4xl text-teal">＋</motion.div><h3 className="mt-4 font-display text-3xl">{isEquipment ? "Add nameplate, model, manual + bills" : "Drop a floor plan + photos"}</h3><p className="mt-2 text-[10px] leading-5 text-steel">{isEquipment ? "Images, PDF manuals/datasheets and CSV/JSON/TSV operating data are accepted. Add any amount of electric-bill history you have." : "Images, PDF, CSV, TSV and JSON are accepted. A clear dimensioned plan gives the strongest geometry basis."}</p><div className="mt-7 font-mono text-[7px] uppercase text-steel">10 evidence items max · 25 MB each</div></button><input ref={fileRef} className="hidden" type="file" multiple accept="image/*,application/pdf,.csv,.tsv,.json" onChange={(event) => addFiles(Array.from(event.target.files || []))}/></div><div className="mt-4 border border-steel/15 bg-[#080c0c] p-5"><div className="flex items-center justify-between"><p className="font-mono text-[8px] uppercase text-steel">Evidence shelf</p><p className="font-mono text-[7px] text-teal">{files.length}/10</p></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{files.map((item) => <motion.div layout key={item.id} className="flex items-center gap-3 border border-steel/10 p-2"><div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden bg-black/20">{item.previewUrl ? <img src={item.previewUrl} alt="" className="h-full w-full object-cover"/> : <span className="font-mono text-[7px] text-teal">{item.kind}</span>}</div><div className="min-w-0 flex-1"><p className="truncate text-[10px]">{item.name}</p><p className="font-mono text-[7px] uppercase text-steel">{item.kind}{/bill|electric|utility|energy/i.test(item.name) ? " · bill candidate" : ""}</p></div><button type="button" onClick={() => setFiles((current) => current.filter((file) => file.id !== item.id))} className="text-steel" aria-label={`Remove ${item.name}`}>×</button></motion.div>)}</div>{isEquipment && <div className="mt-4 grid gap-2 sm:grid-cols-3"><Info label="Asset scan" value={scan?.coveragePercent ? `${scan.coveragePercent}% captured` : "not captured"}/><Info label="Bill files" value={`${billFiles.length} uploaded`}/><Info label="Floor plan" value="not required"/></div>}{!isEquipment && hasFloorplan(files) ? <div className="mt-4 border border-teal/20 bg-teal/[.03] p-3 text-[9px] text-steel"><span className="text-teal">Floor plan detected.</span> Reconstruction will create rooms, walls, openings and located assets from it.</div> : null}{modelError ? <div className="mt-4 border border-red-400/20 p-3 text-[9px] text-red-200">{modelError}</div> : null}</div><div className="mt-4 flex flex-wrap items-center justify-between gap-4"><p className="font-mono text-[7px] uppercase text-steel">{scan?.coveragePercent ? `${scan.coveragePercent}% scan evidence · ` : ""}{files.length ? "source material loaded" : "waiting for evidence"}</p><button type="button" disabled={!canEvidence} onClick={() => setStep(3)} className="border border-teal/40 px-5 py-3 font-mono text-[8px] uppercase text-teal disabled:opacity-30">Continue to details →</button></div></div></motion.section>}

          {step === 3 && <motion.section key="3" initial={{ opacity: 0, x: 25 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -25 }} className="flex-1 py-8 sm:py-12"><div className="mx-auto max-w-5xl"><button type="button" onClick={() => setStep(2)} className="font-mono text-[8px] uppercase text-steel">← Back</button><div className="mt-5 border border-teal/20 bg-[#070b0b] p-6 sm:p-8"><p className="font-mono text-[8px] uppercase text-teal">Step 03 · Anchor the model</p><h2 className="mt-2 font-display text-5xl">{isEquipment ? "Tell OVERHAUL what the scan cannot know." : "Fill what the evidence cannot know."}</h2><p className="mt-3 max-w-3xl text-[11px] leading-5 text-steel">Explicit inputs are stored as engineering anchors. They are passed into twin reconstruction and later calculations instead of being silently guessed.</p><div className="mt-8 grid gap-5 md:grid-cols-2"><Field label="Asset / site name" value={siteName} set={setSiteName} placeholder={assetClass}/><Field label="Age (years)" value={age} set={setAge} placeholder="optional" type="number"/>{!isEquipment ? <><Field label="Floor area (m²)" value={details.floor_area_m2 || ""} set={(value) => setDetails((current) => ({ ...current, floor_area_m2: value }))} type="number"/><Field label="Height (m)" value={details.geometry_height_m || ""} set={(value) => setDetails((current) => ({ ...current, geometry_height_m: value }))} type="number"/><Field label="Electricity tariff (₹/kWh)" value={details.electricity_rate_inr_per_kwh || ""} set={(value) => setDetails((current) => ({ ...current, electricity_rate_inr_per_kwh: value }))} type="number"/><Field label="HVAC capacity (kW)" value={details.capacity_kw || ""} set={(value) => setDetails((current) => ({ ...current, capacity_kw: value }))} type="number"/></> : <><Field label="Rated capacity (kW)" value={details.capacity_kw || ""} set={(value) => setDetails((current) => ({ ...current, capacity_kw: value }))} type="number"/><Field label="Observed load / duty (kW)" value={details.load_kw || ""} set={(value) => setDetails((current) => ({ ...current, load_kw: value }))} type="number"/><Field label="Observed input power (kW)" value={details.power_kw || ""} set={(value) => setDetails((current) => ({ ...current, power_kw: value }))} type="number"/><Field label="Annual runtime (h/yr)" value={details.annual_hours || ""} set={(value) => setDetails((current) => ({ ...current, annual_hours: value }))} type="number"/><Field label="Electricity tariff (₹/kWh)" value={details.electricity_rate_inr_per_kwh || ""} set={(value) => setDetails((current) => ({ ...current, electricity_rate_inr_per_kwh: value }))} type="number"/><Field label="Bill history covered (months)" value={details.bill_history_months || ""} set={(value) => setDetails((current) => ({ ...current, bill_history_months: value }))} type="number"/><Field label="Bill energy in that period (kWh)" value={details.bill_energy_kwh || ""} set={(value) => setDetails((current) => ({ ...current, bill_energy_kwh: value }))} type="number"/></>}<div className="md:col-span-2 border border-steel/10 bg-black/15 p-4"><div className="flex items-center justify-between gap-4"><div><p className="font-mono text-[8px] uppercase text-teal">Twin reconstruction chain</p><p className="mt-1 text-[9px] text-steel">{isEquipment ? "Scan → nameplate/model → bill history → age + operating anchors → 3D/CAD asset → performance reference → retrofit what-if" : "Plan / scan → rooms + walls + assets → engineering anchors → system behaviour → retrofit what-if"}</p></div><span className="font-mono text-[8px] uppercase text-steel">{modelState === "ready" ? "TWIN READY" : "FINAL PASS"}</span></div></div></div><div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-steel/15 pt-5"><p className="max-w-2xl text-[8px] leading-4 text-steel">No synthetic geometry, savings or payback is injected. A missing measurement stays missing and becomes a next-evidence requirement.</p><button type="button" onClick={() => void submit()} disabled={running || !canEvidence || !assetClass} className="border border-teal/45 bg-teal/[.08] px-6 py-4 font-mono text-[8px] uppercase tracking-[.14em] text-teal disabled:opacity-30">{running ? `Reading + reconstructing ${progress}/${Math.max(files.length, 1)}` : "Build twin & enter retrofit workspace →"}</button></div></div></div></motion.section>}
        </AnimatePresence>
      </div>
    </main>
  );
}

function hasFloorplan(items: EvidenceItem[]) { return items.some((item) => /floor|plan|layout|blueprint|drawing/i.test(item.name)); }
function ModeCard({ title, note, accent, onClick }: { title: string; note: string; accent: "teal" | "amber"; onClick: () => void }) { return <button type="button" onClick={onClick} className={`group relative overflow-hidden border p-6 text-left transition hover:-translate-y-1 ${accent === "teal" ? "border-teal/25 bg-teal/[.025] hover:border-teal/55" : "border-amber-200/20 bg-amber-200/[.015] hover:border-amber-200/45"}`}><span className={`relative font-mono text-[8px] uppercase ${accent === "teal" ? "text-teal" : "text-amber-200"}`}>Enter →</span><h2 className="relative mt-4 font-display text-4xl">{title}</h2><p className="relative mt-2 text-[10px] leading-5 text-steel">{note}</p></button>; }
function Select({ label, note, active, amber, onClick }: { label: string; note: string; active: boolean; amber?: boolean; onClick: () => void }) { return <button type="button" onClick={onClick} className={`border p-5 text-left transition hover:-translate-y-0.5 ${active ? amber ? "border-amber-200/45 bg-amber-200/[.03]" : "border-teal/45 bg-teal/[.05]" : "border-steel/15 bg-[#080c0c]"}`}><div className="flex items-center justify-between"><p className="font-display text-2xl">{label}</p>{active ? <span className={amber ? "text-amber-200" : "text-teal"}>●</span> : null}</div><p className="mt-1 text-[9px] leading-4 text-steel">{note}</p></button>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="border border-steel/10 p-3"><p className="font-mono text-[7px] uppercase text-steel">{label}</p><p className="mt-1 text-[10px] text-paper">{value}</p></div>; }
function Field({ label, value, set, placeholder, type = "text" }: { label: string; value: string; set: (value: string) => void; placeholder?: string; type?: string }) { return <label className="block"><span className="font-mono text-[8px] uppercase tracking-[.1em] text-steel">{label}</span><input type={type} value={value} onChange={(event) => set(event.target.value)} placeholder={placeholder} min={type === "number" ? "0" : undefined} step={type === "number" ? "any" : undefined} className="mt-2 w-full border border-steel/15 bg-black/20 px-3 py-3 text-[11px] outline-none focus:border-teal/45"/></label>; }
