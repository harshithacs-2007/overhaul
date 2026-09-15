"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";

type Scope = "building" | "facility" | "equipment";
type Detection = { label: string; confidence: number; box: { x: number; y: number; width: number; height: number }; condition: string; evidence: string };
type ScanResult = { summary: string; detections: Detection[]; engineering_clues: string[]; coverage_notes: string[]; sector: number; sectorCount: number };
type ScanFrame = { id: string; sector: number; image: string; result: ScanResult };

type Props = { scope?: Scope };
const SECTORS = 12;

function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }

export default function RoomScanOverlay({ scope = "building" }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [sector, setSector] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [history, setHistory] = useState<ScanFrame[]>([]);
  const [rotationHint, setRotationHint] = useState("Point the camera at the first wall, then capture.");

  const progress = Math.round((history.length / SECTORS) * 100);
  const sectorLabel = useMemo(() => `SECTOR ${String(Math.min(sector + 1, SECTORS)).padStart(2, "0")} / ${SECTORS}`, [sector]);
  const subjectLabel = scope === "equipment" ? "Machine / appliance intelligence" : "Space intelligence";
  const triggerLabel = scope === "equipment" ? "◉ Asset Scan · CV" : "◉ Space Scan · 360° CV";
  const finished = history.length >= SECTORS;

  const persistScan = (frames: ScanFrame[]) => {
    try {
      sessionStorage.setItem("overhaul:room-scan", JSON.stringify({
        scope,
        completed: frames.length >= SECTORS,
        coveragePercent: Math.round((frames.length / SECTORS) * 100),
        sectors: frames.map(({ image: _image, ...frame }) => frame),
        updatedAt: new Date().toISOString(),
      }));
      window.dispatchEvent(new CustomEvent("overhaul:evidence-change"));
    } catch {}
  };

  const start = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      streamRef.current = stream;
      setOpen(true);
      requestAnimationFrame(() => { if (videoRef.current) videoRef.current.srcObject = stream; });
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : "Camera access unavailable.");
    }
  };

  const close = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setOpen(false);
    setProcessing(false);
  };

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const capture = async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || processing || finished) return;
    setProcessing(true);
    setRotationHint("Reading visible equipment, surfaces and engineering clues…");

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL("image/jpeg", 0.82);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob) { setProcessing(false); return; }

    try {
      const form = new FormData();
      form.append("file", new File([blob], `${scope}-sector-${sector + 1}.jpg`, { type: "image/jpeg" }));
      form.append("scope", scope);
      form.append("sector", String(sector));
      form.append("sectorCount", String(SECTORS));
      const response = await fetch("/api/vision/room-scan", { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Scan failed.");
      const result = payload.result as ScanResult;
      const frame = { id: uid(), sector, image, result };
      setLastResult(result);
      setHistory((current) => {
        const next = [...current, frame];
        persistScan(next);
        return next;
      });
      if (sector < SECTORS - 1) {
        setSector((value) => value + 1);
        setRotationHint(`Turn about ${Math.round(360 / SECTORS)}° clockwise and capture the next sector.`);
      } else {
        setRotationHint("360° coverage complete. Review the evidence map.");
      }
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : "Scan failed.");
    } finally {
      setProcessing(false);
    }
  };

  const finishEarly = () => {
    if (history.length < 3) return;
    persistScan(history);
    setRotationHint(`${history.length} sectors retained as partial spatial evidence. You can continue later.`);
    close();
  };

  const reset = () => {
    setHistory([]);
    setLastResult(null);
    setSector(0);
    setCameraError(null);
    setRotationHint("Point the camera at the first wall, then capture.");
    try { sessionStorage.removeItem("overhaul:room-scan"); } catch {}
  };

  if (!open) {
    return <>
      <button data-room-scan type="button" onClick={start} className="fixed bottom-5 left-5 z-40 border border-teal/40 bg-[#071313]/95 px-4 py-3 font-mono text-[9px] uppercase tracking-[0.14em] text-teal shadow-2xl backdrop-blur hover:border-teal sm:left-auto sm:right-[220px]">
        {triggerLabel}
      </button>
      {cameraError ? <div className="fixed bottom-5 left-5 z-50 max-w-sm border border-red-400/25 bg-[#120909] px-4 py-3 text-[10px] text-red-200 shadow-2xl sm:left-auto sm:right-5">{cameraError}</div> : null}
    </>;
  }

  return (
    <div className="fixed inset-0 z-[100] bg-[#030606]/96 backdrop-blur-sm">
      <div className="grid h-full lg:grid-cols-[1fr_360px]">
        <section className="relative min-h-0 overflow-hidden border-b border-steel/15 lg:border-b-0 lg:border-r">
          <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_35%,rgba(3,6,6,.7)_100%)]" />
          <div className="pointer-events-none absolute inset-0">
            {lastResult?.detections.map((d, index) => (
              <div key={`${d.label}-${index}`} className="absolute border border-teal/90 bg-teal/[0.08]" style={{ left: `${d.box.x * 100}%`, top: `${d.box.y * 100}%`, width: `${d.box.width * 100}%`, height: `${d.box.height * 100}%` }}>
                <div className="absolute -top-5 left-0 whitespace-nowrap bg-[#041010]/95 px-2 py-1 font-mono text-[8px] uppercase text-teal">{d.label} · {Math.round(d.confidence * 100)}%</div>
              </div>
            ))}
          </div>

          <div className="absolute left-0 right-0 top-0 flex items-center justify-between border-b border-white/10 bg-[#030606]/60 px-5 py-4 backdrop-blur-md">
            <div><p className="font-mono text-[8px] uppercase tracking-[0.18em] text-teal">OVERHAUL COMPUTER VISION</p><p className="mt-1 text-xs text-paper">{subjectLabel}</p></div>
            <button type="button" onClick={close} className="border border-steel/25 px-3 py-2 font-mono text-[8px] uppercase text-steel hover:text-paper">Close</button>
          </div>

          <div className="absolute bottom-6 left-1/2 w-[min(92%,760px)] -translate-x-1/2">
            <div className="mb-3 flex items-center justify-between rounded border border-white/10 bg-[#030606]/70 px-4 py-3 font-mono text-[8px] uppercase tracking-[0.12em] backdrop-blur-md">
              <span className="text-teal">{sectorLabel}</span>
              <span className="text-steel">{history.length} captured · {progress}% coverage</span>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={capture} disabled={processing || finished} className="grid h-16 w-16 shrink-0 place-items-center rounded-full border-2 border-paper bg-paper/10 font-mono text-xs text-paper backdrop-blur-md disabled:opacity-40">{processing ? "…" : finished ? "DONE" : "SCAN"}</button>
              <div className="min-w-0 flex-1 border border-white/10 bg-[#030606]/75 px-4 py-3 backdrop-blur-md"><p className="text-[10px] text-paper">{rotationHint}</p><p className="mt-1 text-[8px] text-steel">Full coverage uses 12 sectors. Partial evidence is still retained and never converted into invented geometry.</p></div>
            </div>
            {history.length >= 3 && !finished ? <button type="button" onClick={finishEarly} className="mt-2 font-mono text-[7px] uppercase tracking-[0.12em] text-steel hover:text-teal">Finish with current evidence →</button> : null}
          </div>
        </section>

        <aside className="min-h-0 overflow-y-auto bg-[#070a0a]">
          <div className="sticky top-0 z-10 border-b border-steel/15 bg-[#070a0a]/95 px-5 py-4 backdrop-blur-md">
            <div className="flex items-center justify-between"><div><p className="font-mono text-[8px] uppercase tracking-[0.14em] text-teal">Live scene understanding</p><h2 className="mt-1 font-display text-xl">What it sees</h2></div><span className="font-mono text-[8px] uppercase text-steel">{scope}</span></div>
          </div>
          <div className="space-y-4 p-5">
            {lastResult ? <>
              <div className="border border-teal/20 bg-teal/[0.04] p-4"><p className="font-mono text-[8px] uppercase text-teal">Scene summary</p><p className="mt-2 text-sm leading-6 text-paper">{lastResult.summary}</p></div>
              <div className="border border-steel/15 p-4"><p className="font-mono text-[8px] uppercase text-steel">Visible detections</p><div className="mt-3 space-y-2">{lastResult.detections.length ? lastResult.detections.map((d, i) => <div key={`${d.label}-panel-${i}`} className="border border-steel/10 px-3 py-2"><div className="flex items-center justify-between gap-3"><span className="text-[10px] text-paper">{d.label}</span><span className="font-mono text-[8px] text-teal">{Math.round(d.confidence * 100)}%</span></div><p className="mt-1 text-[8px] leading-4 text-steel">{d.condition || d.evidence}</p></div>) : <p className="text-[9px] text-steel">No bounded objects confidently detected in this sector.</p>}</div></div>
              <div className="border border-steel/15 p-4"><p className="font-mono text-[8px] uppercase text-steel">Engineering clues</p><div className="mt-3 space-y-2">{lastResult.engineering_clues.map((clue, i) => <div key={i} className="flex gap-2 text-[9px] leading-4 text-steel"><span className="text-teal">›</span><span>{clue}</span></div>)}</div></div>
              <div className="border border-steel/15 p-4"><p className="font-mono text-[8px] uppercase text-steel">Coverage notes</p><div className="mt-3 space-y-2">{lastResult.coverage_notes.map((note, i) => <p key={i} className="text-[9px] leading-4 text-steel">{note}</p>)}</div></div>
            </> : <div className="grid min-h-[320px] place-items-center border border-dashed border-steel/20 p-6 text-center"><div><div className="mx-auto h-12 w-12 rounded-full border border-teal/30"/><p className="mt-4 font-display text-lg">Point. Capture. Understand.</p><p className="mt-2 text-[9px] leading-5 text-steel">The first processed frame populates this panel with bounded visual detections and evidence-grounded engineering clues.</p></div></div>}

            <div className="grid grid-cols-3 gap-2">
              {history.map((frame) => <div key={frame.id} className="relative overflow-hidden border border-steel/15"><img src={frame.image} alt={`Scan sector ${frame.sector + 1}`} className="aspect-video w-full object-cover opacity-80"/><span className="absolute bottom-1 left-1 bg-black/70 px-1.5 py-0.5 font-mono text-[7px] text-teal">S{frame.sector + 1}</span></div>)}
            </div>
            <button type="button" onClick={reset} className="w-full border border-steel/20 px-3 py-3 font-mono text-[8px] uppercase tracking-[0.12em] text-steel hover:border-teal hover:text-teal">Reset scan</button>
            {history.length === SECTORS ? <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="border border-teal/25 bg-teal/[0.05] p-4"><p className="font-mono text-[8px] uppercase text-teal">360° evidence bundle ready</p><p className="mt-2 text-[9px] leading-5 text-steel">The sweep is now stored as spatial evidence and can seed the asset model. Geometry remains unresolved until dimensions/depth evidence is established.</p></motion.div> : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
