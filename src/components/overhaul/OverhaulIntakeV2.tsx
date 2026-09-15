"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import RoomScanOverlay from "./RoomScanOverlay";
import { normalizeExtractionObservations } from "@/lib/evidence/normalizeForEngineering";

type Scope = "building" | "facility" | "equipment";
type Goal = "energy" | "performance" | "comfort" | "reliability" | "retrofit";
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

const industries: Array<[Industry, string]> = [
  ["residential", "Residential"], ["commercial", "Commercial"], ["healthcare", "Healthcare"], ["hospitality", "Hospitality"],
  ["education", "Education"], ["retail", "Retail"], ["industrial", "Industrial"], ["warehouse", "Warehouse"],
  ["cold_storage", "Cold storage"], ["data_center", "Data center"], ["campus", "Campus"], ["other", "Other"],
];
const equipmentOptions = ["Chiller", "Compressor", "Pump", "Boiler", "Cooling tower", "Fan / motor", "Refrigeration", "Process equipment"];
const goals: Array<[Goal, string, string]> = [
  ["energy", "Energy", "Find avoidable consumption"], ["performance", "Performance", "Compare expected vs observed"],
  ["comfort", "Comfort", "Reduce thermal discomfort"], ["reliability", "Reliability", "Find failure risks"], ["retrofit", "Retrofit", "Prioritize interventions"],
];

function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
function inferKind(file: File): EvidenceKind {
  const name = file.name.toLowerCase();
  if (name.includes("scan") || name.includes("capture")) return "scan";
  if (/\.(csv|tsv|json)$/.test(name) || /^(text\/(csv|tab-separated-values)|application\/json)$/.test(file.type)) return "dataset";
  return file.type === "application/pdf" ? "document" : "photo";
}

async function analyzeWithConcurrency(items: EvidenceItem[], scope: Scope, industry: Industry, onProgress: () => void) {
  const results: unknown[] = [];
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
        const payload = await response.json() as { result?: { observations?: Array<{ field: string; value: string; numericValue: number | null; unit: string | null; confidence: number; sourceText?: string; notes?: string }> }; error?: string };
        if (!response.ok || !payload.result) throw new Error(payload.error || "Evidence analysis failed");
        results[index] = normalizeExtractionObservations({ ...payload.result, evidenceId: item.id, sourceKind: item.kind, sourceName: item.name });
      } catch (error) {
        failures[index] = `${item.name}: ${error instanceof Error ? error.message : "analysis failed"}`;
      } finally {
        onProgress();
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(3, items.length) }, () => worker()));
  return { results: results.filter(Boolean), failures: failures.filter(Boolean) };
}

