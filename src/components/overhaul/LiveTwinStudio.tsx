"use client";

import { useEffect, useMemo, useState } from "react";
import { simulatePhysicsScenario } from "@/lib/engineering";
import type { TwinModel } from "@/lib/engineering/twinModel";
import Twin3DCanvas from "./Twin3DCanvas";

type Scope = "building" | "facility" | "equipment";
type Values = Record<string, number | string | null | undefined>;
type ScanStore = { coveragePercent?: number; completed?: boolean; sectors?: Array<{ result?: { detections?: Array<{ label: string; confidence: number }> } }> };
type TwinImpact = { current: { load: number; power: number; energy: number; utilization: number }; proposed: { load: number; power: number; energy: number; utilization: number }; savingPercent: number; deltaPower: number; deltaLoad: number };

function n(values: Values, ...keys: string[]) { for (const key of keys) { const value = Number(values[key]); if (Number.isFinite(value) && value > 0) return value; } return null; }
function fmt(value: number | null) { return value == null ? "—" : value.toLocaleString(undefined, { maximumFractionDigits: 1 }); }
function stateOf(result: { thermalLoadKW: number; electricalPowerKW: number; annualEnergyKWh: number; utilization: number }) { return { load: result.thermalLoadKW, power: result.electricalPowerKW, energy: result.annualEnergyKWh, utilization: result.utilization }; }

function buildImpact(scope: Scope, values: Values): TwinImpact | null {
  if (scope === "equipment") {
    const load = n(values, "load_kw"), capacity = n(values, "capacity_kw"), efficiency = n(values, "efficiency"), hours = n(values, "annual_hours", "runtime_hours", "annual_runtime_hours");
    const proposedEfficiency = n(values, "proposed_efficiency", "proposed_cop"), proposedHours = n(values, "proposed_runtime_hours");
    if (load == null || capacity == null || efficiency == null || hours == null) return null;
    const baseline = { loadKW: load, ratedCapacityKW: capacity, efficiency, annualHours: hours, electricityRateINRPerKWh: 0 };
    const retrofit: Partial<typeof baseline> = {};
    if (proposedEfficiency != null && proposedEfficiency !== efficiency) retrofit.efficiency = proposedEfficiency;
    if (proposedHours != null && proposedHours !== hours) retrofit.annualHours = proposedHours;
    if (!Object.keys(retrofit).length) return null;
    const result = simulatePhysicsScenario({ subject: "equipment", baseline, retrofit });
    return { current: stateOf(result.baseline), proposed: stateOf(result.proposed), savingPercent: result.delta.savingPercent, deltaPower: result.delta.electricalPowerKW, deltaLoad: result.delta.thermalLoadKW };
  }
  const floorArea = n(values, "floor_area_m2", "floor_area"), ua = n(values, "envelope_ua_w_per_k", "envelope_ua"), envelopeArea = n(values, "envelope_area_m2");
  const outdoor = Number(values.outdoor_temp_c), indoor = Number(values.indoor_temp_c), capacity = n(values, "capacity_kw"), cop = n(values, "cop", "hvac_cop", "efficiency"), hours = n(values, "annual_cooling_hours", "cooling_hours");
  const proposedR = n(values, "proposed_r_value_m2k_w"), currentR = n(values, "existing_r_value_m2k_w"), proposedEfficiency = n(values, "proposed_efficiency", "proposed_cop");
  if (floorArea == null || ua == null || !Number.isFinite(outdoor) || !Number.isFinite(indoor) || capacity == null || cop == null || hours == null) return null;
  const retrofit: Record<string, number> = {};
  if (proposedR != null && proposedR !== currentR && proposedR > 0 && envelopeArea != null) retrofit.envelopeUA_W_per_K = envelopeArea / proposedR;
  if (proposedEfficiency != null && proposedEfficiency !== cop) retrofit.hvacCOP = proposedEfficiency;
  if (!Object.keys(retrofit).length) return null;
  const baseline = { floorAreaM2: floorArea, envelopeUA_W_per_K: ua, ventilationM3s: n(values, "ventilation_m3s") ?? 0, outdoorTempC: outdoor, indoorTempC: indoor, solarGainKW: n(values, "solar_gain_kw") ?? 0, internalGainKW: n(values, "internal_gain_kw") ?? 0, hvacCapacityKW: capacity, hvacCOP: cop, annualCoolingHours: hours, electricityRateINRPerKWh: 0 };
  const result = simulatePhysicsScenario({ subject: scope === "facility" ? "facility" : "building", baseline, retrofit });
  return { current: stateOf(result.baseline), proposed: stateOf(result.proposed), savingPercent: result.delta.savingPercent, deltaPower: result.delta.electricalPowerKW, deltaLoad: result.delta.thermalLoadKW };
}

