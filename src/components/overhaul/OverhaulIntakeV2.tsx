"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

type Scope = "building" | "facility" | "equipment";
type Goal = "energy" | "performance" | "comfort" | "reliability" | "retrofit";
type Industry = "residential" | "commercial" | "healthcare" | "hospitality" | "education" | "retail" | "industrial" | "warehouse" | "cold_storage" | "data_center" | "campus" | "other";
type EvidenceMode = "scan" | "camera" | "upload";

type EvidenceItem = {
  id: string;
  kind: "scan" | "photo" | "document";
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
const goals: Array<[Goal, string]> = [["energy", "Reduce energy"], ["performance", "Improve performance"], ["comfort", "Improve comfort"], ["reliability", "Fix reliability"], ["retrofit", "Plan retrofit"]];

function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }

export default function OverhaulIntakeV2() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [scope, setScope] = useState<Scope>("building");
  const [industry, setIndustry] = useState<Industry>("commercial");
  const [goal, setGoal] = useState<Goal>("retrofit");
  const [equipmentType, setEquipmentType] = useState("");
  const [siteName, setSiteName] = useState("");
  const [mode, setMode] = useState<EvidenceMode>("scan");
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisCount, setAnalysisCount] = useState(0);

  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  const addFiles = (kind: EvidenceItem["kind"], files: File[]) => {
    const next = files.filter((f) => f.size > 0 && f.size <= 25 * 1024 * 1024).slice(0, 8 - evidence.length).map((file) => ({
      id: uid(), kind, name: file.name, type: file.type, size: file.size,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null, file,
    }));
    setEvidence((current) => [...current, ...next]);
    setAnalysisError(null);
  };

  const openCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraOpen(true);
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : "Camera access unavailable.");
    }
  };

  const closeCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOpen(false);
  };

  const captureFrame = async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280; canvas.height = video.videoHeight || 720;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    if (!blob) return;
    addFiles("scan", [new File([blob], `scan-${evidence.length + 1}.jpg`, { type: "image/jpeg" })]);
  };

  const analyzeEvidence = async () => {
    if (!evidence.length || analyzing) return;
    setAnalyzing(true); setAnalysisError(null); setAnalysisCount(0);
    try {
      const results: unknown[] = [];
      for (const item of evidence.slice(0, 5)) {
        const form = new FormData();
        form.append("file", item.file, item.name); form.append("evidenceId", item.id); form.append("evidenceKind", item.kind);
        form.append("subject", scope); form.append("industry", industry);
        const response = await fetch("/api/evidence/extract", { method: "POST", body: form });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Evidence analysis failed");
        results.push({ ...payload.result, evidenceId: item.id, sourceKind: item.kind, sourceName: item.name });
        setAnalysisCount((v) => v + 1);
      }
      const assessment = {
        assessmentSubject: scope, assessmentGoal: goal, industry,
        siteName: siteName.trim() || null,
        assetClass: scope === "equipment" ? equipmentType || "Other machinery" : null,
        createdAt: new Date().toISOString(),
        evidence: evidence.map(({ file: _file, previewUrl: _preview, ...item }) => item),
        context: { industry, siteName: siteName.trim() || null, assetClass: scope === "equipment" ? equipmentType || "Other machinery" : null },
        status: "evidence-analyzed" as const,
      };
      sessionStorage.setItem("overhaul:evidence-extractions", JSON.stringify(results));
      sessionStorage.setItem("overhaul:assessment", JSON.stringify(assessment));
      router.push("/assessment");
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "Evidence analysis failed.");
    } finally { setAnalyzing(false); }
  };

  const scopeCopy = scope === "building" ? "Rooms, envelope, HVAC and comfort" : scope === "facility" ? "Systems, production and asset fleet" : "Machine identity, condition and performance";

  return (
    <main className="min-h-screen bg-[#050707] text-paper">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 border-r border-steel/15 bg-[#070909] lg:flex lg:flex-col">
          <div className="border-b border-steel/15 px-6 py-6">
            <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-teal">OVERHAUL</p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.15em] text-steel">Engineering intelligence</p>
          </div>
          <div className="px-4 py-6">
            <p className="px-2 font-mono text-[8px] uppercase tracking-[0.16em] text-steel">New assessment</p>
            <div className="mt-3 space-y-1">
              {[["01", "Asset", "Choose the system"], ["02", "Evidence", "Show the physical state"], ["03", "Model", "OVERHAUL constructs the twin"], ["04", "Decision", "Simulate before spending"]].map(([n, title, sub], index) => (
                <div key={n} className={`rounded-sm border px-3 py-3 ${index < 2 ? "border-teal/25 bg-teal/5" : "border-transparent"}`}>
                  <div className="flex gap-3"><span className="font-mono text-[8px] text-teal">{n}</span><div><p className="text-xs">{title}</p><p className="mt-1 text-[9px] text-steel">{sub}</p></div></div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-auto border-t border-steel/15 p-6">
            <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-steel">Pipeline</p>
            <div className="mt-3 space-y-2 text-[9px] font-mono uppercase tracking-[0.08em] text-steel"><p><span className="text-teal">●</span> Evidence gate</p><p><span className="text-steel/50">○</span> Physics model</p><p><span className="text-steel/50">○</span> What-if</p><p><span className="text-steel/50">○</span> Decision</p></div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="flex items-center justify-between border-b border-steel/15 px-5 py-4 sm:px-8">
            <div><p className="font-mono text-[8px] uppercase tracking-[0.16em] text-teal">Assessment workspace</p><h1 className="mt-1 font-display text-2xl">Start with evidence.</h1></div>
            <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-steel">{evidence.length}/8 evidence items</div>
          </header>

          <div className="mx-auto max-w-[1500px] p-5 sm:p-8">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_360px]">
              <section className="relative min-h-[620px] overflow-hidden border border-steel/15 bg-[#080c0c]">
                <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "linear-gradient(rgba(168,180,177,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(168,180,177,.12) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
                <div className="relative z-10 flex h-full min-h-[620px] flex-col p-5 sm:p-7">
                  <div className="flex flex-col gap-4 border-b border-steel/15 pb-5 sm:flex-row sm:items-start sm:justify-between">
                    <div><p className="font-mono text-[9px] uppercase tracking-[0.15em] text-teal">Live workspace</p><h2 className="mt-2 max-w-2xl font-display text-4xl sm:text-5xl">Show OVERHAUL the real asset.</h2><p className="mt-3 max-w-2xl text-xs leading-5 text-steel">Don't fill out a questionnaire. Capture a room, machine, nameplate or document and let the evidence drive the next question.</p></div>
                    <div className="border border-steel/15 px-3 py-2 font-mono text-[8px] uppercase tracking-[0.13em] text-steel">Decision-first intake</div>
                  </div>

                  <div className="mt-6 grid gap-3 md:grid-cols-3">
                    {(["building", "facility", "equipment"] as Scope[]).map((item) => (
                      <button key={item} type="button" onClick={() => setScope(item)} className={`group relative min-h-32 overflow-hidden border p-4 text-left transition ${scope === item ? "border-teal/60 bg-teal/[0.08]" : "border-steel/15 bg-black/10 hover:border-steel/40"}`}>
                        <div className="absolute right-3 top-3 font-mono text-[8px] text-steel">{scope === item ? "ACTIVE" : ""}</div>
                        <p className="font-mono text-[9px] uppercase text-teal">{item}</p><p className="mt-5 text-lg">{item === "building" ? "Building" : item === "facility" ? "Facility" : "Equipment"}</p><p className="mt-1 max-w-[16rem] text-[10px] leading-4 text-steel">{item === scope ? scopeCopy : item === "building" ? "Envelope + HVAC + comfort" : item === "facility" ? "Plant + systems + fleet" : "Machine + performance + condition"}</p>
                      </button>
                    ))}
                  </div>

                  <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_250px]">
                    <div className="border border-steel/15 bg-black/10 p-4 sm:p-5">
                      <div className="flex items-center justify-between gap-3"><div><p className="font-mono text-[8px] uppercase tracking-[0.14em] text-steel">Evidence capture</p><p className="mt-1 text-xs">Use whichever source is closest to the physical asset.</p></div><div className="flex gap-1 border border-steel/15 p-1">{([["scan", "Scan"], ["camera", "Camera"], ["upload", "Upload"]] as Array<[EvidenceMode, string]>).map(([m, label]) => <button key={m} type="button" onClick={() => setMode(m)} className={`px-3 py-1.5 font-mono text-[8px] uppercase tracking-[0.1em] ${mode === m ? "bg-paper text-navy" : "text-steel"}`}>{label}</button>)}</div></div>

                      {mode === "scan" ? <div className="mt-5 grid min-h-52 place-items-center border border-dashed border-teal/25 bg-teal/[0.025] text-center"><div><div className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-teal/40 text-teal">⌁</div><p className="mt-3 text-sm">Guided spatial capture</p><p className="mt-1 max-w-sm text-[10px] leading-4 text-steel">Front → left → right → nameplate. OVERHAUL will extract visible geometry, identity and operating clues.</p><button type="button" onClick={openCamera} className="mt-4 border border-teal/50 px-4 py-2 font-mono text-[8px] uppercase tracking-[0.13em] text-teal">Start scan</button></div></div> : null}
                      {mode === "camera" ? <div className="mt-5 min-h-52 border border-steel/15 p-4"><button type="button" onClick={cameraOpen ? closeCamera : openCamera} className="border border-teal/50 px-4 py-2 font-mono text-[8px] uppercase tracking-[0.12em] text-teal">{cameraOpen ? "Close camera" : "Open camera"}</button>{cameraError ? <p className="mt-3 text-xs text-clay">{cameraError}</p> : null}</div> : null}
                      {mode === "upload" ? <label className="mt-5 flex min-h-52 cursor-pointer items-center justify-center border border-dashed border-steel/25 bg-black/10 text-center hover:border-teal/40"><div><p className="text-sm">Drop evidence here</p><p className="mt-1 text-[10px] text-steel">Photos · scans · bills · PDFs · nameplates</p><input type="file" multiple accept="image/*,.pdf" className="hidden" onChange={(e) => addFiles("photo", Array.from(e.target.files ?? []))} /></div></label> : null}
                      {cameraOpen ? <div className="mt-4 overflow-hidden border border-teal/25"><video ref={videoRef} autoPlay playsInline muted className="aspect-video w-full bg-black object-cover"/><div className="flex gap-2 p-3"><button type="button" onClick={captureFrame} className="border border-teal px-4 py-2 font-mono text-[8px] uppercase tracking-[0.12em] text-teal">Capture frame</button><button type="button" onClick={closeCamera} className="border border-steel/20 px-4 py-2 font-mono text-[8px] uppercase tracking-[0.12em] text-steel">Done</button></div></div> : null}

                      {evidence.length ? <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">{evidence.map((item) => <motion.div layout key={item.id} className="overflow-hidden border border-steel/15 bg-black/20">{item.previewUrl ? <img src={item.previewUrl} alt="Evidence preview" className="aspect-[4/3] w-full object-cover"/> : <div className="grid aspect-[4/3] place-items-center text-[9px] font-mono text-steel">DOCUMENT</div>}<div className="p-2"><p className="truncate text-[9px]">{item.name}</p><button type="button" onClick={() => setEvidence((current) => current.filter((x) => x.id !== item.id))} className="mt-1 text-[8px] uppercase text-clay">Remove</button></div></motion.div>)}</div> : null}
                    </div>
                    <div className="space-y-3">
                      <label className="block border border-steel/15 bg-black/10 p-4"><span className="font-mono text-[8px] uppercase tracking-[0.12em] text-steel">Context</span><input value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="Site or asset name" className="mt-2 w-full border-b border-steel/20 bg-transparent py-2 text-sm outline-none focus:border-teal" /></label>
                      {scope === "equipment" ? <label className="block border border-steel/15 bg-black/10 p-4"><span className="font-mono text-[8px] uppercase tracking-[0.12em] text-steel">Asset class</span><select value={equipmentType} onChange={(e) => setEquipmentType(e.target.value)} className="mt-2 w-full border-b border-steel/20 bg-transparent py-2 text-sm outline-none"><option value="">Let evidence identify it</option>{equipmentOptions.map((x) => <option key={x} value={x}>{x}</option>)}</select></label> : null}
                      <div className="border border-steel/15 bg-black/10 p-4"><span className="font-mono text-[8px] uppercase tracking-[0.12em] text-steel">Industry</span><select value={industry} onChange={(e) => setIndustry(e.target.value as Industry)} className="mt-2 w-full border-b border-steel/20 bg-transparent py-2 text-sm outline-none">{industries.map(([x, label]) => <option key={x} value={x}>{label}</option>)}</select></div>
                      <div className="border border-steel/15 bg-black/10 p-4"><span className="font-mono text-[8px] uppercase tracking-[0.12em] text-steel">Why now?</span><div className="mt-3 space-y-1">{goals.map(([x, label]) => <button key={x} type="button" onClick={() => setGoal(x)} className={`w-full border px-2 py-2 text-left text-[9px] ${goal === x ? "border-teal/50 bg-teal/5 text-teal" : "border-transparent text-steel hover:border-steel/20 hover:text-paper"}`}>{label}</button>)}</div></div>
                    </div>
                  </div>
                </div>
              </section>

              <aside className="h-fit border border-steel/15 bg-[#080c0c] p-5 sm:p-6 xl:sticky xl:top-5">
                <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-teal">Ready state</p>
                <div className="mt-4 border border-steel/15 p-4"><p className="text-sm">{scope[0].toUpperCase() + scope.slice(1)} assessment</p><p className="mt-1 text-[10px] text-steel">{industries.find(([x]) => x === industry)?.[1]} · {goals.find(([x]) => x === goal)?.[1]}</p></div>
                <div className="mt-4 space-y-2 font-mono text-[9px] uppercase tracking-[0.1em]
"><p className={scope ? "text-paper" : "text-steel/40"}>✓ asset scope</p><p className={industry ? "text-paper" : "text-steel/40"}>✓ operating domain</p><p className={evidence.length ? "text-teal" : "text-steel/40"}>{evidence.length ? "✓" : "○"} physical evidence</p><p className="text-steel/40">○ engineering model</p><p className="text-steel/40">○ simulation</p></div>
                {analysisError ? <div className="mt-4 border border-clay/25 bg-clay/5 p-3 text-[10px] leading-4 text-clay">{analysisError}</div> : null}
                {analyzing ? <div className="mt-4 border border-teal/25 bg-teal/5 p-3 text-[10px] text-teal">Extracting evidence {analysisCount}/5…</div> : null}
                <button disabled={!evidence.length || analyzing} onClick={analyzeEvidence} type="button" className="mt-6 w-full border border-teal bg-teal px-4 py-3 font-mono text-[9px] uppercase tracking-[0.14em] text-navy disabled:cursor-not-allowed disabled:opacity-30">{analyzing ? "Constructing model…" : "Construct assessment"}</button>
                <p className="mt-3 text-center text-[9px] leading-4 text-steel">You provide evidence. OVERHAUL decides what needs to be measured next.</p>
              </aside>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
