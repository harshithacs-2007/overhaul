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

export default function AssetTwinViewport({ scope, title, assetClass, evidenceIds, values }: Props) {
  const [selected, setSelected] = useState<"asset" | "hvac" | "service">("asset");
  const width = Number(values.geometry_width_m ?? values.width_m ?? (scope === "equipment" ? 2.4 : 18));
  const depth = Number(values.geometry_depth_m ?? values.depth_m ?? (scope === "equipment" ? 1.6 : 12));
  const height = Number(values.geometry_height_m ?? values.height_m ?? (scope === "equipment" ? 1.8 : 4));
  const safe = (x: number, fallback: number) => Number.isFinite(x) && x > 0 ? x : fallback;
  const asset: InteropAsset = useMemo(() => ({
    id: "asset-core",
    name: title,
    scope,
    className: assetClass,
    widthM: safe(width, 1),
    depthM: safe(depth, 1),
    heightM: safe(height, 1),
    capacityKW: Number.isFinite(Number(values.capacity_kw)) ? Number(values.capacity_kw) : null,
    powerKW: Number.isFinite(Number(values.power_kw)) ? Number(values.power_kw) : null,
    evidenceIds,
  }), [assetClass, depth, evidenceIds, height, scope, title, values, width]);
  const manifest = useMemo(() => buildInteropManifest(asset, values), [asset, values]);
  const objects = scope === "equipment"
    ? [
        ["asset", assetClass, "Primary machine envelope"],
        ["hvac", "PROCESS / DRIVE", "Functional operating package"],
        ["service", "SERVICE CLEARANCE", "Maintenance envelope"],
      ] as const
    : [
        ["asset", scope === "facility" ? "FACILITY MASS" : "BUILDING MASS", "Parametric gross geometry"],
        ["hvac", "HVAC ZONE", "Mechanical-system placeholder linked to model"],
        ["service", "PLANT / SERVICE", "Access and equipment planning zone"],
      ] as const;

  return (
    <section className="border border-steel/15 bg-[#070b0b]">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-steel/10 px-5 py-4">
        <div>
          <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-teal">Semantic digital twin · geometry bridge</p>
          <h2 className="mt-1 font-display text-3xl">See the asset as a model.</h2>
          <p className="mt-1 max-w-2xl text-[10px] leading-5 text-steel">This viewport is parametric. Dimensions come from evidence or explicitly supplied values; the interchange layer keeps geometry, engineering values and provenance together.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => downloadText(`${title.replace(/\W+/g, "-")}.obj`, buildAssetObj(asset), "text/plain;charset=utf-8")} className="border border-teal/35 px-3 py-2 font-mono text-[8px] uppercase text-teal hover:bg-teal/5">Export OBJ · Blender</button>
          <button type="button" onClick={() => downloadText(`${title.replace(/\W+/g, "-")}.dxf`, buildDxfFootprint(asset), "application/dxf") } className="border border-steel/25 px-3 py-2 font-mono text-[8px] uppercase text-paper hover:border-teal">Export DXF · CAD</button>
          <button type="button" onClick={() => downloadText(`${title.replace(/\W+/g, "-")}.overhaul.json`, JSON.stringify(manifest, null, 2), "application/json") } className="border border-steel/25 px-3 py-2 font-mono text-[8px] uppercase text-paper hover:border-teal">Export twin manifest</button>
        </div>
      </div>

      <div className="grid gap-0 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="min-h-[420px] overflow-hidden border-b border-steel/10 xl:border-b-0 xl:border-r">
          <div className="relative h-full min-h-[420px] bg-[#050808]">
            <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "linear-gradient(rgba(138,155,168,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(138,155,168,.12) 1px,transparent 1px)", backgroundSize: "34px 34px" }} />
            <div className="absolute left-1/2 top-[54%] h-[250px] w-[360px] -translate-x-1/2 -translate-y-1/2 [transform:skewY(-7deg)_rotateX(54deg)] border border-teal/50 bg-teal/[0.06] shadow-[0_0_60px_rgba(70,220,200,0.06)]">
              <div className="absolute inset-5 border border-teal/25" />
              <div className="absolute bottom-[-22px] left-[-26px] h-8 w-[410px] border-x border-b border-steel/30 bg-black/20" />
              <div className="absolute right-[-34px] top-10 h-[180px] w-8 border border-steel/25 bg-black/20" />
              {scope !== "equipment" && <div className="absolute left-[43%] top-[22%] h-[95px] w-[95px] border border-amber-200/25 bg-amber-200/[0.03]" />}
              {scope === "equipment" && <>
                <div className="absolute left-[34%] top-[30%] h-[65px] w-[110px] border border-amber-200/25 bg-amber-200/[0.04]" />
                <div className="absolute left-[49%] top-[49%] h-[18px] w-[80px] border border-teal/30" />
              </>}
            </div>
            <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center justify-between gap-2 font-mono text-[8px] uppercase tracking-[0.12em] text-steel">
              <span>Coordinate system · right-handed / Z-up</span>
              <span>{safe(width, 1).toFixed(2)} × {safe(depth, 1).toFixed(2)} × {safe(height, 1).toFixed(2)} m</span>
            </div>
          </div>
        </div>

        <div className="p-5">
          <div className="grid gap-2">
            {objects.map(([id, label, note]) => (
              <button type="button" key={id} onClick={() => setSelected(id)} className={`border p-3 text-left ${selected === id ? "border-teal/40 bg-teal/[0.05]" : "border-steel/15"}`}>
                <div className="flex items-center justify-between gap-3"><span className="font-mono text-[8px] uppercase tracking-[0.12em] text-teal">{id}</span><span className="font-mono text-[8px] uppercase text-steel">linked</span></div>
                <p className="mt-2 text-sm">{label}</p>
                <p className="mt-1 text-[9px] leading-4 text-steel">{note}</p>
              </button>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Data label="Capacity" value={values.capacity_kw != null ? `${values.capacity_kw} kW` : "—"} />
            <Data label="Power" value={values.power_kw != null ? `${values.power_kw} kW` : "—"} />
            <Data label="Evidence links" value={String(evidenceIds.length)} />
            <Data label="Geometry basis" value="Parametric" />
          </div>
          <div className="mt-4 border border-steel/15 p-4">
            <p className="font-mono text-[8px] uppercase text-steel">Interoperability contract</p>
            <p className="mt-2 text-[10px] leading-5 text-steel">OBJ carries explicit geometry for Blender. DXF carries the footprint for CAD. The OVERHAUL manifest carries semantic identity, engineering parameters and evidence provenance so the model is not reduced to a dumb mesh.</p>
            <p className="mt-3 font-mono text-[8px] uppercase text-teal">Targets · Blender · AutoCAD/DXF · BIM/IFC adapter</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Data({ label, value }: { label: string; value: string }) { return <div className="border border-steel/10 p-3"><p className="font-mono text-[7px] uppercase tracking-[0.1em] text-steel">{label}</p><p className="mt-1 text-sm">{value}</p></div>; }
