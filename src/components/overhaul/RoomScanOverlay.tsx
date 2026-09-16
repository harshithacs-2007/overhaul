"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import type { TwinModel } from "@/lib/engineering/twinModel";

type Scope = "building" | "facility" | "equipment";
type Detection = { label: string; confidence: number; box: { x: number; y: number; width: number; height: number }; condition?: string; evidence?: string };
type VisibleDetail = { field: string; value: string; confidence: number };
type ScanResult = { summary: string; detections: Detection[]; engineering_clues: string[]; coverage_notes: string[]; visible_details?: VisibleDetail[]; sector: number; sectorCount: number; detectorPasses?: { inventory: boolean; engineering: boolean } };
type ScanFrame = { id: string; sector: number; image: string; quality: number; result?: ScanResult };
type RawFrame = { sector: number; image: string; blob: Blob; quality: number; motion: number };
type Props = { scope?: Scope };

const SECTORS = 12;
const CAPTURE_MS = 7000;
const SAMPLE_MS = 350;
const MIN_FRAME_QUALITY = 0.42;
const MIN_MOTION = 0.018;

function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
function dataUrlToBlob(dataUrl: string) { const [meta, encoded] = dataUrl.split(","); const binary = atob(encoded || ""); const bytes = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i); return new Blob([bytes], { type: meta.match(/data:(.*?);/)?.[1] || "image/jpeg" }); }
function saveSession(key: string, value: unknown) { try { if (value == null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, JSON.stringify(value)); } catch {} }
function readSession<T>(key: string, fallback: T): T { try { return JSON.parse(sessionStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; } }

function frameQuality(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true }); if (!ctx) return 0;
  const w = Math.min(320, canvas.width); const h = Math.max(1, Math.round(canvas.height * (w / Math.max(canvas.width, 1))));
  const data = ctx.getImageData(0, 0, w, h).data; let mean = 0; let variance = 0; let edges = 0; let count = 0;
  for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) {
    const i = (y * w + x) * 4; const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]; mean += lum; count++;
    if (x + 4 < w) { const j = (y * w + x + 4) * 4; edges += Math.abs(lum - (0.2126 * data[j] + 0.7152 * data[j + 1] + 0.0722 * data[j + 2])); }
    if (y + 4 < h) { const j = ((y + 4) * w + x) * 4; edges += Math.abs(lum - (0.2126 * data[j] + 0.7152 * data[j + 1] + 0.0722 * data[j + 2])); }
  }
  mean /= Math.max(count, 1);
  for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 8) { const i = (y * w + x) * 4; const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]; variance += (lum - mean) ** 2; }
  variance /= Math.max(Math.ceil(w / 8) * Math.ceil(h / 8), 1);
  const brightness = 1 - Math.min(1, Math.abs(mean - 128) / 128); const sharpness = Math.min(1, (edges / Math.max(count, 1)) / 32); const texture = Math.min(1, Math.sqrt(variance) / 70);
  return Math.max(0, Math.min(1, brightness * 0.35 + sharpness * 0.4 + texture * 0.25));
}

function motionScore(canvas: HTMLCanvasElement, previous: ImageData | null) {
  if (!previous) return 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true }); if (!ctx) return 0;
  const w = 96; const h = Math.max(1, Math.round(canvas.height * (w / Math.max(canvas.width, 1)))); const current = ctx.getImageData(0, 0, w, h); let total = 0; let samples = 0;
  const sx = Math.max(1, Math.floor(current.width / 24)); const sy = Math.max(1, Math.floor(current.height / 18));
  for (let y = 0; y < current.height; y += sy) for (let x = 0; x < current.width; x += sx) {
    const i = (y * current.width + x) * 4; const j = (Math.min(y, previous.height - 1) * previous.width + Math.min(x, previous.width - 1)) * 4;
    total += Math.abs(current.data[i] - previous.data[j]) + Math.abs(current.data[i + 1] - previous.data[j + 1]) + Math.abs(current.data[i + 2] - previous.data[j + 2]); samples++;
  }
  return Math.min(1, total / Math.max(samples * 765, 1));
}

