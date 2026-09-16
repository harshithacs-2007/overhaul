"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Scope = "building" | "facility" | "equipment";
type Sector = { id: string; sector: number; capturedAt: string; result?: Record<string, unknown>; error?: string };

const SECTORS = 12;

function scoreFrame(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return { brightness: 0, contrast: 0 };
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  let sum = 0;
  let sumSq = 0;
  const step = Math.max(4, Math.floor(data.length / 24000));
  let count = 0;
  for (let i = 0; i < data.length; i += step * 4) {
    const value = (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) / 255;
    sum += value;
    sumSq += value * value;
    count += 1;
  }
  const brightness = count ? sum / count : 0;
  const variance = count ? Math.max(0, sumSq / count - brightness * brightness) : 0;
  return { brightness, contrast: Math.sqrt(variance) };
}

export default function RoomScanCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [scope, setScope] = useState<Scope>("building");
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [sector, setSector] = useState(0);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [message, setMessage] = useState("Ready for a guided 360° evidence sweep.");
  const [error, setError] = useState<string | null>(null);

  const captured = useMemo(() => new Set(sectors.map((item) => item.sector)), [sectors]);
  const progress = Math.round((captured.size / SECTORS) * 100);

  useEffect(() => {
    try {
      const assessment = JSON.parse(sessionStorage.getItem("overhaul:assessment") || "null") as { assessmentSubject?: Scope } | null;
      if (assessment?.assessmentSubject) setScope(assessment.assessmentSubject);
    } catch {}
    return () => stopCamera();
  }, []);

  const startCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setOpen(true);
      setRunning(true);
      setSector(0);
      setMessage("Start at any orientation. Keep the asset centered, then rotate roughly 30° per capture.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Camera access was denied or unavailable.");
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setRunning(false);
  };

  const capture = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;
    const width = Math.min(video.videoWidth || 1280, 1600);
    const height = Math.round(width * ((video.videoHeight || 720) / (video.videoWidth || 1280)));
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0, width, height);
    const quality = scoreFrame(canvas);
    if (quality.brightness < 0.08) {
      setMessage("Too dark. Move toward the asset or add light, then capture again.");
      return;
    }
    if (quality.brightness > 0.96) {
      setMessage("Highlights are clipping. Change angle slightly and capture again.");
      return;
    }
    if (quality.contrast < 0.055) {
      setMessage("Low visual contrast. Hold steady and expose more of the asset.");
      return;
    }

    const file = await new Promise<File | null>((resolve) => canvas.toBlob((blob) => resolve(blob ? new File([blob], `overhaul-sector-${String(sector + 1).padStart(2, "0")}.jpg`, { type: "image/jpeg" }) : null), "image/jpeg", 0.88));
    if (!file) return;
    setMessage(`Analysing sector ${sector + 1}/${SECTORS} with inventory + engineering vision…`);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("scope", scope);
      form.append("sector", String(sector));
      form.append("sectorCount", String(SECTORS));
      const response = await fetch("/api/vision/room-scan", { method: "POST", body: form });
      const payload = await response.json() as { result?: Record<string, unknown>; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error || "Vision analysis failed.");
      const next = [...sectors.filter((item) => item.sector !== sector), { id: crypto.randomUUID(), sector, capturedAt: new Date().toISOString(), result: payload.result }].sort((a, b) => a.sector - b.sector);
      setSectors(next);
      sessionStorage.setItem("overhaul:room-scan", JSON.stringify({ scope, sectorCount: SECTORS, sectors: next, completed: next.length === SECTORS, coveragePercent: Math.round((next.length / SECTORS) * 100) }));
      window.dispatchEvent(new CustomEvent("overhaul:room-scan-change"));
      if (next.length === SECTORS) {
        setMessage("Full 12-sector sweep complete. OVERHAUL can now fuse repeated objects and target blind spots.");
        setRunning(false);
        stopCamera();
        return;
      }
      const nextSector = (sector + 1) % SECTORS;
      setSector(nextSector);
      setMessage(`Sector ${sector + 1} locked. Rotate about 30° and capture sector ${nextSector + 1}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Vision analysis failed.");
      setMessage("Frame was not committed. Re-capture this sector after the connection recovers.");
    }
  };

  const reset = () => {
    setSectors([]);
    setSector(0);
    setError(null);
    sessionStorage.removeItem("overhaul:room-scan");
    window.dispatchEvent(new CustomEvent("overhaul:room-scan-change"));
  };

  return <section className="overflow-hidden border border-teal/20 bg-[#050908] shadow-[0_28px_110px_rgba(0,0,0,.24)]">
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-steel/10 px-5 py-5"><div><p className="font-mono text-[8px] uppercase tracking-[.2em] text-teal">Live evidence capture</p><h2 className="mt-1 font-display text-3xl">Guided 360° reality sweep.</h2><p className="mt-2 max-w-3xl text-[10px] leading-5 text-steel">The camera now captures 12 deliberately separated views, rejects obviously unusable frames, runs the existing dual-pass vision stack, and stores every sector for cross-view fusion.</p></div><div className="flex gap-2"><button type="button" onClick={reset} className="border border-steel/20 px-3 py-2 font-mono text-[8px] uppercase text-steel hover:text-paper">Reset</button>{!running ? <button type="button" onClick={() => void startCamera()} className="border border-teal/40 bg-teal/5 px-4 py-2 font-mono text-[8px] uppercase text-teal hover:bg-teal/10">Open camera</button> : <button type="button" onClick={stopCamera} className="border border-clay/30 px-3 py-2 font-mono text-[8px] uppercase text-clay">Stop</button>}</div></div>
    <div className="grid xl:grid-cols-[1.3fr_.7fr]">
      <div className="relative min-h-[420px] bg-black"><video ref={videoRef} muted playsInline className={`h-full min-h-[420px] w-full object-cover ${open ? "opacity-100" : "opacity-0"}`} /><div className="pointer-events-none absolute inset-0"><div className="absolute left-1/2 top-1/2 h-[54%] w-[54%] -translate-x-1/2 -translate-y-1/2 border border-teal/50 shadow-[0_0_80px_rgba(44,224,202,.08)]"/><div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal shadow-[0_0_18px_rgba(44,224,202,.9)]"/><div className="absolute bottom-5 left-1/2 -translate-x-1/2 border border-black/40 bg-black/65 px-3 py-2 font-mono text-[8px] uppercase tracking-[.12em] text-paper backdrop-blur">Sector {sector + 1} / {SECTORS} · rotate ~30° after capture</div></div>{!open ? <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_center,rgba(44,224,202,.08),transparent_55%)]"><div className="max-w-sm p-8 text-center"><p className="font-mono text-[9px] uppercase tracking-[.18em] text-teal">Camera offline</p><p className="mt-3 text-sm text-paper">Open the camera to build a real multi-view evidence set instead of uploading one arbitrary photo.</p></div></div> : null}</div>
      <aside className="p-5"><div className="grid grid-cols-2 gap-2"><Metric label="Coverage" value={`${progress}%`} /><Metric label="Captured" value={`${captured.size}/${SECTORS}`} /><Metric label="Next sector" value={String(sector + 1).padStart(2, "0")} /><Metric label="Vision passes" value="2× / view" /></div><label className="mt-4 block"><span className="font-mono text-[8px] uppercase tracking-[.14em] text-steel">Assessment scope</span><select value={scope} onChange={(event) => setScope(event.target.value as Scope)} className="mt-2 w-full border border-steel/20 bg-[#050505] px-3 py-2 text-xs text-paper outline-none"><option value="building">Building</option><option value="facility">Facility</option><option value="equipment">Equipment</option></select></label><div className="mt-4 h-1 overflow-hidden bg-steel/10"><div className="h-full bg-teal transition-[width] duration-300" style={{ width: `${progress}%` }} /></div><p className="mt-4 min-h-12 text-[9px] leading-5 text-steel">{message}</p>{error ? <div className="mt-3 border border-clay/25 bg-clay/5 p-3 text-[9px] leading-4 text-clay">{error}</div> : null}<button type="button" disabled={!running || captured.has(sector)} onClick={() => void capture()} className="mt-4 w-full border border-gold/35 bg-gold/5 px-4 py-3 font-mono text-[9px] uppercase tracking-[.12em] text-gold disabled:cursor-not-allowed disabled:opacity-30">{captured.has(sector) ? "Sector captured · rotate" : `Capture sector ${sector + 1}`}</button><div className="mt-4 grid grid-cols-6 gap-1.5">{Array.from({ length: SECTORS }, (_, index) => <button key={index} type="button" onClick={() => setSector(index)} className={`h-7 border font-mono text-[8px] ${captured.has(index) ? "border-teal/40 bg-teal/10 text-teal" : index === sector ? "border-gold/50 text-gold" : "border-steel/15 text-steel"}`}>{index + 1}</button>)}</div><p className="mt-4 text-[8px] leading-4 text-steel">Quality gating is intentionally lightweight: it catches dark, clipped, or nearly textureless frames without pretending that image quality proves geometry.</p></aside>
    </div><canvas ref={canvasRef} className="hidden" />
  </section>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="border border-steel/10 p-3"><p className="font-mono text-[7px] uppercase text-steel">{label}</p><p className="mt-1 font-mono text-[10px] text-paper">{value}</p></div>; }
