"use client";

import { useMemo, useState } from "react";

type Values = Record<string, number | string | null>;
type Scan = { sectors?: Array<{ result?: { detections?: Array<{ label: string; confidence: number; condition?: string; evidence?: string }> } }> } | null;

function canonical(value: string) { return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }
function fmt(value: unknown) { const n = Number(value); return Number.isFinite(n) ? n.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—"; }

export default function TwinObjectInspector({ scan, values }: { scan: Scan; values: Values }) {
  const objects = useMemo(() => {
    const map = new Map<string, { label: string; count: number; confidence: number; condition: string; evidence: string }>();
    for (const sector of scan?.sectors || []) for (const item of sector.result?.detections || []) {
      const key = canonical(item.label);
      if (!key) continue;
      const old = map.get(key);
      map.set(key, { label: item.label, count: (old?.count || 0) + 1, confidence: Math.max(old?.confidence || 0, item.confidence || 0), condition: old?.condition || item.condition || "not stated", evidence: old?.evidence || item.evidence || "visual detection" });
    }
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 12);
  }, [scan]);
  const [selected, setSelected] = useState<string>(objects[0]?.label || "");
  const selectedObject = objects.find((object) => object.label === selected) || null;
  const mappedKey = canonical(selected || "");
  const mapped = Object.entries(values).filter(([key]) => key.includes(mappedKey) || (mappedKey.includes("pump") && /pump|flow|pressure/.test(key)) || (mappedKey.includes("fan") && /fan|airflow|pressure/.test(key)) || (mappedKey.includes("compressor") && /compressor|pressure|power/.test(key))).slice(0, 8);
  const choose = (label: string) => { setSelected(label); sessionStorage.setItem("overhaul:selected-twin-object", JSON.stringify({ label, selectedAt: new Date().toISOString() })); window.dispatchEvent(new CustomEvent("overhaul:twin-object-select")); };

  return <section className="overflow-hidden border border-cyan-200/15 bg-[#070a0a]"><div className="border-b border-steel/10 px-5 py-5"><p className="font-mono text-[8px] uppercase tracking-[0.18em] text-cyan-200">3D object inspector</p><h2 className="mt-1 font-display text-2xl">Connect the scene to the engineering record.</h2><p className="mt-2 max-w-3xl text-[10px] leading-5 text-steel">Scene objects originate from room-scan detections or explicit asset labels. Selecting one exposes the evidence and numeric fields that currently belong to that object; unresolved values remain unresolved.</p></div><div className="grid gap-5 p-5 lg:grid-cols-[.75fr_1.25fr]"><div className="space-y-2">{objects.length ? objects.map((object) => <button key={object.label} type="button" onClick={() => choose(object.label)} className={`w-full border px-3 py-3 text-left ${selected === object.label ? "border-cyan-200/35 bg-cyan-200/[0.04]" : "border-steel/10 hover:bg-white/[0.02]"}`}><div className="flex items-center justify-between gap-3"><span className="text-sm text-paper">{object.label}</span><span className="font-mono text-[7px] text-cyan-200">×{object.count}</span></div><p className="mt-1 font-mono text-[7px] uppercase text-steel">{Math.round(object.confidence * 100)}% visual confidence</p></button>) : <div className="border border-steel/10 p-4 text-[9px] leading-5 text-steel">No scan detections are available. The 3D twin stays as an evidence-bound schematic until an object is established.</div>}</div><div className="border border-steel/10 p-5">{selectedObject ? <><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-[7px] uppercase text-steel">Selected scene object</p><h3 className="mt-1 font-display text-2xl text-paper">{selectedObject.label}</h3></div><span className="border border-cyan-200/20 px-2 py-1 font-mono text-[7px] uppercase text-cyan-200">linked</span></div><div className="mt-5 grid gap-2 sm:grid-cols-2"><Metric label="Detection confidence" value={`${Math.round(selectedObject.confidence * 100)}%`}/><Metric label="Observed condition" value={selectedObject.condition}/></div><div className="mt-4"><p className="font-mono text-[8px] uppercase text-steel">Source evidence</p><p className="mt-2 text-[9px] leading-5 text-paper">{selectedObject.evidence}</p></div><div className="mt-5"><p className="font-mono text-[8px] uppercase text-steel">Linked engineering values</p>{mapped.length ? <div className="mt-2 grid gap-2 sm:grid-cols-2">{mapped.map(([key, value]) => <div key={key} className="border border-steel/10 p-3"><p className="font-mono text-[7px] text-steel">{key}</p><p className="mt-1 font-mono text-[10px] text-paper">{fmt(value)}</p></div>)}</div> : <p className="mt-2 text-[9px] leading-5 text-steel">No numeric engineering field is currently attributable to this detected object. The scan identification is retained without fabricating a machine state.</p>}</div></> : <p className="text-[9px] leading-5 text-steel">Select an object from the scene inventory to inspect its evidence linkage.</p>}</div></div></section>;
}
function Metric({ label, value }: { label: string; value: string }) { return <div className="border border-steel/10 p-3"><p className="font-mono text-[7px] uppercase text-steel">{label}</p><p className="mt-1 text-[10px] text-paper">{value}</p></div>; }
