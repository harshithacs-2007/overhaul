"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import type { TwinModel } from "@/lib/engineering/twinModel";

type Scope = "building" | "facility" | "equipment";
type Detection = { label: string; confidence: number; box: { x: number; y: number; width: number; height: number }; condition?: string; evidence?: string };
type ScanResult = { summary: string; detections: Detection[]; engineering_clues: string[]; coverage_notes: string[]; visible_details?: Array<{ field: string; value: string; confidence: number }>; sector: number; sectorCount: number };
type Frame = { id: string; sector: number; image: string; quality: number; motion: number; result?: ScanResult };
type Props = { scope?: Scope };

const SECTORS = 12;
const MAX_MS = 12000;
const RETRY_MS = 550;
const MIN_QUALITY = 0.34;
const MIN_MOTION = 0.012;
const DB = "overhaul-evidence";
const STORE = "scan-frames";

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const read = <T,>(key: string, fallback: T): T => { try { return JSON.parse(sessionStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; } };
const write = (key: string, value: unknown) => { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {} };

function dbPut(frames: Frame[]) {
  return new Promise<void>((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
      req.onsuccess = () => { const tx = req.result.transaction(STORE, "readwrite"); const store = tx.objectStore(STORE); frames.forEach((f) => store.put(f)); tx.oncomplete = () => { req.result.close(); resolve(); }; tx.onerror = () => { req.result.close(); resolve(); }; };
      req.onerror = () => resolve();
    } catch { resolve(); }
  });
}

function quality(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true }); if (!ctx) return 0;
  const w = 160, h = Math.max(1, Math.round(canvas.height * w / Math.max(canvas.width, 1))); const d = ctx.getImageData(0, 0, w, h).data;
  let mean = 0, edge = 0, n = 0;
  for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) { const i = (y * w + x) * 4; const l = .2126*d[i]+.7152*d[i+1]+.0722*d[i+2]; mean += l; n++; if (x + 4 < w) { const j=(y*w+x+4)*4; edge += Math.abs(l-(.2126*d[j]+.7152*d[j+1]+.0722*d[j+2])); } }
  mean /= Math.max(n, 1); const exposure = 1 - Math.min(1, Math.abs(mean - 128) / 128); const sharp = Math.min(1, edge / Math.max(n * 28, 1)); return Math.max(0, Math.min(1, exposure * .45 + sharp * .55));
}

function motionScore(canvas: HTMLCanvasElement, prev: ImageData | null) {
  if (!prev) return 1; const ctx = canvas.getContext("2d", { willReadFrequently: true }); if (!ctx) return 0;
  const cur = ctx.getImageData(0, 0, 64, Math.max(1, Math.round(canvas.height * 64 / Math.max(canvas.width, 1)))); let total=0,n=0;
  for (let y=0;y<cur.height;y+=5) for(let x=0;x<cur.width;x+=5){const i=(y*cur.width+x)*4;const j=(Math.min(y,prev.height-1)*prev.width+Math.min(x,prev.width-1))*4; total += Math.abs(cur.data[i]-prev.data[j])+Math.abs(cur.data[i+1]-prev.data[j+1])+Math.abs(cur.data[i+2]-prev.data[j+2]);n++;}
  return Math.min(1,total/Math.max(n*765,1));
}

async function json<T>(response: Response): Promise<T> { const text = await response.text(); try { return JSON.parse(text) as T; } catch { throw new Error(text || `Request failed (${response.status})`); } }

