"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

type Scope = "building" | "facility" | "equipment";
type Detection = { label: string; confidence: number; box: { x: number; y: number; width: number; height: number }; condition?: string; evidence?: string };
type ScanResult = { summary: string; detections: Detection[]; engineering_clues: string[]; coverage_notes: string[]; sector: number; sectorCount: number };
type ScanFrame = { id: string; sector: number; image: string; result?: ScanResult };
type Props = { scope?: Scope };

type RawFrame = { sector: number; image: string; blob: Blob };

const SECTORS = 12;
const CAPTURE_MS = 6000;
const SAMPLE_MS = 500;

function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }

export default function RoomScanOverlay({ scope = "building" }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureTimerRef = useRef<number | null>(null);
  const holdStartedRef = useRef<number | null>(null);
  const rawFramesRef = useRef<RawFrame[]>([]);

  const [open, setOpen] = useState(false);
  const [holding, setHolding] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [history, setHistory] = useState<ScanFrame[]>([]);
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [status, setStatus] = useState("Hold Scan and slowly rotate 360°.");

  const progress = Math.min(100, Math.round((elapsed / CAPTURE_MS) * 100));
  const coverage = Math.min(100, Math.round((rawFramesRef.current.length / SECTORS) * 100));
  const subject = scope === "equipment" ? "Machine / appliance" : "Room / space";

  useEffect(() => {
    const openFromShell = () => void start();
    window.addEventListener("overhaul:open-room-scan", openFromShell);
    return () => window.removeEventListener("overhaul:open-room-scan", openFromShell);
  });

  useEffect(() => () => {
    stopCaptureTimer();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const persistScan = (frames: ScanFrame[], complete: boolean) => {
    try {
      const compact = frames.map(({ image: _image, ...frame }) => frame);
      sessionStorage.setItem("overhaul:room-scan", JSON.stringify({
        scope,
        completed: complete,
        coveragePercent: Math.round((frames.length / SECTORS) * 100),
        sectors: compact,
        representativeSector: frames[Math.floor(frames.length / 2)]?.sector ?? null,
        updatedAt: new Date().toISOString(),
      }));
      window.dispatchEvent(new CustomEvent("overhaul:evidence-change"));
    } catch {}
  };

  async function start() {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      streamRef.current = stream;
      setOpen(true);
      setHistory([]);
      setLastResult(null);
      setElapsed(0);
      setStatus(scope === "equipment" ? "Hold the button while slowly moving around the asset." : "Hold the button while slowly rotating around the room.");
      requestAnimationFrame(() => { if (videoRef.current) videoRef.current.srcObject = stream; });
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : "Camera access unavailable. Check browser permissions.");
    }
  }

  function close() {
    stopCaptureTimer();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setHolding(false);
    setOpen(false);
    setProcessing(false);
  }

  function stopCaptureTimer() {
    if (captureTimerRef.current != null) window.clearInterval(captureTimerRef.current);
    captureTimerRef.current = null;
    holdStartedRef.current = null;
  }

  const snapshot = (): RawFrame | null => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL("image/jpeg", 0.8);
    const sector = Math.min(SECTORS - 1, rawFramesRef.current.length);
    return { sector, image, blob: dataUrlToBlob(image) };
  };

  function dataUrlToBlob(dataUrl: string): Blob {
    const [meta, encoded] = dataUrl.split(",");
    const binary = atob(encoded || "");
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const mime = meta.match(/data:(.*?);/)?.[1] || "image/jpeg";
    return new Blob([bytes], { type: mime });
  }

  function beginHold() {
    if (processing || !open || holding) return;
    rawFramesRef.current = [];
    setHistory([]);
    setLastResult(null);
    setHolding(true);
    setElapsed(0);
    setStatus(scope === "equipment" ? "Keep holding · sweep around the machine." : "Keep holding · rotate slowly through the room.");
    holdStartedRef.current = performance.now();
    const collect = () => {
      const started = holdStartedRef.current;
      if (started == null) return;
      const elapsedNow = performance.now() - started;
      setElapsed(Math.min(CAPTURE_MS, elapsedNow));
      if (rawFramesRef.current.length < SECTORS) {
        const frame = snapshot();
        if (frame) rawFramesRef.current.push(frame);
      }
      if (elapsedNow >= CAPTURE_MS || rawFramesRef.current.length >= SECTORS) {
        endHold();
      }
    };
    collect();
    captureTimerRef.current = window.setInterval(collect, SAMPLE_MS);
  }

  async function endHold() {
    if (!holding && holdStartedRef.current == null) return;
    stopCaptureTimer();
    setHolding(false);
    const captured = rawFramesRef.current.slice();
    if (!captured.length) {
      setStatus("No usable frame captured. Keep holding while the camera is active.");
      return;
    }
    setElapsed(CAPTURE_MS);
    setProcessing(true);
    setStatus(`Captured ${captured.length} views. Reading the strongest angles…`);

    const keyIndexes = Array.from(new Set([0, Math.floor(captured.length * 0.25), Math.floor(captured.length * 0.5), Math.floor(captured.length * 0.75), captured.length - 1])).filter((index) => index >= 0 && index < captured.length);
    const analyzed: ScanFrame[] = [];
    try {
      for (const index of keyIndexes) {
        const frame = captured[index];
        const form = new FormData();
        form.append("file", new File([frame.blob], `${scope}-sector-${frame.sector + 1}.jpg`, { type: "image/jpeg" }));
        form.append("scope", scope);
        form.append("sector", String(frame.sector));
        form.append("sectorCount", String(SECTORS));
        const response = await fetch("/api/vision/room-scan", { method: "POST", body: form });
        const payload = await response.json() as { result?: ScanResult; error?: string };
        if (!response.ok || !payload.result) throw new Error(payload.error || "Vision analysis failed.");
        analyzed.push({ id: uid(), sector: frame.sector, image: frame.image, result: payload.result });
        setHistory([...analyzed]);
        setLastResult(payload.result);
      }
      persistScan(analyzed, captured.length >= SECTORS);
      setStatus(captured.length >= SECTORS ? "360° evidence sweep captured. Continue to asset details." : `${captured.length} views retained as partial spatial evidence.`);
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : "Scan processing failed.");
      if (analyzed.length) persistScan(analyzed, false);
    } finally {
      setProcessing(false);
    }
  }

  const cancelHold = () => {
    if (!holding) return;
    stopCaptureTimer();
    setHolding(false);
    setElapsed(0);
    rawFramesRef.current = [];
    setHistory([]);
    setStatus("Scan cancelled. Hold the button to start a new sweep.");
  };

  const reset = () => {
    stopCaptureTimer();
    rawFramesRef.current = [];
    setHistory([]);
    setLastResult(null);
    setElapsed(0);
    setHolding(false);
    setCameraError(null);
    setStatus(scope === "equipment" ? "Hold the button while slowly moving around the asset." : "Hold the button while slowly rotating around the room.");
    try { sessionStorage.removeItem("overhaul:room-scan"); } catch {}
    window.dispatchEvent(new CustomEvent("overhaul:evidence-change"));
  };

  if (!open) {
    return cameraError ? <div className="fixed bottom-5 left-5 z-50 max-w-sm border border-red-400/25 bg-[#120909] px-4 py-3 text-[10px] text-red-200 shadow-2xl sm:left-auto sm:right-5">{cameraError}</div> : null;
  }

  return (
    <div className="fixed inset-0 z-[100] bg-[#030606]/96 backdrop-blur-sm">
      <div className="grid h-full lg:grid-cols-[1fr_360px]">
        <section className="relative min-h-0 overflow-hidden border-b border-steel/15 lg:border-b-0 lg:border-r">
          <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_35%,rgba(3,6,6,.7)_100%)]" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className={`h-[min(48vw,430px)] w-[min(48vw,430px)] rounded-full border transition ${holding ? "border-teal/65 shadow-[0_0_80px_rgba(52,211,188,.10)]" : "border-white/15"}`}><div className="absolute left-1/2 top-0 h-10 w-px -translate-x-1/2 bg-teal/70"/><div className="absolute bottom-0 left-1/2 h-10 w-px -translate-x-1/2 bg-teal/30"/><div className="absolute left-0 top-1/2 h-px w-10 -translate-y-1/2 bg-teal/30"/><div className="absolute right-0 top-1/2 h-px w-10 -translate-y-1/2 bg-teal/30"/></div></div>

          <div className="absolute left-0 right-0 top-0 flex items-center justify-between border-b border-white/10 bg-[#030606]/65 px-5 py-4 backdrop-blur-md"><div><p className="font-mono text-[8px] uppercase tracking-[0.18em] text-teal">OVERHAUL VISION SWEEP</p><p className="mt-1 text-xs text-paper">{subject} · guided spatial evidence</p></div><button type="button" onClick={close} className="border border-steel/25 px-3 py-2 font-mono text-[8px] uppercase text-steel hover:text-paper">Close</button></div>

          <div className="absolute bottom-6 left-1/2 w-[min(94%,760px)] -translate-x-1/2">
            <div className="mb-3 border border-white/10 bg-[#030606]/72 p-4 backdrop-blur-md"><div className="flex items-center justify-between font-mono text-[8px] uppercase tracking-[0.12em]"><span className="text-teal">360° sweep</span><span className="text-steel">{progress}% · {rawFramesRef.current.length} views</span></div><div className="mt-3 h-1 overflow-hidden bg-white/10"><motion.div className="h-full bg-teal" animate={{ width: `${progress}%` }}/></div><p className="mt-3 text-[10px] text-paper">{status}</p></div>
            <div className="flex items-center gap-3">
              <button type="button" disabled={processing} onPointerDown={beginHold} onPointerUp={() => void endHold()} onPointerCancel={cancelHold} onPointerLeave={() => { if (holding) void endHold(); }} className={`relative grid h-20 w-20 shrink-0 touch-none select-none place-items-center rounded-full border-2 font-mono text-[9px] uppercase tracking-[0.12em] shadow-2xl transition ${holding ? "border-teal bg-teal/10 text-teal" : "border-paper bg-paper/10 text-paper hover:border-teal hover:text-teal"} disabled:cursor-not-allowed disabled:opacity-40`}><span className="relative z-10">{processing ? "READ" : holding ? "HOLD" : "SCAN"}</span>{holding ? <motion.span className="absolute inset-1 rounded-full border border-teal/45" animate={{ scale: [0.9, 1.06, 0.9], opacity: [0.35, 0.8, 0.35] }} transition={{ duration: 1.1, repeat: Infinity }} /> : null}</button>
              <div className="min-w-0 flex-1 border border-white/10 bg-[#030606]/75 px-4 py-3 backdrop-blur-md"><p className="text-[10px] text-paper">{holding ? "Keep holding and move slowly." : "Press and hold Scan; release when you've completed the sweep."}</p><p className="mt-1 text-[8px] leading-4 text-steel">The camera captures multiple views locally, then sends only a small set of strongest angles for CV analysis. This is spatial evidence — not LiDAR or hidden measurement.</p></div>
            </div>
          </div>
        </section>

        <aside className="min-h-0 overflow-y-auto bg-[#070a0a]">
          <div className="sticky top-0 z-10 border-b border-steel/15 bg-[#070a0a]/95 px-5 py-4 backdrop-blur-md"><p className="font-mono text-[8px] uppercase tracking-[0.14em] text-teal">Capture map</p><h2 className="mt-1 font-display text-xl">360° evidence reel</h2></div>
          <div className="space-y-4 p-5">
            <div className="border border-teal/20 bg-teal/[0.035] p-4"><div className="flex items-center justify-between"><p className="font-mono text-[8px] uppercase text-teal">Coverage</p><p className="font-mono text-[9px] text-paper">{coverage}%</p></div><p className="mt-2 text-[9px] leading-5 text-steel">{scope === "equipment" ? "Move around the machine / appliance so the captured views cover the accessible sides." : "Rotate around the room. Twelve locally captured viewpoints make the sweep easy to review."}</p></div>
            {lastResult ? <><div className="border border-steel/15 p-4"><p className="font-mono text-[8px] uppercase text-steel">Latest CV read</p><p className="mt-2 text-sm leading-6 text-paper">{lastResult.summary}</p></div><div className="border border-steel/15 p-4"><p className="font-mono text-[8px] uppercase text-steel">Visible clues</p><div className="mt-3 space-y-2">{lastResult.detections.slice(0, 6).map((d, index) => <div key={`${d.label}-${index}`} className="flex items-center justify-between gap-3 border-b border-steel/10 py-2"><span className="text-[9px] text-paper">{d.label}</span><span className="font-mono text-[7px] text-teal">{Math.round(d.confidence * 100)}%</span></div>)}</div></div></> : null}
            <div className="grid grid-cols-2 gap-2">{history.map((frame) => <div key={frame.id} className="relative overflow-hidden border border-steel/15"><img src={frame.image} alt={`Captured sector ${frame.sector + 1}`} className="aspect-video w-full object-cover opacity-85"/><span className="absolute bottom-1 left-1 bg-black/75 px-1.5 py-0.5 font-mono text-[7px] text-teal">{String(frame.sector + 1).padStart(2, "0")} / 12</span></div>)}</div>
            <div className="grid grid-cols-2 gap-2"><button type="button" onClick={reset} className="border border-steel/20 px-3 py-3 font-mono text-[8px] uppercase tracking-[0.1em] text-steel hover:border-teal hover:text-teal">Reset</button><button type="button" onClick={close} disabled={!history.length || processing} className="border border-teal/30 bg-teal/[0.04] px-3 py-3 font-mono text-[8px] uppercase tracking-[0.1em] text-teal disabled:cursor-not-allowed disabled:opacity-30">Use scan →</button></div>
            {history.length ? <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="border border-amber-200/20 bg-amber-200/[0.025] p-4"><p className="font-mono text-[8px] uppercase text-amber-200">Next step</p><p className="mt-2 text-[9px] leading-5 text-steel">The sweep is now spatial evidence. OVERHAUL will ask for physical and operating details next. Only after those inputs are established does the metric digital twin unlock.</p></motion.div> : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
