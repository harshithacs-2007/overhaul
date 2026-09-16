"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";

type Twin = { geometryStatus?: string; assetClass?: string; provenance?: { evidenceIds?: string[] } } | null;

const read = <T,>(key: string, fallback: T): T => { try { return JSON.parse(sessionStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; } };

export default function RetrofitTransitionVisualizer() {
  const [twin,setTwin]=useState<Twin>(null); const [coverage,setCoverage]=useState(0); const [mode,setMode]=useState<"current"|"retrofit">("current");
  useEffect(()=>{const sync=()=>{setTwin(read<Twin>("overhaul:twin-model",null));setCoverage(read<{coveragePercent?:number}>("overhaul:room-scan",{}).coveragePercent||0)};sync();window.addEventListener("overhaul:twin-change",sync);window.addEventListener("overhaul:evidence-change",sync);return()=>{window.removeEventListener("overhaul:twin-change",sync);window.removeEventListener("overhaul:evidence-change",sync)}},[]);
  const verified=twin?.geometryStatus==="verified-metric"; const bars=useMemo(()=>Array.from({length:8},(_,i)=>i),[]);
  return <section className="relative overflow-hidden border border-teal/15 bg-[#050909] p-5 sm:p-7">
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(44,224,202,.09),transparent_30%)]"/>
    <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-mono text-[8px] uppercase tracking-[.2em] text-teal">Counterfactual visualization</p><h3 className="mt-2 font-display text-3xl">Reality → retrofit delta</h3><p className="mt-2 max-w-2xl text-[10px] leading-5 text-steel">The animation is explanatory, not a substitute for measured engineering values. Unverified geometry stays visibly unverified.</p></div><div className="flex border border-steel/15 p-1 font-mono text-[8px] uppercase"><button type="button" onClick={()=>setMode("current")} className={`px-3 py-2 ${mode==="current"?"bg-white/10 text-paper":"text-steel"}`}>Observed</button><button type="button" onClick={()=>setMode("retrofit")} className={`px-3 py-2 ${mode==="retrofit"?"bg-teal/10 text-teal":"text-steel"}`}>Counterfactual</button></div></div>
    <div className="relative mt-6 grid min-h-[250px] place-items-center overflow-hidden border border-steel/10 bg-black/20">
      <motion.div className="absolute h-44 w-64 border border-teal/30" animate={mode==="current"?{rotateX:[48,52,48],rotateZ:[-5,0,-5],scale:[.94,1,.94]}:{rotateX:[48,52,48],rotateZ:[-5,0,-5],scale:[1,1.05,1]}} transition={{duration:4,repeat:Infinity,ease:"easeInOut"}}>
        <motion.div className="absolute inset-4 border border-teal/20" animate={mode==="retrofit"?{x:[0,6,0],y:[0,-3,0]}:{x:0,y:0}} transition={{duration:2,repeat:Infinity}}/>
        <motion.div className={`absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border ${mode==="retrofit"?"border-amber-200/60":"border-teal/50"}`} animate={mode==="retrofit"?{scale:[1,1.18,1],rotate:360}:{rotate:360}} transition={{duration:mode==="retrofit"?2.8:6,repeat:Infinity,ease:"linear"}}/>
        {mode==="retrofit"&&<motion.div className="absolute -right-8 top-8 h-12 w-12 border border-amber-200/50" initial={{scale:0,opacity:0}} animate={{scale:1,opacity:1}} transition={{duration:.5}}/>}
      </motion.div>
      <div className="absolute bottom-4 left-4 right-4 grid grid-cols-8 gap-1">{bars.map(i=><motion.div key={i} className="h-1 bg-teal/30" animate={{scaleY:mode==="retrofit"?[(i%3+1)/3,1,(i%3+1)/3]:.55}} transition={{duration:1.2+.1*i,repeat:Infinity}}/>)}</div>
      <div className="absolute left-4 top-4 font-mono text-[8px] uppercase text-steel">{mode==="current"?"Observed state":"Retrofit counterfactual"}</div>
      <div className="absolute right-4 top-4 font-mono text-[8px] uppercase text-steel">{verified?"metric geometry":"relative geometry"}</div>
    </div>
    <div className="relative mt-4 grid gap-2 sm:grid-cols-3"><Metric label="Scan coverage" value={`${coverage}%`} note="captured evidence"/><Metric label="Geometry gate" value={verified?"VERIFIED":"UNVERIFIED"} note={verified?"metric scale available":"no guessed dimensions"}/><Metric label="Twin state" value={twin?"READY":"PENDING"} note={twin?.assetClass||"awaiting reconstruction"}/></div>
  </section>;
}

function Metric({label,value,note}:{label:string;value:string;note:string}){return <div className="border border-steel/10 bg-white/[.015] p-3"><p className="font-mono text-[7px] uppercase tracking-[.15em] text-steel">{label}</p><p className="mt-1 text-lg text-paper">{value}</p><p className="text-[8px] text-steel">{note}</p></div>}