export default function RoomScanOverlay({ scope = "building" }: Props) {
  const router = useRouter(); const video = useRef<HTMLVideoElement>(null); const stream = useRef<MediaStream|null>(null); const timer = useRef<number|null>(null); const started = useRef(0); const prev = useRef<ImageData|null>(null); const frames = useRef<Frame[]>([]); const sector = useRef(-1); const current = useRef(0);
  const [open,setOpen]=useState(false); const [holding,setHolding]=useState(false); const [processing,setProcessing]=useState(false); const [ready,setReady]=useState(false); const [error,setError]=useState<string|null>(null); const [status,setStatus]=useState("Ready to capture evidence."); const [progress,setProgress]=useState(0); const [coverage,setCoverage]=useState(0); const [twinStatus,setTwinStatus]=useState("pending");

  const stopTimer=()=>{ if(timer.current!=null) window.clearInterval(timer.current); timer.current=null; };
  const close=()=>{ stopTimer(); stream.current?.getTracks().forEach(t=>t.stop()); stream.current=null; setOpen(false); setHolding(false); setProcessing(false); };
  async function start(){
    setError(null); setReady(false); setCoverage(0); setTwinStatus("pending");
    try {
      if(!navigator.mediaDevices?.getUserMedia) throw new Error("This browser does not expose camera capture.");
      const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}},audio:false});
      stream.current=s; setOpen(true); requestAnimationFrame(()=>{if(video.current) video.current.srcObject=s;}); setStatus(scope==="equipment"?"Move around the asset slowly. We retry weak sectors automatically.":"Rotate slowly. OVERHAUL locks each sector only when evidence is usable.");
    } catch(e){setError(e instanceof Error?e.message:"Camera permission failed.");}
  }
  useEffect(()=>{ const openScan=()=>void start(); window.addEventListener("overhaul:open-room-scan",openScan); return()=>window.removeEventListener("overhaul:open-room-scan",openScan); },[]);
  useEffect(()=>()=>close(),[]);

  function capture(target:number): Frame|null {
    const v=video.current; if(!v || v.readyState<2 || !v.videoWidth) return null;
    const c=document.createElement("canvas"); c.width=v.videoWidth; c.height=v.videoHeight; const ctx=c.getContext("2d",{willReadFrequently:true}); if(!ctx) return null; ctx.drawImage(v,0,0,c.width,c.height);
    const q=quality(c); const m=motionScore(c,prev.current); const sw=64, sh=Math.max(1,Math.round(c.height*sw/c.width)); prev.current=ctx.getImageData(0,0,sw,sh); const image=c.toDataURL("image/jpeg",.76);
    return {id:uid(),sector:target,image,quality:q,motion:m};
  }
  function begin(){
    if(!open||processing||holding) return; frames.current=[]; sector.current=-1; current.current=0; prev.current=null; setReady(false); setHolding(true); setProgress(0); setCoverage(0); setStatus("Calibrating camera… keep moving continuously."); started.current=performance.now();
    const tick=()=>{
      const elapsed=performance.now()-started.current; const target=Math.min(SECTORS-1,Math.floor(elapsed/(MAX_MS/SECTORS))); current.current=target; setProgress(Math.min(100,Math.round(elapsed/MAX_MS*100)));
      if(target!==sector.current){ const f=capture(target); if(f && f.quality>=MIN_QUALITY && (f.motion>=MIN_MOTION || target===0)){ frames.current=[...frames.current,f]; sector.current=target; setCoverage(Math.round(frames.current.length/SECTORS*100)); setStatus(`Locked sector ${target+1}/${SECTORS} · ${(f.quality*100).toFixed(0)}% frame quality`); } else setStatus(`Sector ${target+1}/${SECTORS} needs another view · keep moving.`); }
      if(elapsed>=MAX_MS || frames.current.length===SECTORS){ stopTimer(); setHolding(false); void finish(); }
    };
    tick(); timer.current=window.setInterval(tick,RETRY_MS);
  }
  async function analyse(frame:Frame){
    for(let attempt=1;attempt<=2;attempt++){
      try{
        const blob=await (await fetch(frame.image)).blob(); const form=new FormData(); form.append("file",new File([blob],`${scope}-sector-${frame.sector+1}.jpg`,{type:"image/jpeg"})); form.append("scope",scope); form.append("sector",String(frame.sector)); form.append("sectorCount",String(SECTORS));
        const r=await fetch("/api/vision/room-scan",{method:"POST",body:form}); const p=await json<{result?:ScanResult;error?:string}>(r); if(!r.ok||!p.result) throw new Error(p.error||"Vision analysis failed"); return {...frame,result:p.result};
      }catch(e){if(attempt===2) console.warn("sector analysis failed",frame.sector,e);}
    } return null;
  }
  async function finish(){
    const captured=[...frames.current]; if(!captured.length){setStatus("No usable evidence captured. Improve lighting and move slower.");return;} setProcessing(true); setStatus(`Analysing ${captured.length} captured sectors…`);
    try{
      const analysed=(await Promise.all(captured.map(analyse))).filter(Boolean) as Frame[]; if(!analysed.length) throw new Error("The captured views could not be analysed. Nothing was discarded silently.");
      frames.current=analysed; await dbPut(analysed); const complete=analysed.length>=9; const fusionR=await fetch("/api/vision/scan-fusion",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({scope,analyses:analysed.map(f=>({sector:f.sector,...f.result}))})});
      let fusion:null|unknown=null; try{const fp=await json<{result?:unknown}>(fusionR);if(fusionR.ok&&fp.result){fusion=fp.result;write("overhaul:scan-fusion",fusion);}}catch(e){console.warn("fusion unavailable",e);}
      const stored=read<Record<string,unknown>>("overhaul:intake-context",{}); const form=new FormData(); form.append("scope",scope); form.append("className",String(stored.className||scope)); form.append("industry",String(stored.industry||"other")); form.append("title",String(stored.title||stored.className||"OVERHAUL Twin")); form.append("extracted",JSON.stringify({observations:analysed.map(f=>f.result),scanFusion:fusion}).slice(0,45000));
      for(const f of analysed.slice(0,6)){const blob=await (await fetch(f.image)).blob();form.append("file",new File([blob],`scan-${f.sector+1}.jpg`,{type:"image/jpeg"}));}
      let twin: TwinModel|null=null; try{const tr=await fetch("/api/model/generate",{method:"POST",body:form});const tp=await json<{model?:TwinModel;error?:string}>(tr);if(tr.ok&&tp.model){twin=tp.model;write("overhaul:twin-model",twin);setTwinStatus(tp.model.geometryStatus||"relative-only");}}catch(e){console.warn("twin generation failed; evidence remains stored",e);}
      const scanRecord={scope,completed:complete,coveragePercent:Math.round(analysed.length/SECTORS*100),sectors:analysed.map((f)=>({id:f.id,sector:f.sector,quality:f.quality,motion:f.motion,result:f.result})),frameCount:analysed.length,updatedAt:new Date().toISOString()}; write("overhaul:room-scan",scanRecord);
      const assessment=read<Record<string,unknown>>("overhaul:assessment",{}); write("overhaul:assessment",{...assessment,status:complete?"scan-complete":"scan-partial",twinStatus:twin?"generated":"pending",scanFrameCount:analysed.length,scanCoveragePercent:Math.round(analysed.length/SECTORS*100)});
      window.dispatchEvent(new CustomEvent("overhaul:evidence-change")); window.dispatchEvent(new CustomEvent("overhaul:scan-fusion-change")); window.dispatchEvent(new CustomEvent("overhaul:twin-change")); window.dispatchEvent(new CustomEvent("overhaul:assessment-change"));
      setCoverage(Math.round(analysed.length/SECTORS*100)); setReady(true); setStatus(`${analysed.length}/${SECTORS} sectors analysed · evidence persisted · twin ${twin?"available":"queued"}.`);
    }catch(e){setError(e instanceof Error?e.message:"Scan processing failed");setStatus("Processing stopped safely; captured evidence was not replaced with guesses.");}finally{setProcessing(false);}
  }
  return <AnimatePresence>{open&&<motion.div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-3 backdrop-blur-md" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}><motion.div className="relative w-full max-w-6xl overflow-hidden border border-teal/30 bg-[#050909] shadow-2xl" initial={{scale:.96,y:18}} animate={{scale:1,y:0}}><div className="grid lg:grid-cols-[1.35fr_.65fr]"><div className="relative aspect-video overflow-hidden bg-black"><video ref={video} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-cover"/><div className="pointer-events-none absolute inset-0"><div className="absolute inset-6 border border-teal/25"/><motion.div className="absolute left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full border border-teal/35" animate={{scale:[.92,1.06,.92],rotate:[0,90,180]}} transition={{duration:5,repeat:Infinity,ease:"easeInOut"}}/><motion.div className="absolute inset-x-0 top-1/2 h-px bg-teal/40" animate={{opacity:[.2,.8,.2]}} transition={{duration:1.4,repeat:Infinity}}/></div><div className="absolute left-4 top-4 rounded border border-black/40 bg-black/60 px-3 py-2 font-mono text-[9px] uppercase tracking-[.14em] text-teal">LIVE EVIDENCE CAPTURE</div><div className="absolute bottom-4 left-4 right-4"><div className="h-1 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full bg-teal" animate={{width:`${progress}%`}}/></div><div className="mt-2 flex justify-between font-mono text-[8px] text-steel"><span>{coverage}% sector coverage</span><span>pass {Math.min(SECTORS,Math.round(coverage/100*SECTORS))}/{SECTORS}</span></div></div></div><div className="flex flex-col p-5 sm:p-7"><button type="button" onClick={close} className="self-end font-mono text-[8px] uppercase text-steel hover:text-paper">Close</button><p className="mt-6 font-mono text-[8px] uppercase tracking-[.2em] text-teal">{scope} reconstruction</p><h2 className="mt-2 font-display text-4xl">Capture reality.<br/>Not assumptions.</h2><p className="mt-3 text-[10px] leading-5 text-steel">Weak views are retried instead of silently accepted. Geometry remains unverified until independent metric evidence supports scale.</p><div className="mt-6 grid grid-cols-6 gap-1.5">{Array.from({length:SECTORS},(_,i)=>{const locked=frames.current.some(f=>f.sector===i);return <motion.div key={i} className={`h-7 border ${locked?"border-teal/60 bg-teal/15":"border-steel/15 bg-white/[.02]"}`} animate={locked?{opacity:[.55,1,.55]}:{opacity:1}} transition={{duration:1.2,repeat:locked?Infinity:0}}/>})}</div><div className="mt-6 space-y-2">{error?<div className="border border-red-300/20 bg-red-300/5 p-3 font-mono text-[8px] leading-4 text-red-200">{error}</div>:null}<div className="border border-steel/10 bg-white/[.02] p-3 font-mono text-[8px] leading-4 text-steel">{status}</div><div className="grid grid-cols-2 gap-2"><Metric label="coverage" value={`${coverage}%`}/><Metric label="twin state" value={twinStatus}/></div></div>{ready?<button type="button" onClick={()=>router.push("/assessment")} className="mt-auto border border-teal/40 bg-teal/[.06] px-4 py-3 font-mono text-[9px] uppercase tracking-[.12em] text-teal">Continue to evidence &amp; assessment →</button>:<button type="button" disabled={processing||holding} onClick={begin} className="mt-auto border border-gold/40 bg-gold/[.05] px-4 py-3 font-mono text-[9px] uppercase tracking-[.12em] text-gold disabled:opacity-40">{processing?"Processing evidence…":holding?"Capturing 360° evidence…":"Start 360° capture"}</button>}</div></div></motion.div></motion.div>}</AnimatePresence>;
}

function Metric({label,value}:{label:string;value:string}){return <div className="border border-steel/10 bg-black/20 p-3"><p className="font-mono text-[7px] uppercase tracking-[.12em] text-steel">{label}</p><p className="mt-1 text-[11px] text-paper">{value}</p></div>;}
