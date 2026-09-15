"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import RoomScanOverlay from "./RoomScanOverlay";

type Scope = "building" | "facility" | "equipment";
type Goal = "energy" | "performance" | "comfort" | "reliability" | "retrofit";
type Industry = "residential" | "commercial" | "healthcare" | "hospitality" | "education" | "retail" | "industrial" | "warehouse" | "cold_storage" | "data_center" | "campus" | "other";
type EvidenceKind = "scan" | "photo" | "document";

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
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisCount, setAnalysisCount] = useState(0);

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);

  const addFiles = (kind: EvidenceKind, files: File[]) => {
    const remaining = Math.max(0, 8 - evidence.length);
    const next = files.filter((file) => file.size > 0 && file.size <= 25 * 1024 * 1024).slice(0, remaining).map((file) => ({
      id: uid(), kind, name: file.name, type: file.type, size: file.size,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null, file,
    }));
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
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
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
        form.append("file", item.file, item.name);
        form.append("evidenceId", item.id);
        form.append("evidenceKind", item.kind);
        form.append("subject", scope);
        form.append("industry", industry);
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
        assetAgeYears: assetAge.trim() ? Number(assetAge) : null,
        createdAt: new Date().toISOString(),
        evidence: evidence.map(({ file: _file, previewUrl: _preview, ...item }) => item),
        context: { industry, siteName: siteName.trim() || null, assetClass: scope === "equipment" ? equipmentType || "Other machinery" : null, assetAgeYears: assetAge.trim() ? Number(assetAge) : null },
        status: "evidence-analyzed" as const,
      };
      sessionStorage.setItem("overhaul:evidence-extractions", JSON.stringify(results));
      sessionStorage.setItem("overhaul:assessment", JSON.stringify(assessment));
      window.dispatchEvent(new CustomEvent("overhaul:evidence-change"));
      router.push("/assessment");
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "Evidence analysis failed.");
    } finally { setAnalyzing(false); }
  };

  const scopeLabel = scope === "building" ? "Building" : scope === "facility" ? "Facility" : "Equipment";
  const scopeSummary = scope === "building" ? "Envelope · HVAC · comfort" : scope === "facility" ? "Systems · production · fleet" : "Identity · performance · condition";
  const activeGoal = goals.find(([value]) => value === goal)?.[1] ?? "Retrofit";
  const readiness = evidence.length ? Math.min(92, 24 + evidence.length * 12) : 8;
  const scanLabel = scope === "equipment" ? "Scan machine / appliance" : "Scan room / space";

  return (
    <main className="min-h-screen bg-[#050707] text-paper">
      <RoomScanOverlay scope={scope} />
      <div className="flex min-h-screen">
        <aside className="hidden w-[250px] shrink-0 border-r border-steel/15 bg-[#070909] lg:flex lg:flex-col">
          <div className="px-6 py-7">
            <p className="font-mono text-[9px] uppercase tracking-[0.26em] text-teal">OVERHAUL</p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-steel">Engineering intelligence</p>
          </div>
          <div className="border-y border-steel/10 px-4 py-5">
            <p className="px-2 font-mono text-[8px] uppercase tracking-[0.16em] text-steel">Workspace</p>
            <button className="mt-3 w-full border border-teal/25 bg-teal/5 px-3 py-3 text-left"><p className="font-mono text-[8px] uppercase text-teal">New assessment</p><p className="mt-2 text-xs">{scopeLabel}</p><p className="mt-1 text-[9px] text-steel">{scopeSummary}</p></button>
          </div>
          <nav className="px-4 py-5">
            {[["01", "Observe", "Evidence + perception"], ["02", "Model", "Twin + uncertainty"], ["03", "Simulate", "Physics + what-if"], ["04", "Decide", "Economics + sequence"]].map(([n, title, sub], index) => (
              <div key={n} className={`mb-1 border px-3 py-3 ${index === 0 ? "border-teal/20 bg-teal/[0.04]" : "border-transparent"}`}><div className="flex gap-3"><span className="font-mono text-[8px] text-teal">{n}</span><div><p className="text-[11px]">{title}</p><p className="mt-1 text-[9px] text-steel">{sub}</p></div></div></div>
            ))}
          </nav>
          <div className="mt-auto border-t border-steel/10 px-6 py-5"><p className="font-mono text-[8px] uppercase tracking-[0.12em] text-steel">Research gap coverage</p><div className="mt-3 space-y-1.5 text-[8px] font-mono uppercase text-steel"><p><span className="text-teal">●</span> uncertainty traceability</p><p><span className="text-teal">●</span> expected ↔ observed</p><p><span className="text-steel/60">●</span> measure & verify</p><p><span className="text-steel/60">●</span> lifecycle memory</p></div></div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="flex items-center justify-between border-b border-steel/15 px-5 py-4 sm:px-8">
            <div><p className="font-mono text-[8px] uppercase tracking-[0.16em] text-teal">Operational assessment</p><h1 className="mt-1 font-display text-2xl sm:text-3xl">Bring the real asset in.</h1></div>
            <div className="flex items-center gap-3"><div className="hidden text-right sm:block"><p className="font-mono text-[8px] uppercase text-steel">Decision readiness</p><p className="mt-1 font-mono text-sm text-teal">{readiness}%</p></div><div className="h-8 w-px bg-steel/15"/><button type="button" onClick={() => fileInput.current?.click()} className="border border-steel/20 px-3 py-2 font-mono text-[8px] uppercase tracking-[0.12em] text-steel hover:border-teal hover:text-teal">+ Evidence</button></div>
          </header>

          <div className="mx-auto max-w-[1500px] p-5 sm:p-8">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
              <div className="space-y-5">
                <div className="grid gap-3 md:grid-cols-3">
                  {(["building", "facility", "equipment"] as Scope[]).map((item) => (
                    <button key={item} type="button" onClick={() => setScope(item)} className={`group relative overflow-hidden border p-4 text-left transition ${scope === item ? "border-teal/55 bg-teal/[0.07]" : "border-steel/15 bg-[#080c0c] hover:border-steel/40"}`}>
                      <div className="absolute right-0 top-0 h-full w-1 bg-transparent transition group-hover:bg-teal/20"/>
                      <p className="font-mono text-[8px] uppercase tracking-[0.15em] text-teal">{item}</p>
                      <p className="mt-3 font-display text-2xl">{item === "building" ? "Building" : item === "facility" ? "Facility" : "Equipment"}</p>
                      <p className="mt-1 text-[9px] leading-4 text-steel">{item === "building" ? "Envelope, HVAC and occupied space" : item === "facility" ? "Plant systems and asset fleet" : "Machines, performance and condition"}</p>
                      {scope === item ? <span className="mt-4 inline-block border border-teal/30 px-2 py-1 font-mono text-[7px] uppercase tracking-[0.12em] text-teal">Active</span> : null}
                    </button>
                  ))}
                </div>

                <div className="border border-steel/15 bg-[#080c0c]">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-steel/10 px-4 py-3 sm:px-5"><div><p className="font-mono text-[8px] uppercase tracking-[0.14em] text-steel">Physical evidence</p><p className="mt-1 text-[10px] text-steel">Photos, scans, nameplates, meter data and documents become model evidence — not form answers.</p></div><div className="font-mono text-[8px] uppercase text-steel">{evidence.length}/8 captured</div></div>
                  <div className="grid min-h-[390px] gap-4 p-4 sm:p-5 lg:grid-cols-[1.15fr_0.85fr]">
                    <div className={`relative grid place-items-center overflow-hidden border bg-black/15 transition ${dragging ? "border-teal bg-teal/[0.04]" : "border-dashed border-steel/25"}`} onDragEnter={(e) => { e.preventDefault(); setDragging(true); }} onDragOver={(e) => e.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles("photo", Array.from(e.dataTransfer.files)); }}>
                      <div className="absolute inset-0 opacity-35" style={{backgroundImage:"linear-gradient(rgba(138,155,168,.10) 1px,transparent 1px),linear-gradient(90deg,rgba(138,155,168,.10) 1px,transparent 1px)",backgroundSize:"36px 36px"}}/>
                      <div className="relative z-10 max-w-sm px-6 text-center">
                        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-teal/30 bg-teal/[0.04] font-mono text-lg text-teal">＋</div>
                        <p className="mt-4 font-display text-2xl">Inspect, don't interrogate.</p>
                        <p className="mt-2 text-[10px] leading-5 text-steel">Give OVERHAUL the physical evidence. It extracts identity, geometry and operating clues, then asks only for measurements that can change the decision.</p>
                        <div className="mt-5 flex flex-wrap justify-center gap-2"><button type="button" onClick={() => fileInput.current?.click()} className="border border-paper/30 bg-paper px-4 py-2 font-mono text-[8px] uppercase tracking-[0.12em] text-navy">Add evidence</button><button type="button" onClick={() => { const scanButton = document.querySelector<HTMLButtonElement>("button[data-room-scan]"); scanButton?.click(); }} className="border border-teal/40 px-4 py-2 font-mono text-[8px] uppercase tracking-[0.12em] text-teal">{scanLabel}</button></div>
                        <p className="mt-3 font-mono text-[7px] uppercase tracking-[0.1em] text-steel">Drop files anywhere in this canvas</p>
                      </div>
                    </div>

                    <div className="flex min-h-[390px] flex-col border border-steel/10 bg-black/10 p-4">
                      <div className="flex items-center justify-between"><p className="font-mono text-[8px] uppercase tracking-[0.14em] text-steel">Evidence shelf</p><span className="font-mono text-[8px] text-teal">{evidence.length ? "LIVE" : "EMPTY"}</span></div>
                      <div className="mt-3 flex-1 space-y-2 overflow-auto pr-1">
                        {evidence.length ? evidence.map((item, index) => (
                          <motion.div layout key={item.id} className="flex gap-3 border border-steel/10 bg-[#080b0b] p-2.5">
                            {item.previewUrl ? <img src={item.previewUrl} alt="Evidence preview" className="h-14 w-18 shrink-0 object-cover"/> : <div className="grid h-14 w-18 shrink-0 place-items-center bg-steel/[0.05] font-mono text-[7px] text-steel">FILE</div>}
                            <div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><p className="truncate text-[9px]">{item.name}</p><span className="font-mono text-[7px] text-steel">0{index + 1}</span></div><p className="mt-1 font-mono text-[7px] uppercase text-steel">{item.kind} · ready for extraction</p><button type="button" onClick={() => removeEvidence(item.id)} className="mt-2 font-mono text-[7px] uppercase text-clay">Remove</button></div>
                          </motion.div>
                        )) : <div className="grid h-full place-items-center text-center"><div><p className="text-sm text-steel">No evidence yet.</p><p className="mt-1 text-[9px] leading-4 text-steel/70">The first useful artifact can be a room photo, machine nameplate, energy bill or existing report.</p></div></div>}
                      </div>
                      {cameraOpen ? <div className="mt-3 overflow-hidden border border-teal/20"><video ref={videoRef} autoPlay playsInline muted className="aspect-video w-full bg-black object-cover"/><div className="flex gap-2 p-2"><button type="button" onClick={captureFrame} className="border border-teal px-3 py-1.5 font-mono text-[7px] uppercase text-teal">Capture</button><button type="button" onClick={closeCamera} className="border border-steel/20 px-3 py-1.5 font-mono text-[7px] uppercase text-steel">Done</button></div></div> : null}
                      {cameraError ? <p className="mt-2 text-[9px] text-clay">{cameraError}</p> : null}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-[1fr_1.1fr]">
                  <div className="border border-steel/15 bg-[#080c0c] p-4 sm:p-5">
                    <div className="flex items-center justify-between"><p className="font-mono text-[8px] uppercase tracking-[0.14em] text-steel">Decision lens</p><p className="font-mono text-[8px] text-teal">{activeGoal}</p></div>
                    <div className="mt-4 space-y-2">{goals.map(([value, label, sub]) => <button key={value} type="button" onClick={() => setGoal(value)} className={`w-full border p-3 text-left transition ${goal === value ? "border-teal/35 bg-teal/[0.05]" : "border-transparent hover:border-steel/15"}`}><p className="text-[10px]">{label}</p><p className="mt-1 text-[8px] text-steel">{sub}</p></button>)}</div>
                  </div>
                  <div className="border border-steel/15 bg-[#080c0c] p-4 sm:p-5">
                    <div className="flex items-center justify-between"><div><p className="font-mono text-[8px] uppercase tracking-[0.14em] text-steel">Context</p><p className="mt-1 text-[10px] text-steel">Minimal metadata; evidence does the heavy lifting.</p></div><span className="font-mono text-[8px] text-steel">optional</span></div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="block"><span className="font-mono text-[7px] uppercase text-steel">Site</span><input value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="Untitled site" className="mt-2 w-full border-b border-steel/20 bg-transparent py-2 text-[11px] outline-none focus:border-teal"/></label><label className="block"><span className="font-mono text-[7px] uppercase text-steel">Industry</span><select value={industry} onChange={(e) => setIndustry(e.target.value as Industry)} className="mt-2 w-full border-b border-steel/20 bg-[#080c0c] py-2 text-[11px] outline-none focus:border-teal">{industries.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
                    {scope === "equipment" ? <>
                      <label className="mt-4 block"><span className="font-mono text-[7px] uppercase text-steel">Known class (optional)</span><select value={equipmentType} onChange={(e) => setEquipmentType(e.target.value)} className="mt-2 w-full border-b border-steel/20 bg-[#080c0c] py-2 text-[11px] outline-none focus:border-teal"><option value="">Let evidence identify it</option>{equipmentOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                      <label className="mt-4 block"><span className="font-mono text-[7px] uppercase text-steel">Approximate age</span><input inputMode="numeric" type="number" min="0" max="100" value={assetAge} onChange={(e) => setAssetAge(e.target.value)} placeholder="Unknown? leave blank" className="mt-2 w-full border-b border-steel/20 bg-transparent py-2 text-[11px] outline-none focus:border-teal"/><p className="mt-1 text-[8px] text-steel">Used only as lifecycle context. It does not create a performance measurement.</p></label>
                    </> : null}
                  </div>
                </div>
              </div>

              <aside className="h-fit border border-steel/15 bg-[#080c0c] p-5 xl:sticky xl:top-5">
                <p className="font-mono text-[8px] uppercase tracking-[0.15em] text-teal">Assessment state</p>
                <div className="mt-4 border border-steel/10 p-4"><p className="font-display text-2xl">{scopeLabel}</p><p className="mt-1 text-[9px] text-steel">{industries.find(([x]) => x === industry)?.[1]} · {activeGoal}</p></div>
                <div className="mt-4 border border-steel/10 p-4"><p className="font-mono text-[8px] uppercase tracking-[0.12em] text-steel">Evidence coverage</p><div className="mt-3 h-1 overflow-hidden bg-steel/10"><div className="h-full bg-teal transition-all" style={{width:`${readiness}%`}}/></div><p className="mt-2 text-[9px] text-steel">{evidence.length ? `${evidence.length} physical artifact${evidence.length > 1 ? "s" : ""} captured.` : "Waiting for physical evidence."}</p></div>
                <div className="mt-4 space-y-2 font-mono text-[8px] uppercase tracking-[0.1em]"><p className="text-paper"><span className="text-teal">●</span> Evidence ingestion</p><p className={evidence.length ? "text-teal" : "text-steel/35"}><span>●</span> Perception + provenance</p><p className="text-steel/35"><span>○</span> Engineering baseline</p><p className="text-steel/35"><span>○</span> What-if simulation</p><p className="text-steel/35"><span>○</span> Decision sequence</p><p className="text-steel/35"><span>○</span> Measure & verify</p></div>
                <div className="mt-5 border border-gold/20 bg-gold/[0.035] p-3"><p className="font-mono text-[7px] uppercase tracking-[0.12em] text-gold">Core principle</p><p className="mt-2 text-[10px] leading-4 text-steel">Do not ask the operator to estimate engineering parameters that can be measured or extracted from evidence.</p></div>
                {analysisError ? <div className="mt-4 border border-clay/25 bg-clay/5 p-3 text-[9px] leading-4 text-clay">{analysisError}</div> : null}
                {analyzing ? <div className="mt-4 border border-teal/25 bg-teal/5 p-3 text-[9px] text-teal">Perception pipeline {analysisCount}/5…</div> : null}
                <button disabled={!evidence.length || analyzing} onClick={analyzeEvidence} type="button" className="mt-5 w-full border border-teal bg-teal px-4 py-3 font-mono text-[8px] uppercase tracking-[0.13em] text-navy disabled:cursor-not-allowed disabled:opacity-25">{analyzing ? "Constructing twin…" : "Inspect & construct"}</button>
                <p className="mt-3 text-center text-[8px] leading-4 text-steel">OVERHAUL will block unsupported conclusions instead of filling gaps with guesses.</p>
              </aside>
            </div>
          </div>
          <input ref={fileInput} type="file" multiple accept="image/*,.pdf" className="hidden" onChange={(e) => addFiles("photo", Array.from(e.target.files ?? []))}/>
        </section>
      </div>
    </main>
  );
}