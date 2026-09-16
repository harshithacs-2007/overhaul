"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { TwinModel } from "@/lib/engineering/twinModel";

type Scope = "building" | "facility" | "equipment";
type Detection = { label: string; confidence: number; box: { x: number; y: number; width: number; height: number }; condition?: string; evidence?: string };
type VisibleDetail = { field: string; value: string; confidence: number };
type ScanResult = { summary: string; detections: Detection[]; engineering_clues: string[]; coverage_notes: string[]; visible_details?: VisibleDetail[]; sector: number; sectorCount: number; detectorPasses?: { inventory: boolean; engineering: boolean } };
type ScanFrame = { id: string; sector: number; image: string; quality: number; result?: ScanResult };
type RawFrame = { sector: number; image: string; blob: Blob; quality: number };
type Props = { scope?: Scope };

const SECTORS = 12;
const CAPTURE_MS = 6000;
const SAMPLE_MS = 500;
const MIN_FRAME_QUALITY = 0.42;

function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
function dataUrlToBlob(dataUrl: string) { const [meta, encoded] = dataUrl.split(","); const binary = atob(encoded || ""); const bytes = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i); return new Blob([bytes], { type: meta.match(/data:(.*?);/)?.[1] || "image/jpeg" }); }
function frameQuality(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true }); if (!ctx) return 0;
  const w = Math.min(320, canvas.width); const h = Math.max(1, Math.round(canvas.height * (w / canvas.width)));
  const data = ctx.getImageData(0, 0, Math.max(1, w), h).data; let mean = 0; let variance = 0; let edges = 0; let count = 0;
  for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) {
    const i = (y * w + x) * 4; const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]; mean += lum; count++;
    if (x + 4 < w) { const j = (y * w + x + 4) * 4; const lum2 = 0.2126 * data[j] + 0.7152 * data[j + 1] + 0.0722 * data[j + 2]; edges += Math.abs(lum - lum2); }
    if (y + 4 < h) { const j = ((y + 4) * w + x) * 4; const lum2 = 0.2126 * data[j] + 0.7152 * data[j + 1] + 0.0722 * data[j + 2]; edges += Math.abs(lum - lum2); }
  }
  mean /= Math.max(count, 1);
  for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 8) { const i = (y * w + x) * 4; const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]; variance += (lum - mean) ** 2; }
  variance /= Math.max(Math.ceil(w / 8) * Math.ceil(h / 8), 1);
  const brightness = 1 - Math.min(1, Math.abs(mean - 128) / 128); const sharpness = Math.min(1, (edges / Math.max(count, 1)) / 32); const texture = Math.min(1, Math.sqrt(variance) / 70);
  return Math.max(0, Math.min(1, brightness * 0.35 + sharpness * 0.4 + texture * 0.25));
}

