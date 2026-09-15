"use client";

import { useEffect, useMemo, useState } from "react";
import Twin3DCanvas from "./Twin3DCanvas";

type Scope = "building" | "facility" | "equipment";
type Values = Record<string, number | string | null | undefined>;
type ScanStore = { coveragePercent?: number; completed?: boolean; sectors?: Array<{ result?: { detections?: Array<{ label: string; confidence: number }> } }> };

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
    <section className="overflow-hidden border border-teal/20 bg-[#060a0a] shadow-[0_24px_100px_rgba(0,0,0,.22)]">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-steel/10 px-5 py-5">
        <div>
          <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-teal">Live engineering workspace</p>
          <h2 className="mt-1 font-display text-3xl">Digital twin, in motion.</h2>
          <p className="mt-1 max-w-3xl text-[10px] leading-5 text-steel">Orbit the asset, compare states, and watch the representation react to the same values used by the deterministic engineering engine.</p>
        </div>
        <div className="flex gap-1 border border-steel/15 bg-black/25 p-1">
          {(["observed", "retrofit"] as const).map((value) => (
            <button key={value} type="button" onClick={() => setMode(value)} className={`px-3 py-2 font-mono text-[8px] uppercase tracking-[0.12em] ${mode === value ? "bg-teal text-navy" : "text-steel hover:text-paper"}`}>{value === "observed" ? "Observed state" : "Retrofit state"}</button>
          ))}
        </div>
      </div>

      <div className="grid xl:grid-cols-[1.3fr_.7fr]">
        <div className="relative min-h-[520px] border-b border-steel/10 xl:border-b-0 xl:border-r">
          <Twin3DCanvas scope={scope} mode={mode} widthM={width} depthM={depth} heightM={height} capacityKW={n(values, "capacity_kw")} loadKW={n(values, "load_kw")} powerKW={n(values, "power_kw")} title={title} />
          <div className="pointer-events-none absolute left-5 top-5 border border-steel/15 bg-black/55 px-3 py-2 backdrop-blur">
            <p className="font-mono text-[7px] uppercase text-steel">Scene mode</p>
            <p className={`mt-1 font-mono text-[10px] uppercase ${mode === "retrofit" ? "text-amber-200" : "text-teal"}`}>{mode === "retrofit" ? "Counterfactual intervention" : "Observed / current"}</p>
          </div>
          <div className="pointer-events-none absolute bottom-5 left-5 right-5 flex flex-wrap justify-between gap-3 font-mono text-[8px] uppercase text-steel">
            <span>{hasGeometry ? `${width?.toFixed(2)} × ${depth?.toFixed(2)} × ${height?.toFixed(2)} m` : "Metric geometry unresolved · schematic scale"}</span>
            <span>{detected.length ? `${detected.length} detected classes` : "Awaiting visual scan"}</span>
          </div>
        </div>

        <aside className="p-5">
          <div className="grid grid-cols-2 gap-2">
            <State label="Geometry" value={hasGeometry ? "Metric" : "Schematic"} good={hasGeometry} />
            <State label="Physics" value={hasPhysics ? "Live" : "Waiting"} good={hasPhysics} />
            <State label="Scan" value={scan?.completed ? "360°" : scan?.coveragePercent ? `${scan.coveragePercent}%` : "—"} good={Boolean(scan?.coveragePercent)} />
            <State label="Comparison" value={hasRetrofit ? "Ready" : "Pending"} good={hasRetrofit} />
          </div>

          <Panel title="Scene inventory">
            {detected.length ? detected.map(([label, count]) => <div key={label} className="flex items-center justify-between border-b border-steel/10 py-2 text-[9px]"><span>{label}</span><span className="font-mono text-teal">×{count}</span></div>) : <p className="text-[9px] leading-4 text-steel">Scan a room, appliance or machine to seed the scene inventory.</p>}
          </Panel>

          <Panel title="Model ↔ engineering">
            <div className="space-y-2 text-[9px] text-steel">
              <p><span className="text-paper">Rated capacity:</span> {values.capacity_kw != null ? `${values.capacity_kw} kW` : "not established"}</p>
              <p><span className="text-paper">Operating load:</span> {values.load_kw != null ? `${values.load_kw} kW` : "not established"}</p>
              <p><span className="text-paper">Measured power:</span> {values.power_kw != null ? `${values.power_kw} kW` : "not measured"}</p>
              <p><span className="text-paper">Efficiency:</span> {efficiency != null ? efficiency : "not established"}</p>
            </div>
          </Panel>

          <Panel title="Interoperability" accent>
            <p className="text-[9px] leading-5 text-steel">The same semantic asset model can be emitted as OBJ for Blender, DXF for CAD, and an evidence-linked manifest for BIM/IFC workflows. Export remains blocked when geometry is not actually resolved.</p>
          </Panel>

          <p className="mt-4 font-mono text-[7px] uppercase tracking-[0.12em] text-steel">Drag to orbit · wheel to zoom · observed ↔ counterfactual</p>
        </aside>
      </div>
    </section>
  );
}

function State({ label, value, good }: { label: string; value: string; good: boolean }) { return <div className="border border-steel/10 p-3"><p className="font-mono text-[7px] uppercase text-steel">{label}</p><p className={`mt-1 text-sm ${good ? "text-teal" : "text-steel"}`}>{value}</p></div>; }
function Panel({ title, children, accent = false }: { title: string; children: React.ReactNode; accent?: boolean }) { return <div className={`mt-4 border p-4 ${accent ? "border-teal/15 bg-teal/[0.025]" : "border-steel/10"}`}><p className={`font-mono text-[8px] uppercase tracking-[0.12em] ${accent ? "text-teal" : "text-steel"}`}>{title}</p><div className="mt-3">{children}</div></div>; }