export default function OverhaulIntakeV2() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [scope, setScope] = useState<Scope>("building");
  const [industry, setIndustry] = useState<Industry>("commercial");
  const [goal, setGoal] = useState<Goal>("retrofit");
  const [equipmentType, setEquipmentType] = useState("");
  const [siteName, setSiteName] = useState("");
  const [assetAge, setAssetAge] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisCount, setAnalysisCount] = useState(0);

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);

  const addFiles = (kind: EvidenceKind | null, files: File[]) => {
    const remaining = Math.max(0, 8 - evidence.length);
    const next = files
      .filter((file) => file.size > 0 && file.size <= 25 * 1024 * 1024)
      .slice(0, remaining)
      .map((file) => ({ id: uid(), kind: kind || inferKind(file), name: file.name || "Untitled evidence", type: file.type, size: file.size, previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null, file }));
    setEvidence((current) => [...current, ...next]);
    setAnalysisError(null);
  };

  const removeEvidence = (id: string) => {
    setEvidence((current) => {
      const item = current.find((x) => x.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return current.filter((x) => x.id !== id);
    });
  };

  const openCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      streamRef.current = stream;
      setCameraOpen(true);
      requestAnimationFrame(() => { if (videoRef.current) videoRef.current.srcObject = stream; });
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : "Camera access unavailable.");
    }
  };

  const closeCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  };

  const captureFrame = async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    if (blob) addFiles("scan", [new File([blob], `scan-${evidence.length + 1}.jpg`, { type: "image/jpeg" })]);
  };

  const analyzeEvidence = async () => {
    if (!evidence.length || analyzing) return;
    setAnalyzing(true);
    setAnalysisError(null);
    setAnalysisCount(0);
    try {
      const { results, failures } = await analyzeWithConcurrency(evidence, scope, industry, () => setAnalysisCount((value) => value + 1));
      if (!results.length) throw new Error(failures[0] || "No evidence could be analyzed.");
      const assessment = {
        assessmentSubject: scope,
        assessmentGoal: goal,
        industry,
        siteName: siteName.trim() || null,
        assetClass: scope === "equipment" ? equipmentType || "Other machinery" : null,
        assetAgeYears: assetAge.trim() ? Number(assetAge) : null,
        createdAt: new Date().toISOString(),
        evidence: evidence.map(({ file: _file, previewUrl: _preview, ...item }) => item),
        context: { industry, siteName: siteName.trim() || null, assetClass: scope === "equipment" ? equipmentType || "Other machinery" : null, assetAgeYears: assetAge.trim() ? Number(assetAge) : null },
        status: "evidence-analyzed" as const,
      };
      sessionStorage.setItem("overhaul:evidence-extractions", JSON.stringify(results));
      sessionStorage.setItem("overhaul:assessment", JSON.stringify(assessment));
      if (failures.length) setAnalysisError(`${results.length} analyzed. ${failures.length} skipped: ${failures.join(" · ")}`);
      window.dispatchEvent(new CustomEvent("overhaul:evidence-change"));
      router.push("/assessment");
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "Evidence analysis failed.");
    } finally {
      setAnalyzing(false);
    }
  };

  const scopeLabel = scope === "building" ? "Building" : scope === "facility" ? "Facility" : "Equipment";
  const scanLabel = scope === "equipment" ? "Scan machine / appliance" : "Scan room / space";

  return (
    <main className="min-h-screen bg-[#050707] text-paper">
      <RoomScanOverlay scope={scope} />
      <div className="flex min-h-screen">
        <aside className="hidden w-[240px] shrink-0 border-r border-steel/15 bg-[#070909] lg:flex lg:flex-col">
          <div className="px-6 py-7"><p className="font-mono text-[9px] uppercase tracking-[0.26em] text-teal">OVERHAUL</p><p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-steel">Engineering intelligence</p></div>
          <div className="border-y border-steel/10 px-4 py-5"><p className="px-2 font-mono text-[8px] uppercase tracking-[0.16em] text-steel">Current inspection</p><div className="mt-3 border border-teal/25 bg-teal/[0.04] px-3 py-3"><p className="font-mono text-[8px] uppercase text-teal">{scopeLabel}</p><p className="mt-1 text-[10px] text-steel">Start with evidence. OVERHAUL fills nothing in by guesswork.</p></div></div>
          <nav className="px-4 py-5">{[["01", "Observe"], ["02", "Understand"], ["03", "Simulate"], ["04", "Decide"]].map(([n, title], index) => <div key={n} className={`mb-1 border px-3 py-3 ${index === 0 ? "border-teal/20 bg-teal/[0.04]" : "border-transparent"}`}><div className="flex gap-3"><span className="font-mono text-[8px] text-teal">{n}</span><p className="text-[10px]">{title}</p></div></div>)}</nav>
          <div className="mt-auto border-t border-steel/10 px-6 py-5"><p className="font-mono text-[8px] uppercase tracking-[0.12em] text-steel">Guardrails</p><p className="mt-2 text-[8px] leading-4 text-steel">Every engineering number must remain traceable to evidence or an explicit user input.</p></div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="flex items-center justify-between border-b border-steel/15 px-5 py-4 sm:px-8"><div><p className="font-mono text-[8px] uppercase tracking-[0.16em] text-teal">New assessment</p><h1 className="mt-1 font-display text-2xl sm:text-3xl">Start with what you have.</h1></div><button type="button" onClick={() => fileInput.current?.click()} className="border border-paper/25 px-3 py-2 font-mono text-[8px] uppercase tracking-[0.12em] text-paper hover:border-teal hover:text-teal">+ Add evidence</button></header>

          <div className="mx-auto max-w-[1450px] p-5 sm:p-8"><div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_310px]"><div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">{(["building", "facility", "equipment"] as Scope[]).map((item) => <button key={item} type="button" onClick={() => setScope(item)} className={`relative border p-4 text-left transition ${scope === item ? "border-teal/55 bg-teal/[0.07]" : "border-steel/15 bg-[#080c0c] hover:border-steel/40"}`}><p className="font-mono text-[8px] uppercase tracking-[0.15em] text-teal">{item}</p><p className="mt-2 font-display text-2xl">{item === "building" ? "Building" : item === "facility" ? "Facility" : "Equipment"}</p><p className="mt-1 text-[9px] leading-4 text-steel">{item === "building" ? "Home, apartment, office, school, hospital" : item === "facility" ? "Plant, warehouse, cold store, campus" : "Chiller, pump, compressor, motor, boiler or other machine"}</p>{scope === item ? <span className="mt-3 inline-block font-mono text-[7px] uppercase tracking-[0.12em] text-teal">Selected</span> : null}</button>)}</div>

            <div className="border border-steel/15 bg-[#080c0c]"><div className="border-b border-steel/10 px-4 py-4 sm:px-5"><p className="font-mono text-[8px] uppercase tracking-[0.14em] text-teal">Step 1 · Evidence</p><h2 className="mt-1 font-display text-3xl">Show it. Don't describe it.</h2><p className="mt-1 max-w-2xl text-[10px] leading-5 text-steel">Upload whatever already exists: a photo, nameplate, bill, floor plan, drawing, manual, inspection report or meter export. One useful artifact is enough to start.</p></div>
              <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[1.15fr_0.85fr]"><div className={`relative grid min-h-[370px] place-items-center overflow-hidden border bg-black/15 transition ${dragging ? "border-teal bg-teal/[0.04]" : "border-dashed border-steel/25"}`} onDragEnter={(e) => { e.preventDefault(); setDragging(true); }} onDragOver={(e) => e.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(null, Array.from(e.dataTransfer.files)); }}><div className="absolute inset-0 opacity-25" style={{ backgroundImage: "linear-gradient(rgba(138,155,168,.10) 1px,transparent 1px),linear-gradient(90deg,rgba(138,155,168,.10) 1px,transparent 1px)", backgroundSize: "36px 36px" }} /><div className="relative z-10 max-w-lg px-6 text-center"><div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-teal/30 bg-teal/[0.04] font-mono text-xl text-teal">＋</div><p className="mt-4 font-display text-2xl">Drop anything useful.</p><p className="mt-2 text-[10px] leading-5 text-steel">You don't need to know the engineering parameters. OVERHAUL extracts what the evidence actually establishes, records where it came from, and asks only for information that can change the result.</p><div className="mt-5 flex flex-wrap justify-center gap-2"><button type="button" onClick={() => fileInput.current?.click()} className="border border-paper/30 bg-paper px-4 py-2 font-mono text-[8px] uppercase tracking-[0.12em] text-navy">Upload evidence</button><button type="button" onClick={openCamera} className="border border-teal/40 px-4 py-2 font-mono text-[8px] uppercase tracking-[0.12em] text-teal">Use camera</button><button type="button" onClick={() => document.querySelector<HTMLButtonElement>("button[data-room-scan]")?.click()} className="border border-steel/25 px-4 py-2 font-mono text-[8px] uppercase tracking-[0.12em] text-steel hover:text-paper">{scanLabel}</button></div><p className="mt-3 font-mono text-[7px] uppercase tracking-[0.1em] text-steel">Up to 8 artifacts · 25 MB each · images + PDF + CSV / TSV / JSON</p></div></div>
                <div className="flex min-h-[370px] flex-col border border-steel/10 bg-black/10 p-4"><div className="flex items-center justify-between"><p className="font-mono text-[8px] uppercase tracking-[0.14em] text-steel">Evidence shelf</p><span className={`font-mono text-[8px] ${evidence.length ? "text-teal" : "text-steel"}`}>{evidence.length}/8</span></div><div className="mt-3 flex-1 space-y-2 overflow-auto pr-1">{evidence.length ? evidence.map((item, index) => <div key={item.id} className="flex gap-3 border border-steel/10 bg-[#080b0b] p-2.5">{item.previewUrl ? <img src={item.previewUrl} alt="Evidence preview" className="h-14 w-18 shrink-0 object-cover" /> : <div className="grid h-14 w-18 shrink-0 place-items-center bg-steel/[0.05] font-mono text-[7px] text-steel">{item.kind === "dataset" ? "DATA" : item.type === "application/pdf" ? "PDF" : "FILE"}</div>}<div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><p className="truncate text-[9px]">{item.name}</p><span className="font-mono text-[7px] text-steel">0{index + 1}</span></div><p className="mt-1 font-mono text-[7px] uppercase text-steel">{item.kind} · evidence only</p><button type="button" onClick={() => removeEvidence(item.id)} className="mt-2 font-mono text-[7px] uppercase text-clay">Remove</button></div></div>) : <div className="grid h-full place-items-center text-center"><div><p className="text-sm text-steel">Nothing captured yet.</p><p className="mt-1 text-[9px] leading-4 text-steel/70">A single nameplate photo or energy bill is enough to begin.</p></div></div>}</div>{cameraOpen ? <div className="mt-3 overflow-hidden border border-teal/20"><video ref={videoRef} autoPlay playsInline muted className="aspect-video w-full bg-black object-cover"/><div className="flex gap-2 p-2"><button type="button" onClick={captureFrame} className="border border-teal px-3 py-1.5 font-mono text-[7px] uppercase text-teal">Capture</button><button type="button" onClick={closeCamera} className="border border-steel/20 px-3 py-1.5 font-mono text-[7px] uppercase text-steel">Close camera</button></div></div> : null}{cameraError ? <p className="mt-2 text-[9px] text-clay">{cameraError}</p> : null}</div>
              </div></div>

            <div className="border border-steel/15 bg-[#080c0c]"><button type="button" onClick={() => setDetailsOpen((value) => !value)} className="flex w-full items-center justify-between px-4 py-4 text-left sm:px-5"><div><p className="font-mono text-[8px] uppercase tracking-[0.14em] text-steel">Step 2 · Optional context</p><p className="mt-1 text-[10px] text-paper">Help OVERHAUL orient the evidence. Skip anything you don't know.</p></div><span className="font-mono text-[9px] text-teal">{detailsOpen ? "−" : "+"}</span></button>{detailsOpen ? <div className="grid gap-4 border-t border-steel/10 p-4 sm:grid-cols-2 sm:p-5"><label className="block"><span className="font-mono text-[7px] uppercase text-steel">What matters most?</span><div className="mt-2 grid gap-1.5">{goals.map(([value, label, sub]) => <button key={value} type="button" onClick={() => setGoal(value)} className={`border p-2.5 text-left ${goal === value ? "border-teal/35 bg-teal/[0.05]" : "border-steel/10"}`}><p className="text-[9px]">{label}</p><p className="mt-0.5 text-[7px] text-steel">{sub}</p></button>)}</div></label><div className="space-y-4"><label className="block"><span className="font-mono text-[7px] uppercase text-steel">Site / asset name</span><input value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="Optional" className="mt-2 w-full border-b border-steel/20 bg-transparent py-2 text-[10px] outline-none focus:border-teal" /></label><label className="block"><span className="font-mono text-[7px] uppercase text-steel">Industry</span><select value={industry} onChange={(e) => setIndustry(e.target.value as Industry)} className="mt-2 w-full border-b border-steel/20 bg-[#080c0c] py-2 text-[10px] outline-none focus:border-teal">{industries.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{scope === "equipment" ? <><label className="block"><span className="font-mono text-[7px] uppercase text-steel">Known machine class</span><select value={equipmentType} onChange={(e) => setEquipmentType(e.target.value)} className="mt-2 w-full border-b border-steel/20 bg-[#080c0c] py-2 text-[10px] outline-none focus:border-teal"><option value="">Let evidence identify it</option>{equipmentOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="block"><span className="font-mono text-[7px] uppercase text-steel">Approximate age, if known</span><input inputMode="numeric" type="number" min="0" max="100" value={assetAge} onChange={(e) => setAssetAge(e.target.value)} placeholder="Optional" className="mt-2 w-full border-b border-steel/20 bg-transparent py-2 text-[10px] outline-none focus:border-teal" /></label></> : null}</div></div> : null}</div>
          </div>

          <aside className="h-fit border border-steel/15 bg-[#080c0c] p-5 xl:sticky xl:top-5"><p className="font-mono text-[8px] uppercase tracking-[0.15em] text-teal">Before analysis</p><h2 className="mt-1 font-display text-2xl">{scopeLabel}</h2><p className="mt-1 text-[9px] leading-4 text-steel">{goal === "retrofit" ? "Find and compare justified retrofit interventions." : goals.find(([x]) => x === goal)?.[2]}</p><div className="mt-5 border border-steel/10 p-4"><p className="font-mono text-[8px] uppercase tracking-[0.12em] text-steel">What happens next</p><div className="mt-3 space-y-2 text-[9px]"><p><span className="text-teal">01</span> Extract facts + provenance</p><p className="text-steel"><span className="text-teal">02</span> Build the engineering baseline</p><p className="text-steel"><span className="text-teal">03</span> Identify missing decision-critical evidence</p><p className="text-steel"><span className="text-teal">04</span> Simulate only supported interventions</p><p className="text-steel"><span className="text-teal">05</span> Rank the decision and verify it later</p></div></div><div className="mt-5 border border-gold/20 bg-gold/[0.035] p-3"><p className="font-mono text-[7px] uppercase tracking-[0.12em] text-gold">Accuracy rule</p><p className="mt-2 text-[9px] leading-4 text-steel">Evidence values are kept traceable. Known unit conversions are deterministic. Unsupported values stay unknown and block calculations that would otherwise be guesses.</p></div>{analysisError ? <div className="mt-4 border border-clay/25 bg-clay/5 p-3 text-[9px] leading-4 text-clay">{analysisError}</div> : null}{analyzing ? <div className="mt-4 border border-teal/25 bg-teal/5 p-3"><p className="font-mono text-[8px] uppercase text-teal">Reading evidence</p><p className="mt-1 text-[9px] text-steel">{analysisCount}/{evidence.length} artifacts analyzed.</p><div className="mt-2 h-1 overflow-hidden bg-steel/10"><div className="h-full bg-teal transition-all" style={{ width: `${Math.round((analysisCount / Math.max(evidence.length, 1)) * 100)}%` }} /></div></div> : null}<button disabled={!evidence.length || analyzing} onClick={analyzeEvidence} type="button" className="mt-5 w-full border border-teal bg-teal px-4 py-3 font-mono text-[8px] uppercase tracking-[0.13em] text-navy disabled:cursor-not-allowed disabled:opacity-25">{analyzing ? `Inspecting ${analysisCount}/${evidence.length}…` : "Analyze & build assessment"}</button><p className="mt-3 text-center text-[8px] leading-4 text-steel">No “95% ready” meter. Readiness is established from the evidence and model completeness, not the number of files uploaded.</p></aside>
        </div></div>
          <input ref={fileInput} type="file" multiple accept="image/*,.pdf,.csv,.tsv,.json" className="hidden" onChange={(e) => { addFiles(null, Array.from(e.target.files ?? [])); e.currentTarget.value = ""; }} />
        </section>
      </div>
    </main>
  );
}
