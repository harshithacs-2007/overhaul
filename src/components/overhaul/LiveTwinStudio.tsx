"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

type Scope = "building" | "facility" | "equipment";
type Values = Record<string, number | string | null | undefined>;

type ScanStore = {
  sectors?: Array<{ result?: { detections?: Array<{ label: string; confidence: number }>; engineering_clues?: string[] } }>;
  coveragePercent?: number;
  completed?: boolean;
};

function n(values: Values, ...keys: string[]) {
  for (const key of keys) {
    const value = Number(values[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function uniqueLabels(scan: ScanStore | null) {
  const counts = new Map<string, number>();
  for (const sector of scan?.sectors || []) {
    for (const detection of sector.result?.detections || []) {
      const label = detection.label.trim();
      if (label) counts.set(label, (counts.get(label) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
}

export default function LiveTwinStudio({ scope, title, values }: { scope: Scope; title: string; values: Values }) {
  const [mode, setMode] = useState<"observed" | "retrofit">("observed");
  const [scan, setScan] = useState<ScanStore | null>(null);

  useEffect(() => {
    const sync = () => {
      try { setScan(JSON.parse(sessionStorage.getItem("overhaul:room-scan") || "null")); } catch { setScan(null); }
    };
    sync();
    window.addEventListener("overhaul:evidence-change", sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener("overhaul:evidence-change", sync); window.removeEventListener("storage", sync); };
  }, []);

  const detected = useMemo(() => uniqueLabels(scan), [scan]);
  const width = n(values, "geometry_width_m", "width_m");
  const depth = n(values, "geometry_depth_m", "depth_m");
  const height = n(values, "geometry_height_m", "height_m");
  const efficiency = n(values, "efficiency", "cop");
  const proposedEfficiency = n(values, "proposed_efficiency", "proposed_cop");
  const proposedR = n(values, "proposed_r_value_m2k_w");
  const currentR = n(values, "existing_r_value_m2k_w");
  const hasGeometry = Boolean(width && depth && height);
  const hasRetrofit = Boolean((proposedEfficiency && efficiency && proposedEfficiency !== efficiency) || (proposedR && currentR && proposedR !== currentR));
  const hasPhysics = Boolean(values.capacity_kw || values.load_kw || values.power_kw || values.annual_hours || values.annual_cooling_hours);

  return (
    <section className="border border-teal/20 bg-[#060a0a] shadow-[0_24px_80px_rgba(0,0,0,.18)]">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-steel/10 px-5 py-5">
        <div>
          <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-teal">Live model workspace</p>
          <h2 className="mt-1 font-display text-3xl">Digital twin, in motion.</h2>
          <p className="mt-1 max-w-3xl text-[10px] leading-5 text-steel">The visual model is the same semantic asset used by the physics layer. Scan evidence changes the asset inventory; verified dimensions unlock metric geometry; modeled interventions change only modeled state.</p>
        </div>
        <div className="flex gap-1 border border-steel/15 bg-black/20 p-1">
          {(["observed", "retrofit"] as const).map((value) => <button key={value} type="button" onClick={() => setMode(value)} className={`px-3 py-2 font-mono text-[8px] uppercase tracking-[0.12em] ${mode === value ? "bg-teal text-navy" : "text-steel hover:text-paper"}`}>{value === "observed" ? "Observed state" : "Retrofit state"}</button>)}
        </div>
      </div>

      <div className="grid xl:grid-cols-[1.25fr_.75fr]">
        <div className="relative min-h-[470px] overflow-hidden border-b border-steel/10 bg-[#040707] xl:border-b-0 xl:border-r">
          <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "linear-gradient(rgba(138,155,168,.10) 1px, transparent 1px),linear-gradient(90deg,rgba(138,155,168,.10) 1px,transparent 1px)", backgroundSize: "32px 32px" }} />
          <div className="absolute left-1/2 top-1/2 h-[285px] w-[500px] -translate-x-1/2 -translate-y-1/2 [perspective:1100px]">
            <motion.div animate={{ scale: mode === "retrofit" ? 1.015 : 1, rotateZ: mode === "retrofit" ? -19 : -16 }} transition={{ duration: .45 }} className="absolute left-[8%] top-[14%] h-[260px] w-[440px] border border-teal/55 bg-teal/[0.035] shadow-[0_0_90px_rgba(60,220,195,.06)] [transform:rotateX(58deg)_skewY(-4deg)]">
              <div className="absolute inset-[7%] border border-paper/10" />
              <motion.div animate={{ opacity: mode === "retrofit" ? .85 : .45, scale: mode === "retrofit" ? 1.05 : 1 }} transition={{ duration: .45 }} className="absolute left-[12%] top-[15%] h-[62px] w-[120px] border border-amber-100/35 bg-amber-100/[.04]" />
              <motion.div animate={{ x: mode === "retrofit" ? 18 : 0, opacity: mode === "retrofit" ? 1 : .65 }} transition={{ duration: .5 }} className="absolute right-[13%] top-[18%] h-[58px] w-[150px] border border-teal/65 bg-teal/[.07]" />
              <motion.div animate={{ scaleX: mode === "retrofit" ? 1.2 : 1 }} transition={{ duration: .45 }} className="absolute bottom-[18%] left-[29%] h-[42px] w-[190px] border border-clay/40 bg-clay/[.04]" />
              {[0, 1, 2].map((line) => <motion.div key={line} animate={{ x: [0, 210, 0], opacity: [0.04, mode === "retrofit" ? 0.9 : 0.5, 0.04] }} transition={{ duration: 3.2 + line * .3, repeat: Infinity, delay: line * .55 }} className="absolute left-[37%] top-[50%] h-px w-[32%] bg-teal/75" />)}
            </motion.div>
          </div>

          <div className="absolute left-5 top-5 border border-steel/15 bg-black/45 px-3 py-2 backdrop-blur"><p className="font-mono text-[7px] uppercase text-steel">Model state</p><p className={`mt-1 font-mono text-[10px] uppercase ${mode === "retrofit" ? "text-amber-200" : "text-teal"}`}>{mode === "retrofit" ? "Counterfactual intervention" : "Observed / current"}</p></div>
          <div className="absolute bottom-5 left-5 right-5 flex flex-wrap items-center justify-between gap-3 font-mono text-[8px] uppercase text-steel"><span>{hasGeometry ? `${width?.toFixed(2)} × ${depth?.toFixed(2)} × ${height?.toFixed(2)} m` : "Metric geometry unresolved"}</span><span>{detected.length ? `${detected.length} scanned asset classes` : "Awaiting scan evidence"}</span></div>
        </div>

        <aside className="p-5">
          <div className="grid grid-cols-2 gap-2">
            <StateMetric label="Geometry" value={hasGeometry ? "Resolved" : "Schematic"} good={hasGeometry} />
            <StateMetric label="Physics" value={hasPhysics ? "Live" : "Waiting"} good={hasPhysics} />
            <StateMetric label="Scan" value={scan?.completed ? "360°" : scan?.coveragePercent ? `${scan.coveragePercent}%` : "—"} good={Boolean(scan?.coveragePercent)} />
            <StateMetric label="Retrofit" value={hasRetrofit ? "Available" : "Not defined"} good={hasRetrofit} />
          </div>

          <div className="mt-4 border border-steel/10 p-4">
            <div className="flex items-center justify-between"><p className="font-mono text-[8px] uppercase tracking-[0.12em] text-steel">Scene inventory</p><span className="font-mono text-[7px] text-teal">LIVE</span></div>
            <div className="mt-3 space-y-2">{detected.length ? detected.map(([label, count]) => <div key={label} className="flex items-center justify-between border-b border-steel/10 pb-2 text-[9px]"><span>{label}</span><span className="font-mono text-teal">×{count}</span></div>) : <p className="text-[9px] leading-4 text-steel">Run a room, space or machine scan to populate the model inventory.</p>}</div>
          </div>

          <div className="mt-4 border border-steel/10 p-4">
            <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-steel">Model ↔ engineering state</p>
            <div className="mt-3 space-y-2 text-[9px] text-steel">
              <p><span className="text-paper">Capacity:</span> {values.capacity_kw != null ? `${values.capacity_kw} kW` : "not established"}</p>
              <p><span className="text-paper">Load:</span> {values.load_kw != null ? `${values.load_kw} kW` : "not established"}</p>
              <p><span className="text-paper">Power:</span> {values.power_kw != null ? `${values.power_kw} kW` : "not measured"}</p>
              <p><span className="text-paper">Efficiency:</span> {efficiency != null ? efficiency : "not established"}</p>
              {mode === "retrofit" && hasRetrofit ? <p className="pt-2 text-amber-200">Counterfactual state is modeled from the supplied intervention values. It is not a measured future state.</p> : null}
            </div>
          </div>

          <div className="mt-4 border border-teal/15 bg-teal/[0.035] p-4">
            <p className="font-mono text-[8px] uppercase text-teal">Interoperability</p>
            <p className="mt-2 text-[9px] leading-5 text-steel">The same asset identity can be exported as OBJ for Blender, DXF for CAD, and an evidence-linked OVERHAUL manifest for downstream BIM/IFC workflows.</p>
            <div className="mt-3 font-mono text-[7px] uppercase text-teal">{title} · semantic asset model</div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function StateMetric({ label, value, good }: { label: string; value: string; good: boolean }) {
  return <div className="border border-steel/10 p-3"><p className="font-mono text-[7px] uppercase text-steel">{label}</p><p className={`mt-1 text-sm ${good ? "text-teal" : "text-steel"}`}>{value}</p></div>;
}
