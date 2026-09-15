"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

type Scope = "building" | "facility" | "equipment";
type Goal = "energy" | "performance" | "comfort" | "reliability" | "retrofit";
type Industry =
  | "residential"
  | "commercial"
  | "healthcare"
  | "hospitality"
  | "education"
  | "retail"
  | "industrial"
  | "warehouse"
  | "cold_storage"
  | "data_center"
  | "campus"
  | "other";
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

const industryOptions: Array<[Industry, string]> = [
  ["residential", "Residential"],
  ["commercial", "Commercial / Office"],
  ["healthcare", "Healthcare"],
  ["hospitality", "Hospitality"],
  ["education", "Education"],
  ["retail", "Retail"],
  ["industrial", "Industrial / Manufacturing"],
  ["warehouse", "Warehouse / Logistics"],
  ["cold_storage", "Cold Storage / Refrigeration"],
  ["data_center", "Data Center"],
  ["campus", "Campus / Institution"],
  ["other", "Other"] ,
];

const equipmentOptions = ["Chiller", "Compressor", "Pump", "Boiler", "Cooling tower", "Fan / motor", "Refrigeration", "Process equipment"];

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function OverhaulIntake() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [scope, setScope] = useState<Scope | null>(null);
  const [industry, setIndustry] = useState<Industry | null>(null);
  const [goal, setGoal] = useState<Goal>("retrofit");
  const [equipmentType, setEquipmentType] = useState("");
  const [siteName, setSiteName] = useState("");
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [mode, setMode] = useState<EvidenceMode>("scan");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisCount, setAnalysisCount] = useState(0);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      evidence.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
    };
  }, [evidence]);

  const openCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraOpen(true);
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : "Camera access was unavailable.");
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
    const file = new File([blob], `scan-${evidence.length + 1}.jpg`, { type: "image/jpeg" });
    addFiles("scan", [file]);
  };

  const addFiles = (kind: EvidenceItem["kind"], files: File[]) => {
    const next = files
      .filter((file) => file.size > 0 && file.size <= 25 * 1024 * 1024)
      .slice(0, 8 - evidence.length)
      .map((file) => ({
        id: uid(),
        kind,
        name: file.name,
        type: file.type,
        size: file.size,
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
        file,
      }));
    setEvidence((current) => [...current, ...next]);
    setAnalysisError(null);
  };

  const analyzeEvidence = async () => {
    if (!scope || !industry || !evidence.length) return;
    setAnalyzing(true);
    setAnalysisError(null);
    let completed = 0;
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
        completed += 1;
        setAnalysisCount(completed);
      }
      sessionStorage.setItem("overhaul:evidence-extractions", JSON.stringify(results));
      const assessment = {
        assessmentSubject: scope,
        assessmentGoal: goal,
        industry,
        siteName: siteName.trim() || null,
        assetClass: scope === "equipment" ? equipmentType || "Other machinery" : null,
        createdAt: new Date().toISOString(),
        evidence: evidence.map(({ file: _file, previewUrl: _preview, ...item }) => item),
        context: {
          industry,
          siteName: siteName.trim() || null,
          assetClass: scope === "equipment" ? equipmentType || "Other machinery" : null,
        },
        status: "evidence-analyzed" as const,
      };
      sessionStorage.setItem("overhaul:assessment", JSON.stringify(assessment));
      router.push("/assessment");
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "Evidence analysis failed.");
    } finally {
      setAnalyzing(false);
    }
  };

  const canStart = Boolean(scope && industry && evidence.length && !analyzing);

  return (
    <main className="min-h-screen bg-navy text-paper">
      <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-steel/20 pb-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-teal">OVERHAUL // retrofit intelligence platform</p>
            <h1 className="font-display mt-2 text-5xl tracking-tight sm:text-6xl">Build the asset model.</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-steel">Buildings, facilities, and machines. Start from live evidence, construct a defensible digital representation, then run physics-backed what-if decisions.</p>
          </div>
          <div className="border border-steel/20 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.16em] text-steel">Evidence → Twin → Physics → Decision</div>
        </header>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.05fr_1.35fr]">
          <div className="space-y-6">
            <Panel title="01 / What are we assessing?">
              <div className="grid gap-3 sm:grid-cols-3">
                {(["building", "facility", "equipment"] as Scope[]).map((value) => (
                  <button key={value} type="button" onClick={() => setScope(value)} className={`min-h-28 border p-4 text-left transition ${scope === value ? "border-teal bg-teal/10" : "border-steel/20 hover:border-steel/50"}`}>
                    <div className="font-mono text-[10px] text-teal">{value === "building" ? "01" : value === "facility" ? "02" : "03"}</div>
                    <div className="mt-3 text-lg text-paper">{value[0].toUpperCase() + value.slice(1)}</div>
                    <div className="mt-1 text-xs text-steel">{value === "building" ? "Homes, offices, hospitals, retail, schools" : value === "facility" ? "Plants, warehouses, campuses, process sites" : "Chillers, pumps, compressors, boilers, machinery"}</div>
                  </button>
                ))}
              </div>
            </Panel>

            <Panel title="02 / Industry & operating domain">
              <div className="grid gap-2 sm:grid-cols-3">
                {industryOptions.map(([value, label]) => (
                  <button key={value} type="button" onClick={() => setIndustry(value)} className={`border px-3 py-2.5 text-left text-xs transition ${industry === value ? "border-teal bg-teal/10 text-paper" : "border-steel/20 text-steel hover:border-steel/50 hover:text-paper"}`}>{label}</button>
                ))}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block"><span className="font-mono text-[9px] uppercase tracking-[0.14em] text-steel">Site / asset name</span><input value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="e.g. North Chennai Plant" className="mt-2 w-full border border-steel/20 bg-transparent px-3 py-2.5 text-sm text-paper outline-none focus:border-teal" /></label>
                {scope === "equipment" ? <label className="block"><span className="font-mono text-[9px] uppercase tracking-[0.14em] text-steel">Equipment class</span><select value={equipmentType} onChange={(e) => setEquipmentType(e.target.value)} className="mt-2 w-full border border-steel/20 bg-navy px-3 py-2.5 text-sm text-paper outline-none focus:border-teal"><option value="">Select class</option>{equipmentOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label> : null}
              </div>
            </Panel>

            <Panel title="03 / Objective">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {([["energy", "Energy"], ["performance", "Performance"], ["comfort", "Comfort"], ["reliability", "Reliability"], ["retrofit", "Retrofit"]] as Array<[Goal, string]>).map(([value, label]) => (
                  <button key={value} type="button" onClick={() => setGoal(value)} className={`border px-3 py-2.5 text-xs ${goal === value ? "border-teal text-teal" : "border-steel/20 text-steel hover:text-paper"}`}>{label}</button>
                ))}
              </div>
            </Panel>
          </div>

          <div className="border border-steel/20 bg-black/10 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-teal">04 / Evidence acquisition</p><h2 className="font-display mt-1 text-3xl">See the site, don't describe it.</h2><p className="mt-2 max-w-xl text-sm text-steel">Use live camera capture, a guided room scan, or existing files. The model only promotes values into engineering state when evidence establishes them.</p></div>
              <div className="flex gap-1 border border-steel/20 p-1">
                {([["scan", "Room scan"], ["camera", "Camera"], ["upload", "Upload"]] as Array<[EvidenceMode, string]>).map(([value, label]) => <button key={value} type="button" onClick={() => setMode(value)} className={`px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] ${mode === value ? "bg-paper text-navy" : "text-steel"}`}>{label}</button>)}
              </div>
            </div>

            {mode === "scan" ? <div className="mt-6 border border-teal/25 bg-teal/5 p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.15em] text-teal">Guided capture</p><p className="mt-2 text-sm text-paper">Capture 3–5 frames around the room or asset: front → left → right → nameplate.</p></div><button onClick={openCamera} type="button" className="border border-teal px-4 py-2 text-xs uppercase tracking-[0.12em] text-teal hover:bg-teal/10">Start scan</button></div></div> : null}
            {mode === "camera" ? <div className="mt-6 border border-steel/20 p-5"><button onClick={cameraOpen ? closeCamera : openCamera} type="button" className="border border-paper px-4 py-2 text-xs uppercase tracking-[0.12em] text-paper">{cameraOpen ? "Close camera" : "Open camera"}</button></div> : null}
            {mode === "upload" ? <label className="mt-6 flex min-h-36 cursor-pointer flex-col items-center justify-center border border-dashed border-steel/30 text-center hover:border-teal"><span className="text-sm text-paper">Drop photos, scans, nameplates, bills or PDFs</span><span className="mt-1 text-xs text-steel">Up to 8 evidence items · 25 MB each</span><input type="file" multiple accept="image/*,.pdf" className="hidden" onChange={(event) => addFiles("photo", Array.from(event.target.files ?? []))} /></label> : null}

            {cameraOpen ? <div className="mt-6 overflow-hidden border border-teal/25"><video ref={videoRef} autoPlay playsInline muted className="aspect-video w-full bg-black object-cover" /><div className="flex flex-wrap gap-2 p-3"><button type="button" onClick={captureFrame} className="border border-teal px-4 py-2 text-xs uppercase tracking-[0.12em] text-teal">Capture frame</button><button type="button" onClick={closeCamera} className="border border-steel/30 px-4 py-2 text-xs uppercase tracking-[0.12em] text-steel">Done</button></div></div> : null}
            {cameraError ? <div className="mt-3 border border-clay/30 bg-clay/5 px-3 py-2 text-xs text-clay">{cameraError}</div> : null}

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {evidence.map((item) => <motion.div key={item.id} layout className="border border-steel/20 p-3">{item.previewUrl ? <img src={item.previewUrl} alt="Evidence preview" className="aspect-video w-full object-cover" /> : <div className="flex aspect-video items-center justify-center bg-white/[0.03] font-mono text-xs text-steel">{item.type || "FILE"}</div>}<div className="mt-3 flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-xs text-paper">{item.name}</p><p className="font-mono text-[9px] uppercase tracking-[0.12em] text-steel">{item.kind} · {(item.size / 1024 / 1024).toFixed(1)} MB</p></div><button type="button" onClick={() => setEvidence((current) => current.filter((entry) => entry.id !== item.id))} className="text-[10px] text-clay">remove</button></div></motion.div>)}
            </div>

            {evidence.length ? <div className="mt-5 border border-steel/20 bg-black/10 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-mono text-[9px] uppercase tracking-[0.15em] text-steel">Evidence state</p><p className="mt-1 text-sm text-paper">{analyzing ? `AI perception ${analysisCount}/${Math.min(evidence.length, 5)}…` : "Ready to construct the model"}</p></div><button disabled={!canStart} type="button" onClick={() => void analyzeEvidence()} className={`border px-4 py-2 text-xs uppercase tracking-[0.12em] ${canStart ? "border-teal text-teal hover:bg-teal/10" : "border-steel/20 text-steel/30"}`}>{analyzing ? "Analyzing" : "Build digital twin"}</button></div>{analysisError ? <p className="mt-3 text-xs text-clay">{analysisError}</p> : null}</div> : null}

            {!scope || !industry ? <p className="mt-4 text-[11px] text-steel">Select the asset scope and industry before evidence is promoted into the engineering model.</p> : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="border border-steel/20 p-5"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-steel">{title}</p><div className="mt-4">{children}</div></section>;
}
