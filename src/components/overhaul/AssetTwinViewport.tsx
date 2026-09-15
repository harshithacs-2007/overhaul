"use client";

import { useMemo, useState } from "react";
import { buildAssetObj, buildDxfFootprint, buildInteropManifest, type InteropAsset } from "@/lib/engineering/assetInteroperability";

type Props = {
  scope: "building" | "facility" | "equipment";
  title: string;
  assetClass: string;
  evidenceIds: string[];
  values: Record<string, number | string | null | undefined>;
};

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function initialDimension(values: Props["values"], primary: string, fallback: string) {
  const value = Number(values[primary] ?? values[fallback]);
  return Number.isFinite(value) && value > 0 ? String(value) : "";
}

export default function AssetTwinViewport({ scope, title, assetClass, evidenceIds, values }: Props) {
  const [selected, setSelected] = useState<"asset" | "hvac" | "service">("asset");
  const [manual, setManual] = useState({
    width: initialDimension(values, "geometry_width_m", "width_m"),
    depth: initialDimension(values, "geometry_depth_m", "depth_m"),
    height: initialDimension(values, "geometry_height_m", "height_m"),
  });
  const [saved, setSaved] = useState(false);

  const parsedWidth = Number(values.geometry_width_m ?? values.width_m);
  const parsedDepth = Number(values.geometry_depth_m ?? values.depth_m);
  const parsedHeight = Number(values.geometry_height_m ?? values.height_m);
  const evidenceGeometryEstablished = [parsedWidth, parsedDepth, parsedHeight].every((x) => Number.isFinite(x) && x > 0);
  const manualWidth = Number(manual.width);
  const manualDepth = Number(manual.depth);
  const manualHeight = Number(manual.height);
  const manualGeometryEstablished = [manualWidth, manualDepth, manualHeight].every((x) => Number.isFinite(x) && x > 0);
  const dimensionsEstablished = evidenceGeometryEstablished || manualGeometryEstablished;
  const width = evidenceGeometryEstablished ? parsedWidth : manualWidth;
  const depth = evidenceGeometryEstablished ? parsedDepth : manualDepth;
  const height = evidenceGeometryEstablished ? parsedHeight : manualHeight;

  const asset: InteropAsset = useMemo(() => ({
    id: "asset-core",
    name: title,
    scope,
    className: assetClass,
    widthM: width,
    depthM: depth,
    heightM: height,
    capacityKW: Number.isFinite(Number(values.capacity_kw)) ? Number(values.capacity_kw) : null,
    powerKW: Number.isFinite(Number(values.power_kw)) ? Number(values.power_kw) : null,
    evidenceIds,
  }), [assetClass, depth, evidenceIds, height, scope, title, values, width]);
  const manifest = useMemo(() => buildInteropManifest(asset, values), [asset, values]);
  const objects = scope === "equipment"
    ? [["asset", assetClass, "Primary machine envelope"], ["hvac", "PROCESS / DRIVE", "Functional operating package"], ["service", "SERVICE CLEARANCE", "Maintenance envelope"]] as const
    : [["asset", scope === "facility" ? "FACILITY MASS" : "BUILDING MASS", "Parametric gross geometry"], ["hvac", "HVAC ZONE", "Mechanical-system placeholder linked to model"], ["service", "PLANT / SERVICE", "Access and equipment planning zone"]] as const;

  function saveManualGeometry() {
    if (!manualGeometryEstablished || evidenceGeometryEstablished) return;
    try {
      const existing = JSON.parse(sessionStorage.getItem("overhaul:supplemental-values") || "{}");
      const next = { ...existing, geometry_width_m: manualWidth, geometry_depth_m: manualDepth, geometry_height_m: manualHeight };
      sessionStorage.setItem("overhaul:supplemental-values", JSON.stringify(next));
      window.dispatchEvent(new CustomEvent("overhaul:supplemental-change"));
      setSaved(true);
    } catch {
      setSaved(false);
    }
  }

  return (
    <section className="border border-steel/15 bg-[#070b0b]">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-steel/10 px-5 py-4">
        <div>
          <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-teal">Semantic digital twin · geometry bridge</p>
          <h2 className="mt-1 font-display text-3xl">See the asset as a model.</h2>
          <p className="mt-1 max-w-2xl text-[10px] leading-5 text-steel">Metric geometry is locked to evidence or user-supplied dimensions. No photograph is silently converted into measurements.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button disabled={!dimensionsEstablished} type="button" onClick={() => downloadText(`${title.replace(/\W+/g, "-")}.obj`, buildAssetObj(asset), "text/plain;charset=utf-8")} className={`border px-3 py-2 font-mono text-[8px] uppercase ${!dimensionsEstablished ? "cursor-not-allowed border-steel/10 text-steel/50" : "border-teal/35 text-teal hover:bg-teal/5"}`}>Export OBJ · Blender</button>
          <button disabled={!dimensionsEstablished} type="button" onClick={() => downloadText(`${title.replace(/\W+/g, "-")}.dxf`, buildDxfFootprint(asset), "application/dxf")} className={`border px-3 py-2 font-mono text-[8px] uppercase ${!dimensionsEstablished ? "cursor-not-allowed border-steel/10 text-steel/50" : "border-steel/25 text-paper hover:border-teal"}`}>Export DXF · CAD</button>
          <button type="button" onClick={() => downloadText(`${title.replace(/\W+/g, "-")}.overhaul.json`, JSON.stringify(manifest, null, 2), "application/json")} className="border border-steel/25 px-3 py-2 font-mono text-[8px] uppercase text-paper hover:border-teal">Export twin manifest</button>
        </div>
      </div>

      <div className="grid gap-0 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="min-h-[420px] overflow-hidden border-b border-steel/10 xl:border-b-0 xl:border-r">
          <div className="relative h-full min-h-[420px] bg-[#050808]">
            <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "linear-gradient(rgba(138,155,168,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(138,155,168,.12) 1px,transparent 1px)", backgroundSize: "34px 34px" }} />
            <div className={`absolute left-1/2 top-[54%] h-[250px] w-[360px] -translate-x-1/2 -translate-y-1/2 [transform:skewY(-7deg)_rotateX(54deg)] border ${dimensionsEstablished ? "border-teal/50 bg-teal/[0.06] shadow-[0_0_60px_rgba(70,220,200,0.06)]" : "border-steel/30 bg-steel/[0.03]"}`}>
              <div className="absolute inset-5 border border-teal/25" />
              {scope !== "equipment" && <div className="absolute left-[43%] top-[22%] h-[95px] w-[95px] border border-amber-200/25 bg-amber-200/[0.03]" />}
              {scope === "equipment" && <><div className="absolute left-[34%] top-[30%] h-[65px] w-[110px] border border-amber-200/25 bg-amber-200/[0.04]" /><div className="absolute left-[49%] top-[49%] h-[18px] w-[80px] border border-teal/30" /></>}
              {!dimensionsEstablished && <div className="absolute inset-0 grid place-items-center bg-black/35 text-center"><div><p className="font-mono text-[8px] uppercase tracking-[0.14em] text-amber-200">Geometry unresolved</p><p className="mt-2 px-8 text-[10px] text-steel">Supply width × depth × height below to unlock metric CAD/Blender export.</p></div></div>}
            </div>
            <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center justify-between gap-2 font-mono text-[8px] uppercase tracking-[0.12em] text-steel">
              <span>Coordinate system · right-handed / Z-up</span>
              <span>{dimensionsEstablished ? `${width.toFixed(2)} × ${depth.toFixed(2)} × ${height.toFixed(2)} m` : "dimensions unresolved"}</span>
            </div>
          </div>
        </div>

        <div className="p-5">
          <div className="grid gap-2">
            {objects.map(([id, label, note]) => <button type="button" key={id} onClick={() => setSelected(id)} className={`border p-3 text-left ${selected === id ? "border-teal/40 bg-teal/[0.05]" : "border-steel/15"}`}><div className="flex items-center justify-between gap-3"><span className="font-mono text-[8px] uppercase tracking-[0.12em] text-teal">{id}</span><span className="font-mono text-[8px] uppercase text-steel">linked</span></div><p className="mt-2 text-sm">{label}</p><p className="mt-1 text-[9px] leading-4 text-steel">{note}</p></button>)}
          </div>

          {!evidenceGeometryEstablished && (
            <div className="mt-4 border border-amber-200/20 bg-amber-200/[0.03] p-4">
              <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[8px] uppercase tracking-[0.12em] text-amber-200">Resolve geometry</p><p className="mt-1 text-[9px] leading-4 text-steel">Enter known dimensions. These become explicit supplemental inputs, not extracted facts.</p></div><span className="font-mono text-[7px] uppercase text-steel">m</span></div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Dimension label="Width" value={manual.width} onChange={(value) => { setManual((x) => ({ ...x, width: value })); setSaved(false); }} />
                <Dimension label="Depth" value={manual.depth} onChange={(value) => { setManual((x) => ({ ...x, depth: value })); setSaved(false); }} />
                <Dimension label="Height" value={manual.height} onChange={(value) => { setManual((x) => ({ ...x, height: value })); setSaved(false); }} />
              </div>
              <button disabled={!manualGeometryEstablished} type="button" onClick={saveManualGeometry} className="mt-3 border border-amber-200/30 px-3 py-2 font-mono text-[8px] uppercase text-amber-100 disabled:cursor-not-allowed disabled:opacity-40">{saved ? "Geometry saved" : "Use dimensions"}</button>
              <span className="ml-3 font-mono text-[7px] uppercase text-steel">Basis · user supplied</span>
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2"><Data label="Capacity" value={values.capacity_kw != null ? `${values.capacity_kw} kW` : "—"}/><Data label="Power" value={values.power_kw != null ? `${values.power_kw} kW` : "—"}/><Data label="Evidence links" value={String(evidenceIds.length)}/><Data label="Geometry basis" value={evidenceGeometryEstablished ? "Metric / evidenced" : manualGeometryEstablished ? "Metric / user supplied" : "Schematic only"}/></div>
          <div className="mt-4 border border-steel/15 p-4"><p className="font-mono text-[8px] uppercase text-steel">Interoperability contract</p><p className="mt-2 text-[10px] leading-5 text-steel">OBJ carries explicit geometry for Blender. DXF carries the footprint for CAD. The OVERHAUL manifest carries semantic identity, engineering parameters and evidence provenance so the model is not reduced to a dumb mesh.</p><p className="mt-3 font-mono text-[8px] uppercase text-teal">Targets · Blender · AutoCAD/DXF · BIM/IFC adapter</p></div>
        </div>
      </div>
    </section>
  );
}

function Dimension({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block"><span className="font-mono text-[7px] uppercase tracking-[0.1em] text-steel">{label}</span><input inputMode="decimal" type="number" min="0.01" step="0.01" value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full border border-steel/15 bg-black/20 px-2 py-2 font-mono text-[10px] text-paper outline-none focus:border-teal/40" placeholder="0.00" /></label>;
}

function Data({ label, value }: { label: string; value: string }) { return <div className="border border-steel/10 p-3"><p className="font-mono text-[7px] uppercase tracking-[0.1em] text-steel">{label}</p><p className="mt-1 text-sm">{value}</p></div>; }