export default function RoomScanOverlay({ scope = "building" }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null); const buttonRef = useRef<HTMLButtonElement>(null); const streamRef = useRef<MediaStream | null>(null); const timerRef = useRef<number | null>(null); const holdRef = useRef<number | null>(null); const framesRef = useRef<RawFrame[]>([]);
  const [open, setOpen] = useState(false); const [holding, setHolding] = useState(false); const [processing, setProcessing] = useState(false); const [elapsed, setElapsed] = useState(0); const [history, setHistory] = useState<ScanFrame[]>([]); const [lastResult, setLastResult] = useState<ScanResult | null>(null); const [error, setError] = useState<string | null>(null); const [status, setStatus] = useState("Hold Scan and slowly rotate 360°.");
  const progress = Math.min(100, Math.round((elapsed / CAPTURE_MS) * 100)); const usableViews = framesRef.current.length; const coverage = Math.min(100, Math.round((usableViews / SECTORS) * 100)); const subject = scope === "equipment" ? "Machine / appliance" : "Room / space";

  useEffect(() => { const openFromShell = () => void start(); window.addEventListener("overhaul:open-room-scan", openFromShell); return () => window.removeEventListener("overhaul:open-room-scan", openFromShell); }, []);
  useEffect(() => () => { stopTimer(); streamRef.current?.getTracks().forEach((track) => track.stop()); }, []);

  function persist(frames: ScanFrame[], complete: boolean) {
    try {
      sessionStorage.setItem("overhaul:room-scan", JSON.stringify({ scope, completed: complete, coveragePercent: Math.round((frames.length / SECTORS) * 100), sectors: frames.map(({ image: _image, ...frame }) => frame), representativeSector: frames[Math.floor(frames.length / 2)]?.sector ?? null, updatedAt: new Date().toISOString() }));
      window.dispatchEvent(new CustomEvent("overhaul:evidence-change"));
    } catch { /* optional audit bridge */ }
  }

  async function start() {
    setError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera capture is not supported by this browser.");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      streamRef.current = stream; setOpen(true); setHistory([]); setLastResult(null); setElapsed(0); framesRef.current = [];
      setStatus(scope === "equipment" ? "Hold the button while slowly moving around the asset." : "Hold the button while slowly rotating around the room.");
      requestAnimationFrame(() => { if (videoRef.current) videoRef.current.srcObject = stream; });
    } catch (err) { setError(err instanceof Error ? err.message : "Camera access unavailable."); }
  }

  function close() { stopTimer(); streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; setHolding(false); setOpen(false); setProcessing(false); }
  function stopTimer() { if (timerRef.current != null) window.clearInterval(timerRef.current); timerRef.current = null; holdRef.current = null; }
  function snapshot(): RawFrame | null {
    const video = videoRef.current; if (!video || video.readyState < 2) return null;
    const canvas = document.createElement("canvas"); canvas.width = video.videoWidth || 1280; canvas.height = video.videoHeight || 720; const ctx = canvas.getContext("2d"); ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const quality = frameQuality(canvas); const image = canvas.toDataURL("image/jpeg", 0.8); return { sector: Math.min(SECTORS - 1, framesRef.current.length), image, blob: dataUrlToBlob(image), quality };
  }

  function beginHold(pointerId?: number) {
    if (processing || !open || holding) return; if (pointerId != null) { try { buttonRef.current?.setPointerCapture(pointerId); } catch {} }
    framesRef.current = []; setHistory([]); setLastResult(null); setHolding(true); setElapsed(0); setStatus(scope === "equipment" ? "Keep holding · sweep around the machine." : "Keep holding · rotate slowly through all sides."); holdRef.current = performance.now();
    const collect = () => { const started = holdRef.current; if (started == null) return; const now = performance.now() - started; setElapsed(Math.min(CAPTURE_MS, now)); if (framesRef.current.length < SECTORS) { const frame = snapshot(); if (frame && frame.quality >= MIN_FRAME_QUALITY) framesRef.current.push(frame); } if (now >= CAPTURE_MS || framesRef.current.length >= SECTORS) void endHold(); };
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
    if (!holding && holdRef.current == null) return; stopTimer(); setHolding(false); const captured = framesRef.current.slice();
    if (!captured.length) { setStatus("No usable frames captured. Improve lighting and move more slowly."); return; }
    setProcessing(true); setElapsed(CAPTURE_MS); setStatus(`Analysing all ${captured.length} usable views with dual-pass visual detection…`);
    try {
      // Do not discard half the sweep: every usable sector is analysed so small/occluded assets have a chance to appear.
      const analyzed = (await Promise.all(captured.map(analyseFrame))).filter((x): x is ScanFrame => Boolean(x)).sort((a, b) => a.sector - b.sector);
      setHistory(analyzed); if (analyzed.length) setLastResult(analyzed[analyzed.length - 1].result ?? null); if (!analyzed.length) throw new Error("None of the captured views could be analysed.");
      persist(analyzed, captured.length >= SECTORS);

      let fusion: unknown = null;
      try {
        const response = await fetch("/api/vision/scan-fusion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope, analyses: analyzed.map((frame) => ({ sector: frame.sector, ...frame.result })) }) });
        const payload = await response.json() as { result?: unknown; error?: string }; if (response.ok && payload.result) { fusion = payload.result; sessionStorage.setItem("overhaul:scan-fusion", JSON.stringify(payload.result)); window.dispatchEvent(new CustomEvent("overhaul:scan-fusion-change")); }
      } catch (err) { console.warn("Cross-view fusion unavailable; continuing with per-view scan findings.", err); }

      await generateTwinFromScan(captured, fusion);
      const uniqueObjects = new Set(analyzed.flatMap((frame) => frame.result?.detections?.map((d) => d.label) || [])).size;
      setStatus(`${analyzed.length}/${captured.length} views analysed · ${uniqueObjects} object classes found · twin rebuilt from the full sweep.`);
    } catch (err) { setError(err instanceof Error ? err.message : "Scan processing failed."); if (history.length) persist(history, false); }
    finally { setProcessing(false); }
  }

  async function generateTwinFromScan(captured: RawFrame[], fusion: unknown) {
    let context = { className: scope, industry: "other", title: "OVERHAUL Twin" };
    try { const stored = JSON.parse(sessionStorage.getItem("overhaul:intake-context") || "{}"); context = { className: typeof stored.className === "string" ? stored.className : scope, industry: typeof stored.industry === "string" ? stored.industry : "other", title: typeof stored.title === "string" ? stored.title : "OVERHAUL Twin" }; } catch {}
    const form = new FormData(); form.append("scope", scope); form.append("className", context.className); form.append("industry", context.industry); form.append("title", context.title); form.append("extracted", JSON.stringify(fusion ? { source: "camera-scan-fusion", fusion } : {}).slice(0, 30000));
    // Preserve the whole usable sweep for reconstruction; the server caps input to its safe request budget.
    for (const frame of captured) form.append("file", new File([frame.blob], `${scope}-twin-${frame.sector + 1}.jpg`, { type: "image/jpeg" }));
    const response = await fetch("/api/model/generate", { method: "POST", body: form }); const payload = await response.json() as { model?: TwinModel; error?: string }; if (!response.ok || !payload.model) throw new Error(payload.error || "Twin generation failed");
    sessionStorage.setItem("overhaul:twin-model", JSON.stringify(payload.model)); window.dispatchEvent(new CustomEvent("overhaul:twin-change"));
  }

  const cancelHold = () => { if (!holding) return; stopTimer(); framesRef.current = []; setHolding(false); setElapsed(0); setHistory([]); setStatus("Scan cancelled. Hold Scan to start again."); };
  const reset = () => { stopTimer(); framesRef.current = []; setHistory([]); setLastResult(null); setElapsed(0); setHolding(false); setError(null); try { sessionStorage.removeItem("overhaul:room-scan"); sessionStorage.removeItem("overhaul:twin-model"); sessionStorage.removeItem("overhaul:scan-fusion"); } catch {} window.dispatchEvent(new CustomEvent("overhaul:evidence-change")); window.dispatchEvent(new CustomEvent("overhaul:twin-change")); window.dispatchEvent(new CustomEvent("overhaul:scan-fusion-change")); };

  if (!open) return error ? <div className="fixed bottom-5 left-5 z-50 max-w-sm border border-red-400/25 bg-[#120909] px-4 py-3 text-[10px] text-red-200 shadow-2xl sm:left-auto sm:right-5">{error}</div> : null;

  const detections = history.flatMap((frame) => frame.result?.detections || []); const uniqueLabels = Array.from(new Set(detections.map((d) => d.label))).slice(0, 18);
  return <div className="fixed inset-0 z-[100] bg-[#030606]/96 backdrop-blur-sm"><div className="grid h-full lg:grid-cols-[1fr_380px]">
    <section className="relative min-h-0 overflow-hidden border-b border-steel/15 lg:border-b-0 lg:border-r"><video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover"/><div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_35%,rgba(3,6,6,.7)_100%)]"/><div className="pointer-events-none absolute inset-0 flex items-center justify-center"><motion.div animate={holding ? { scale: [.96, 1.04, .96], opacity: [.65, 1, .65] } : { scale: 1, opacity: 1 }} transition={{ duration: 1.2, repeat: holding ? Infinity : 0 }} className="h-[min(48vw,430px)] w-[min(48vw,430px)] rounded-full border border-teal/55"><span className="absolute left-1/2 top-0 h-10 w-px -translate-x-1/2 bg-teal/70"/><span className="absolute bottom-0 left-1/2 h-10 w-px -translate-x-1/2 bg-teal/30"/><span className="absolute left-0 top-1/2 h-px w-10 -translate-y-1/2 bg-teal/30"/><span className="absolute right-0 top-1/2 h-px w-10 -translate-y-1/2 bg-teal/30"/></motion.div></div>
      <div className="absolute left-0 right-0 top-0 flex items-center justify-between border-b border-white/10 bg-[#030606]/65 px-5 py-4 backdrop-blur-md"><div><p className="font-mono text-[8px] uppercase tracking-[.18em] text-teal">OVERHAUL VISION SWEEP</p><p className="mt-1 text-xs text-paper">{subject} · full-view evidence capture</p></div><button type="button" onClick={close} className="border border-steel/25 px-3 py-2 font-mono text-[8px] uppercase text-steel">Close</button></div>
      <div className="absolute bottom-6 left-1/2 w-[min(94%,780px)] -translate-x-1/2"><div className="mb-3 border border-white/10 bg-[#030606]/72 p-4 backdrop-blur-md"><div className="flex items-center justify-between font-mono text-[8px] uppercase"><span className="text-teal">12-sector sweep</span><span className="text-steel">{progress}% · {usableViews}/{SECTORS} usable</span></div><div className="mt-3 h-1 overflow-hidden bg-white/10"><motion.div className="h-full bg-teal" animate={{ width: `${Math.max(progress, coverage)}%` }}/></div><p className="mt-3 text-[10px] text-paper">{status}</p></div><div className="flex items-center gap-3"><button ref={buttonRef} type="button" disabled={processing} onPointerDown={(e) => beginHold(e.pointerId)} onPointerUp={(e) => { try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {} void endHold(); }} onPointerCancel={cancelHold} className={`relative grid h-20 w-20 shrink-0 touch-none select-none place-items-center rounded-full border-2 font-mono text-[9px] uppercase shadow-2xl ${holding ? "border-teal bg-teal/10 text-teal" : "border-paper bg-paper/10 text-paper"} disabled:opacity-40`}><span className="relative z-10">{processing ? "READ" : holding ? "HOLD" : "SCAN"}</span>{holding ? <motion.span className="absolute inset-1 rounded-full border border-teal/45" animate={{ scale: [.9, 1.06, .9], opacity: [.35, .8, .35] }} transition={{ duration: 1.2, repeat: Infinity }}/> : null}</button><div className="flex-1 border border-steel/15 bg-black/40 p-3"><p className="font-mono text-[7px] uppercase tracking-[.12em] text-steel">Coverage objective</p><p className="mt-1 text-[10px] text-paper">Full sweep · every usable frame analysed · dual-pass inventory + engineering detector</p></div><button type="button" onClick={reset} disabled={processing} className="border border-steel/20 px-4 py-3 font-mono text-[8px] uppercase text-steel disabled:opacity-30">Reset</button></div></div>
    </section>
    <aside className="flex min-h-0 flex-col overflow-y-auto bg-[#050707] p-5"><div className="border border-teal/15 bg-teal/[.025] p-4"><p className="font-mono text-[8px] uppercase tracking-[.16em] text-teal">Perception result</p><p className="mt-2 text-[10px] leading-5 text-steel">Objects are detected from the complete usable sweep. Two complementary passes broaden coverage; repeated camera views can corroborate an object but never invent hidden engineering facts.</p></div>
      <div className="mt-4 grid grid-cols-2 gap-2"><Stat label="Views captured" value={`${usableViews}`} /><Stat label="Views analysed" value={`${history.length}`} /><Stat label="Unique labels" value={`${uniqueLabels.length}`} /><Stat label="Coverage" value={`${Math.max(coverage, history.length ? Math.round((history.length / Math.max(usableViews, 1)) * 100) : 0)}%`} /></div>
      {uniqueLabels.length ? <section className="mt-4 border border-steel/15 p-4"><p className="font-mono text-[8px] uppercase text-steel">Detected object inventory</p><div className="mt-3 flex flex-wrap gap-2">{uniqueLabels.map((label) => <span key={label} className="border border-teal/15 bg-teal/[.03] px-2 py-1 font-mono text-[7px] uppercase text-teal">{label}</span>)}</div></section> : null}
      {lastResult ? <section className="mt-4 border border-steel/15 p-4"><p className="font-mono text-[8px] uppercase text-steel">Latest sector</p><p className="mt-2 text-[10px] text-paper">{lastResult.summary || "Visual evidence processed."}</p>{lastResult.detections?.slice(0, 8).map((d) => <div key={`${d.label}-${d.box.x}-${d.box.y}`} className="mt-3 border-t border-steel/10 pt-3"><div className="flex items-center justify-between"><span className="font-mono text-[8px] uppercase text-paper">{d.label}</span><span className="font-mono text-[8px] text-teal">{Math.round(d.confidence * 100)}%</span></div><p className="mt-1 text-[8px] leading-4 text-steel">{d.evidence || "Visible-object evidence."}{d.condition ? ` · ${d.condition}` : ""}</p></div>)}</section> : null}
      {history.length ? <section className="mt-4 border border-steel/15 p-4"><p className="font-mono text-[8px] uppercase text-steel">Evidence sectors</p><div className="mt-3 grid grid-cols-4 gap-2">{history.map((frame) => <div key={frame.id} className="relative overflow-hidden border border-steel/10"><img src={frame.image} alt={`Sector ${frame.sector + 1}`} className="aspect-video w-full object-cover"/><span className="absolute left-1 top-1 bg-black/70 px-1 py-0.5 font-mono text-[6px] text-teal">S{frame.sector + 1}</span></div>)}</div></section> : null}
      <section className="mt-4 border border-amber-200/15 bg-amber-200/[.02] p-4"><p className="font-mono text-[8px] uppercase text-amber-200">Engineering boundary</p><p className="mt-2 text-[9px] leading-5 text-steel">Visual detection identifies visible objects and conditions. It does not establish dimensions, efficiency, load, capacity, pressure, hidden components or failure. Those remain evidence-gated engineering inputs.</p></section>
    </aside>
  </div></div>;
}
function Stat({ label, value }: { label: string; value: string }) { return <div className="border border-steel/10 bg-black/20 p-3"><p className="font-mono text-[7px] uppercase text-steel">{label}</p><p className="mt-1 font-mono text-[11px] text-paper">{value}</p></div>; }