export default function LiveTwinStudio({ scope, title, values, twin }: { scope: Scope; title: string; values: Values; twin?: TwinModel | null }) {
  const [mode, setMode] = useState<"observed" | "retrofit">("observed");
  const [scan, setScan] = useState<ScanStore | null>(null);
  useEffect(() => { const sync = () => { try { setScan(JSON.parse(sessionStorage.getItem("overhaul:room-scan") || "null")); } catch { setScan(null); } }; sync(); window.addEventListener("overhaul:evidence-change", sync); window.addEventListener("overhaul:supplemental-change", sync); window.addEventListener("storage", sync); return () => { window.removeEventListener("overhaul:evidence-change", sync); window.removeEventListener("overhaul:supplemental-change", sync); window.removeEventListener("storage", sync); }; }, []);
  const impact = useMemo(() => buildImpact(scope, values), [scope, values]);
  const displayed = impact ? (mode === "retrofit" ? impact.proposed : impact.current) : null;
  const width = n(values, "geometry_width_m", "width_m") ?? twin?.overall.widthM ?? null;
  const depth = n(values, "geometry_depth_m", "depth_m") ?? twin?.overall.depthM ?? null;
  const height = n(values, "geometry_height_m", "height_m") ?? twin?.overall.heightM ?? null;
  const hasRetrofit = Boolean(impact && impact.proposed.power !== impact.current.power);
  const detectedCount = twin?.assets.length ?? 0;

  return <section className="overflow-hidden border border-teal/20 bg-[#060a0a] shadow-[0_28px_110px_rgba(0,0,0,.24)]">
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-steel/10 px-5 py-5"><div><p className="font-mono text-[8px] uppercase tracking-[.18em] text-teal">Digital twin · live viewport</p><h2 className="mt-1 font-display text-3xl">Reality → model → intervention.</h2><p className="mt-1 max-w-3xl text-[10px] leading-5 text-steel">The generated geometry is rendered here, while the same values drive the deterministic engineering layer underneath it. Observed and counterfactual states never share the same data path.</p></div><div className="flex border border-steel/15 bg-black/25 p-1">{([["observed", "Observed"], ["retrofit", "What-if"]] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setMode(value)} disabled={value === "retrofit" && !hasRetrofit} className={`px-3 py-2 font-mono text-[8px] uppercase ${mode === value ? "bg-teal text-navy" : "text-steel disabled:opacity-30"}`}>{label}</button>)}</div></div>
    <div className="grid xl:grid-cols-[1.32fr_.68fr]"><div className="relative min-h-[600px] border-b border-steel/10 xl:border-b-0 xl:border-r"><Twin3DCanvas scope={scope} mode={mode} model={twin ?? null} widthM={width} depthM={depth} heightM={height} capacityKW={n(values, "capacity_kw")} loadKW={displayed?.load ?? n(values, "load_kw")} powerKW={displayed?.power ?? n(values, "power_kw")} currentLoadKW={impact?.current.load ?? null} proposedLoadKW={impact?.proposed.load ?? null} currentPowerKW={impact?.current.power ?? null} proposedPowerKW={impact?.proposed.power ?? null} currentUtilization={impact?.current.utilization ?? null} proposedUtilization={impact?.proposed.utilization ?? null} savingPercent={impact?.savingPercent ?? null} title={title}/><div className="pointer-events-none absolute left-5 top-5 border border-steel/15 bg-black/60 px-3 py-2 backdrop-blur"><p className="font-mono text-[7px] uppercase text-steel">Scene source</p><p className="mt-1 font-mono text-[9px] uppercase text-teal">{twin ? `${twin.geometryBasis}` : "parametric"}</p></div><div className="pointer-events-none absolute right-5 top-5 border border-steel/15 bg-black/60 px-3 py-2 text-right backdrop-blur"><p className="font-mono text-[7px] uppercase text-steel">Assets in model</p><p className="mt-1 font-mono text-[9px] text-paper">{detectedCount}</p></div></div>
      <aside className="p-5"><div className="grid grid-cols-2 gap-2"><State label="Geometry" value={twin ? `${twin.overall.widthM.toFixed(1)} × ${twin.overall.depthM.toFixed(1)} m` : "Parametric"} good={Boolean(twin)}/><State label="Scan" value={scan?.completed ? "360°" : scan?.coveragePercent ? `${scan.coveragePercent}%` : "—"} good={Boolean(scan?.coveragePercent)}/><State label="Physics" value={displayed ? "Live" : "Waiting"} good={Boolean(displayed)}/><State label="What-if" value={hasRetrofit ? "Ready" : "Needs intervention"} good={hasRetrofit}/></div>
        <Panel title="Causal telemetry" accent={Boolean(impact)}>{displayed ? <div className="grid grid-cols-2 gap-2"><Metric label="Load" value={`${fmt(displayed.load)} kW`}/><Metric label="Power" value={`${fmt(displayed.power)} kW`}/><Metric label="Utilization" value={`${fmt(displayed.utilization * 100)}%`}/><Metric label="Annual energy" value={`${fmt(displayed.energy)} kWh`}/></div> : <p className="text-[9px] leading-5 text-steel">The twin can still render from geometry evidence, but numerical physics stays blocked until defensible operating inputs exist.</p>}{impact ? <p className="mt-3 border-t border-steel/10 pt-3 text-[8px] leading-4 text-steel">Current → what-if power: {fmt(impact.current.power)} → {fmt(impact.proposed.power)} kW · annual-energy delta {impact.savingPercent.toFixed(1)}%.</p> : null}</Panel>
        <Panel title="Generated scene"><div className="space-y-2 text-[9px] text-steel"><p><span className="text-paper">Rooms:</span> {twin?.rooms.length ?? 0}</p><p><span className="text-paper">Walls:</span> {twin?.walls.length ?? 0}</p><p><span className="text-paper">Openings:</span> {twin?.openings.length ?? 0}</p><p><span className="text-paper">Equipment:</span> {twin?.assets.length ?? 0}</p><p><span className="text-paper">Confidence:</span> {twin ? `${Math.round(twin.confidence * 100)}%` : "—"}</p></div></Panel>
        <Panel title="Why the model matters"><p className="text-[9px] leading-5 text-steel">A floor plan contributes topology and relative geometry; photos contribute visible assets and condition; engineering details supply operating anchors. Retrofit calculations are allowed to change only the parameters that the evidence and deterministic model can explain.</p></Panel>
      </aside></div>
  </section>;
}
function State({ label, value, good }: { label: string; value: string; good: boolean }) { return <div className="border border-steel/10 p-3"><p className="font-mono text-[7px] uppercase text-steel">{label}</p><p className={`mt-1 text-[10px] ${good ? "text-teal" : "text-steel"}`}>{value}</p></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="border border-steel/10 bg-black/20 p-3"><p className="font-mono text-[7px] uppercase text-steel">{label}</p><p className="mt-1 font-mono text-[10px] text-paper">{value}</p></div>; }
function Panel({ title, children, accent = false }: { title: string; children: React.ReactNode; accent?: boolean }) { return <div className={`mt-4 border p-4 ${accent ? "border-teal/15 bg-teal/[.025]" : "border-steel/10"}`}><p className={`font-mono text-[8px] uppercase ${accent ? "text-teal" : "text-steel"}`}>{title}</p><div className="mt-3">{children}</div></div>; }