export default function RoomScanOverlay({ scope = "building" }: Props) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null); const buttonRef = useRef<HTMLButtonElement>(null); const streamRef = useRef<MediaStream | null>(null); const timerRef = useRef<number | null>(null); const holdRef = useRef<number | null>(null); const framesRef = useRef<RawFrame[]>([]); const previousFrameRef = useRef<ImageData | null>(null); const sectorRef = useRef(-1);
  const [open, setOpen] = useState(false); const [holding, setHolding] = useState(false); const [processing, setProcessing] = useState(false); const [elapsed, setElapsed] = useState(0); const [history, setHistory] = useState<ScanFrame[]>([]); const [error, setError] = useState<string | null>(null); const [status, setStatus] = useState("Hold Scan and slowly rotate 360°."); const [ready, setReady] = useState(false); const [twinStatus, setTwinStatus] = useState<"unknown" | "relative-only" | "verified-metric">("unknown");
  const progress = Math.min(100, Math.round((elapsed / CAPTURE_MS) * 100)); const coverage = Math.min(100, Math.round((framesRef.current.length / SECTORS) * 100));

  useEffect(() => { const openFromShell = () => void start(); window.addEventListener("overhaul:open-room-scan", openFromShell); return () => window.removeEventListener("overhaul:open-room-scan", openFromShell); }, []);
  useEffect(() => () => { stopTimer(); streamRef.current?.getTracks().forEach((track) => track.stop()); }, []);

  function persist(frames: ScanFrame[], complete: boolean) {
    saveSession("overhaul:room-scan", { scope, completed: complete, coveragePercent: Math.round((frames.length / SECTORS) * 100), sectors: frames.map(({ image: _image, ...frame }) => frame), representativeSector: frames[Math.floor(frames.length / 2)]?.sector ?? null, updatedAt: new Date().toISOString() });
    window.dispatchEvent(new CustomEvent("overhaul:evidence-change"));
  }

  function persistAssessment(scanComplete: boolean, twin: TwinModel | null) {
    const stored = readSession<Record<string, unknown>>("overhaul:intake-context", {});
    const storedScope = stored.scope === "equipment" || stored.scope === "facility" || stored.scope === "building" ? stored.scope : scope;
    const title = typeof stored.title === "string" && stored.title ? stored.title : typeof stored.className === "string" ? stored.className : "OVERHAUL assessment";
    saveSession("overhaul:assessment", { assessmentSubject: storedScope, assessmentGoal: "retrofit", industry: typeof stored.industry === "string" ? stored.industry : "other", siteName: title, assetClass: typeof stored.className === "string" ? stored.className : scope, assetAgeYears: null, createdAt: new Date().toISOString(), evidence: [{ id: `scan-${Date.now()}`, kind: "scan", name: "Camera 360° room sweep", type: "image/jpeg", size: 0 }], context: { ...stored, scope: storedScope }, status: scanComplete ? "scan-complete" : "scan-partial", twinStatus: twin ? "generated" : "pending" });
    window.dispatchEvent(new CustomEvent("overhaul:assessment-change"));
  }

  async function start() {
    setError(null); setReady(false); setTwinStatus("unknown");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera capture is not supported by this browser.");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      streamRef.current = stream; setOpen(true); setHistory([]); setElapsed(0); framesRef.current = []; previousFrameRef.current = null; sectorRef.current = -1;
      setStatus(scope === "equipment" ? "Hold Scan · move around the asset slowly." : "Hold Scan · rotate slowly through the full room.");
      requestAnimationFrame(() => { if (videoRef.current) videoRef.current.srcObject = stream; });
    } catch (err) { setError(err instanceof Error ? err.message : "Camera access unavailable."); }
  }

  function close() { stopTimer(); streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; setHolding(false); setOpen(false); setProcessing(false); setReady(false); }
  function stopTimer() { if (timerRef.current != null) window.clearInterval(timerRef.current); timerRef.current = null; holdRef.current = null; }

  function snapshot(targetSector: number): RawFrame | null {
    const video = videoRef.current; if (!video || video.readyState < 2) return null;
    const canvas = document.createElement("canvas"); canvas.width = video.videoWidth || 1280; canvas.height = video.videoHeight || 720; const ctx = canvas.getContext("2d", { willReadFrequently: true }); ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const quality = frameQuality(canvas); const motion = motionScore(canvas, previousFrameRef.current); const smallW = 96; const smallH = Math.max(1, Math.round(canvas.height * (smallW / Math.max(canvas.width, 1)))); previousFrameRef.current = ctx?.getImageData(0, 0, smallW, smallH) ?? null;
    const image = canvas.toDataURL("image/jpeg", 0.78); return { sector: targetSector, image, blob: dataUrlToBlob(image), quality, motion };
  }

  function beginHold(pointerId?: number) {
    if (processing || !open || holding) return; if (pointerId != null) { try { buttonRef.current?.setPointerCapture(pointerId); } catch {} }
    framesRef.current = []; previousFrameRef.current = null; sectorRef.current = -1; setHistory([]); setReady(false); setHolding(true); setElapsed(0); setStatus(scope === "equipment" ? "Keep moving · each sector locks only after a real view change." : "Keep rotating · each sector locks only after a real view change."); holdRef.current = performance.now();
    const collect = () => {
      const started = holdRef.current; if (started == null) return; const now = performance.now() - started; const targetSector = Math.min(SECTORS - 1, Math.floor((now / CAPTURE_MS) * SECTORS)); setElapsed(Math.min(CAPTURE_MS, now));
      if (targetSector !== sectorRef.current) { const frame = snapshot(targetSector); if (frame && frame.quality >= MIN_FRAME_QUALITY && (frame.motion >= MIN_MOTION || targetSector === 0)) { framesRef.current.push(frame); sectorRef.current = targetSector; } }
      if (now >= CAPTURE_MS || framesRef.current.length >= SECTORS) void endHold();
    };
    collect(); timerRef.current = window.setInterval(collect, SAMPLE_MS);
  }

  async function analyseFrame(frame: RawFrame): Promise<ScanFrame | null> {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const form = new FormData(); form.append("file", new File([frame.blob], `${scope}-sector-${frame.sector + 1}.jpg`, { type: "image/jpeg" })); form.append("scope", scope); form.append("sector", String(frame.sector)); form.append("sectorCount", String(SECTORS));
        const response = await fetch("/api/vision/room-scan", { method: "POST", body: form }); const payload = await response.json() as { result?: ScanResult; error?: string };
        if (!response.ok || !payload.result) throw new Error(payload.error || "Vision analysis failed."); return { id: uid(), sector: frame.sector, image: frame.image, quality: frame.quality, result: payload.result };
      } catch (err) { if (attempt === 2) console.warn("Scan frame analysis failed", frame.sector + 1, err); }
    }
    return null;
  }

  async function endHold() {
    if (!holding && holdRef.current == null) return; stopTimer(); setHolding(false); const captured = [...framesRef.current];
    if (!captured.length) { setStatus("No usable views captured. Improve lighting and move more slowly."); return; }
    setProcessing(true); setElapsed(CAPTURE_MS); setStatus(`Analysing ${captured.length}/${SECTORS} distinct views · dual-pass perception…`);
    try {
      const analyzed = (await Promise.all(captured.map(analyseFrame))).filter((x): x is ScanFrame => Boolean(x)).sort((a, b) => a.sector - b.sector);
      if (!analyzed.length) throw new Error("None of the captured views could be analysed.");
      setHistory(analyzed); persist(analyzed, analyzed.length >= Math.ceil(SECTORS * 0.75));
      let fusion: unknown = null;
      try { const response = await fetch("/api/vision/scan-fusion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope, analyses: analyzed.map((frame) => ({ sector: frame.sector, ...frame.result })) }) }); const payload = await response.json() as { result?: unknown }; if (response.ok && payload.result) { fusion = payload.result; saveSession("overhaul:scan-fusion", payload.result); window.dispatchEvent(new CustomEvent("overhaul:scan-fusion-change")); } } catch (err) { console.warn("Cross-view fusion unavailable; preserving per-view findings.", err); }
      let twin: TwinModel | null = null;
      try { twin = await generateTwinFromScan(captured, fusion); setTwinStatus(twin.geometryStatus === "verified-metric" ? "verified-metric" : "relative-only"); } catch (err) { console.warn("Twin generation failed; scan evidence is still preserved.", err); }
      persistAssessment(analyzed.length >= Math.ceil(SECTORS * 0.75), twin); window.dispatchEvent(new CustomEvent("overhaul:twin-change"));
      const uniqueObjects = new Set(analyzed.flatMap((frame) => frame.result?.detections?.map((d) => d.label) || [])).size;
      setStatus(`${analyzed.length}/${SECTORS} views locked · ${uniqueObjects} object classes fused · evidence stored.`); setReady(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Scan processing failed."); persist([], false); }
    finally { setProcessing(false); }
  }

  async function generateTwinFromScan(captured: RawFrame[], fusion: unknown) {
    const stored = readSession<Record<string, unknown>>("overhaul:intake-context", {}); const context = { className: typeof stored.className === "string" ? stored.className : scope, industry: typeof stored.industry === "string" ? stored.industry : "other", title: typeof stored.title === "string" ? stored.title : "OVERHAUL Twin" };
    const form = new FormData(); form.append("scope", scope); form.append("className", context.className); form.append("industry", context.industry); form.append("title", context.title); form.append("extracted", JSON.stringify(fusion ? { source: "camera-scan-fusion", fusion } : { source: "camera-scan", views: captured.length }).slice(0, 45000));
    for (const frame of captured) form.append("file", new File([frame.blob], `${scope}-twin-${frame.sector + 1}.jpg`, { type: "image/jpeg" }));
    const response = await fetch("/api/model/generate", { method: "POST", body: form }); const payload = await response.json() as { model?: TwinModel; error?: string }; if (!response.ok || !payload.model) throw new Error(payload.error || "Twin generation failed"); saveSession("overhaul:twin-model", payload.model); return payload.model;
  }

  function continueToAssessment() { close(); router.push("/assessment"); }
  function reset() { stopTimer(); framesRef.current = []; previousFrameRef.current = null; sectorRef.current = -1; setHistory([]); setElapsed(0); setHolding(false); setReady(false); setError(null); saveSession("overhaul:room-scan", null); saveSession("overhaul:scan-fusion", null); saveSession("overhaul:twin-model", null); window.dispatchEvent(new CustomEvent("overhaul:evidence-change")); window.dispatchEvent(new CustomEvent("overhaul:twin-change")); window.dispatchEvent(new CustomEvent("overhaul:scan-fusion-change")); }

  if (!open) return error ? <div className="fixed bottom-5 left-5 z-50 max-w-sm border border-red-400/25 bg-[#120909] px-4 py-3 text-[10px] text-red-200 shadow-2xl sm:left-auto sm:right-5">{error}</div> : null;
  const detections = history.flatMap((frame) => frame.result?.detections || []); const uniqueLabels = Array.from(new Set(detections.map((d) => d.label))).slice(0, 18);
  return <div className="fixed inset-0 z-[100] bg-[#030606]/96 backdrop-blur-sm"><div className="grid h-full lg:grid-cols-[1fr_390px]">
    <section className="relative min-h-0 overflow-hidden border-b border-steel/15 lg:border-b-0 lg:border-r"><video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover"/><div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_34%,rgba(3,6,6,.72)_100%)]"/><div className="pointer-events-none absolute inset-0 flex items-center justify-center"><motion.div animate={holding ? { scale: [.96, 1.04, .96], opacity: [.65, 1, .65] } : { scale: 1, opacity: 1 }} transition={{ duration: 1.2, repeat: holding ? Infinity : 0 }} className="h-[min(48vw,430px)] w-[min(48vw,430px)] rounded-full border border-teal/55"><span className="absolute left-1/2 top-0 h-10 w-px -translate-x-1/2 bg-teal/70"/><span className="absolute bottom-0 left-1/2 h-10 w-px -translate-x-1/2 bg-teal/30"/><span className="absolute left-0 top-1/2 h-px w-10 -translate-y-1/2 bg-teal/30"/><span className="absolute right-0 top-1/2 h-px w-10 -translate-y-1/2 bg-teal/30"/></motion.div></div><div className="absolute left-4 right-4 top-4 flex items-center justify-between"><div className="border border-teal/25 bg-black/50 px-3 py-2 backdrop-blur"><p className="font-mono text-[8px] uppercase tracking-[.16em] text-teal">Live evidence capture</p><p className="mt-1 text-[10px] text-paper">{scope === "equipment" ? "Machine / equipment" : "Room / space"} · 12-sector sweep</p></div><button type="button" onClick={close} className="border border-white/15 bg-black/50 px-3 py-2 font-mono text-[8px] uppercase tracking-[.12em] text-steel">Close</button></div><div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 flex-col items-center gap-3"><div className="h-1 w-[min(65vw,520px)] overflow-hidden bg-black/50"><motion.div className="h-full bg-teal" animate={{ width: `${progress}%` }}/></div><button ref={buttonRef} type="button" disabled={processing || ready} onPointerDown={(event) => beginHold(event.pointerId)} onPointerUp={endHold} onPointerCancel={endHold} className={`grid h-20 w-20 place-items-center rounded-full border-2 ${holding ? "border-teal bg-teal/20" : "border-white/60 bg-black/60"} font-mono text-[8px] uppercase tracking-[.12em] text-paper shadow-2xl disabled:opacity-60`}>{processing ? "AI" : holding ? `${progress}%` : ready ? "DONE" : "SCAN"}</button><p className="max-w-xl text-center font-mono text-[8px] uppercase tracking-[.12em] text-white/75">{status}</p></div></section>
    <aside className="min-h-0 overflow-y-auto bg-[#070a09] p-5 sm:p-6"><div className="flex items-center justify-between"><div><p className="font-mono text-[8px] uppercase tracking-[.18em] text-gold">Scan ledger</p><h2 className="mt-1 font-display text-3xl">Evidence, not guesses.</h2></div><div className="text-right"><p className="font-mono text-[8px] text-steel">COVERAGE</p><p className="mt-1 text-2xl text-teal">{coverage}%</p></div></div><div className="mt-5 grid grid-cols-4 gap-1.5">{Array.from({ length: SECTORS }, (_, i) => { const found = history.some((frame) => frame.sector === i) || framesRef.current.some((frame) => frame.sector === i); return <div key={i} className={`h-2 ${found ? "bg-teal" : "bg-white/10"}`} title={`Sector ${i + 1}`}/>; })}</div><div className="mt-5 border border-white/10 bg-black/20 p-4"><p className="font-mono text-[8px] uppercase text-steel">Geometry gate</p><p className="mt-2 text-sm text-paper">{twinStatus === "verified-metric" ? "Metric geometry verified from explicit evidence." : twinStatus === "relative-only" ? "Visual twin built in relative scene units. No metric value is asserted." : "Metric scale is locked until explicit dimensional evidence exists."}</p><p className="mt-2 text-[9px] leading-4 text-steel">Appearance alone never becomes a fabricated metre, load, capacity, efficiency or fault value.</p></div>{uniqueLabels.length ? <div className="mt-4 border border-white/10 bg-black/20 p-4"><p className="font-mono text-[8px] uppercase text-steel">Observed classes</p><div className="mt-3 flex flex-wrap gap-1.5">{uniqueLabels.map((label) => <span key={label} className="border border-teal/15 bg-teal/[.05] px-2 py-1 text-[8px] text-paper">{label}</span>)}</div></div> : null}{history.length ? <div className="mt-4 space-y-2">{history.map((frame) => <div key={frame.id} className="flex items-center gap-3 border border-white/8 bg-black/15 p-2"><img src={frame.image} alt={`Sector ${frame.sector + 1}`} className="h-12 w-16 object-cover"/><div className="min-w-0"><p className="font-mono text-[7px] uppercase text-teal">Sector {frame.sector + 1}</p><p className="truncate text-[9px] text-paper">{frame.result?.summary || "Analysed view"}</p></div><span className="ml-auto font-mono text-[7px] text-steel">{Math.round(frame.quality * 100)}%</span></div>)}</div> : null}{error ? <div className="mt-4 border border-red-300/20 bg-red-300/[.04] p-4 text-[9px] leading-4 text-red-200">{error}</div> : null}<div className="mt-6 grid gap-2"><button type="button" disabled={!ready} onClick={continueToAssessment} className="w-full border border-gold/50 bg-gold px-4 py-3 font-mono text-[9px] uppercase tracking-[.14em] text-black disabled:cursor-not-allowed disabled:opacity-30">Continue to assessment →</button><button type="button" disabled={processing} onClick={reset} className="w-full border border-white/10 px-4 py-3 font-mono text-[8px] uppercase tracking-[.12em] text-steel">Retake scan</button></div><p className="mt-4 font-mono text-[7px] leading-4 text-steel">The scan is persisted to the assessment session before navigation. Cross-view fusion and twin generation are additive; a failed twin call does not discard captured evidence.</p></aside>
  </div></div>;
}
