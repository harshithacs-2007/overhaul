"use client";

import { useEffect, useMemo, useState } from "react";
import { simulatePhysicsScenario } from "@/lib/engineering";
import Twin3DCanvas from "./Twin3DCanvas";

type Scope = "building" | "facility" | "equipment";
type Values = Record<string, number | string | null | undefined>;
type ScanStore = { coveragePercent?: number; completed?: boolean; sectors?: Array<{ result?: { detections?: Array<{ label: string; confidence: number }> } }> };
type TwinImpact = {
  current: { load: number; power: number; energy: number; utilization: number };
  proposed: { load: number; power: number; energy: number; utilization: number };
  savingPercent: number;
  deltaPower: number;
  deltaLoad: number;
};

function n(values: Values, ...keys: string[]) {
  for (const key of keys) { const value = Number(values[key]); if (Number.isFinite(value) && value > 0) return value; }
  return null;
}
function uniqueLabels(scan: ScanStore | null) {
  const counts = new Map<string, number>();
  for (const sector of scan?.sectors || []) for (const detection of sector.result?.detections || []) { const label = detection.label.trim(); if (label) counts.set(label, (counts.get(label) || 0) + 1); }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
}
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

export default function LiveTwinStudio({ scope, title, values }: { scope: Scope; title: string; values: Values }) {
  const [mode, setMode] = useState<"observed" | "retrofit">("observed");
  const [scan, setScan] = useState<ScanStore | null>(null);
  useEffect(() => { const sync = () => { try { setScan(JSON.parse(sessionStorage.getItem("overhaul:room-scan") || "null")); } catch { setScan(null); } }; sync(); window.addEventListener("overhaul:evidence-change", sync); window.addEventListener("overhaul:supplemental-change", sync); window.addEventListener("storage", sync); return () => { window.removeEventListener("overhaul:evidence-change", sync); window.removeEventListener("overhaul:supplemental-change", sync); window.removeEventListener("storage", sync); }; }, []);

  const detected = useMemo(() => uniqueLabels(scan), [scan]);
  const width = n(values, "geometry_width_m", "width_m"), depth = n(values, "geometry_depth_m", "depth_m"), height = n(values, "geometry_height_m", "height_m");
  const efficiency = n(values, "cop", "hvac_cop", "efficiency"), proposedEfficiency = n(values, "proposed_efficiency", "proposed_cop"), proposedR = n(values, "proposed_r_value_m2k_w"), currentR = n(values, "existing_r_value_m2k_w");
  const proposedHours = n(values, "proposed_runtime_hours"), currentHours = n(values, "annual_hours", "runtime_hours", "annual_runtime_hours");
  const hasGeometry = Boolean(width && depth && height), hasRetrofit = Boolean((proposedEfficiency && efficiency && proposedEfficiency !== efficiency) || (proposedR && proposedR !== currentR) || (proposedHours && proposedHours !== currentHours));
  const hasPhysics = Boolean(values.capacity_kw || values.load_kw || values.power_kw || values.annual_hours || values.annual_cooling_hours);
  const impact = useMemo(() => buildImpact(scope, values), [scope, values]);
  const displayed = impact ? (mode === "retrofit" ? impact.proposed : impact.current) : null;
  const comparisonReady = Boolean(impact && hasRetrofit);

  return <section className="overflow-hidden border border-teal/20 bg-[#060a0a] shadow-[0_24px_100px_rgba(0,0,0,.22)]">
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-steel/10 px-5 py-5"><div><p className="font-mono text-[8px] uppercase tracking-[0.18em] text-teal">Live engineering workspace</p><h2 className="mt-1 font-display text-3xl">The causal twin.</h2><p className="mt-1 max-w-3xl text-[10px] leading-5 text-steel">Geometry stays evidence-bound while motion, utilization and counterfactual state changes are driven by the same deterministic physics used by OVERHAUL&apos;s decision layer.</p></div><div className="flex gap-1 border border-steel/15 bg-black/25 p-1">{["observed", "retrofit"].map((value) => <button key={value} type="button" onClick={() => setMode(value as "observed" | "retrofit")} className={`px-3 py-2 font-mono text-[8px] uppercase tracking-[0.12em] ${mode === value ? "bg-teal text-navy" : "text-steel hover:text-paper"}`}>{value === "observed" ? "Observed state" : "Counterfactual"}</button>)}</div></div>
    <div className="grid xl:grid-cols-[1.3fr_.7fr]"><div className="relative min-h-[560px] border-b border-steel/10 xl:border-b-0 xl:border-r"><Twin3DCanvas scope={scope} mode={mode} widthM={width} depthM={depth} heightM={height} capacityKW={n(values, "capacity_kw")} loadKW={displayed?.load ?? n(values, "load_kw")} powerKW={displayed?.power ?? n(values, "power_kw")} currentLoadKW={impact?.current.load ?? null} proposedLoadKW={impact?.proposed.load ?? null} currentPowerKW={impact?.current.power ?? null} proposedPowerKW={impact?.proposed.power ?? null} currentUtilization={impact?.current.utilization ?? null} proposedUtilization={impact?.proposed.utilization ?? null} savingPercent={impact?.savingPercent ?? null} title={title} /><div className="pointer-events-none absolute left-5 top-5 border border-steel/15 bg-black/55 px-3 py-2 backdrop-blur"><p className="font-mono text-[7px] uppercase text-steel">Twin state</p><p className={`mt-1 font-mono text-[10px] uppercase ${mode === "retrofit" ? "text-amber-200" : "text-teal"}`}>{mode === "retrofit" ? "Counterfactual / intervention" : "Observed / current"}</p></div><div className="pointer-events-none absolute right-5 top-5 border border-steel/15 bg-black/55 px-3 py-2 text-right backdrop-blur"><p className="font-mono text-[7px] uppercase text-steel">Physics link</p><p className="mt-1 font-mono text-[10px] uppercase text-paper">{impact ? "LIVE" : "WAITING"}</p></div><div className="pointer-events-none absolute bottom-5 left-5 right-5 flex flex-wrap items-end justify-between gap-3"><div className="border border-steel/15 bg-black/65 px-3 py-2 font-mono text-[8px] uppercase text-steel backdrop-blur">{hasGeometry ? `${width?.toFixed(2)} × ${depth?.toFixed(2)} × ${height?.toFixed(2)} m` : "Metric geometry unresolved · schematic only"}</div>{impact ? <div className="border border-amber-200/20 bg-black/70 px-3 py-2 text-right backdrop-blur"><p className="font-mono text-[7px] uppercase text-steel">Annual energy delta</p><p className={`font-mono text-sm ${impact.savingPercent >= 0 ? "text-amber-200" : "text-red-200"}`}>{impact.savingPercent >= 0 ? "−" : "+"}{Math.abs(impact.savingPercent).toFixed(1)}%</p></div> : null}</div></div>
    <aside className="p-5"><div className="grid grid-cols-2 gap-2"><State label="Geometry" value={hasGeometry ? "Metric" : "Schematic"} good={hasGeometry}/><State label="Physics" value={hasPhysics ? "Live" : "Waiting"} good={hasPhysics}/><State label="Scan" value={scan?.completed ? "360°" : scan?.coveragePercent ? `${scan.coveragePercent}%` : "—"} good={Boolean(scan?.coveragePercent)}/><State label="Counterfactual" value={comparisonReady ? "Computed" : "Blocked"} good={comparisonReady}/></div>
      <Panel title="Causal telemetry" accent={Boolean(impact)}>{displayed ? <div className="grid grid-cols-2 gap-2"><Metric label="Load" value={`${fmt(displayed.load)} kW`}/><Metric label="Power" value={`${fmt(displayed.power)} kW`}/><Metric label="Utilization" value={`${fmt(displayed.utilization * 100)}%`}/><Metric label="Annual energy" value={`${fmt(displayed.energy)} kWh`}/></div> : <p className="text-[9px] leading-4 text-steel">Enough physical inputs are not yet available to run a deterministic state comparison. Electricity tariff is not required for this physical view.</p>}{impact ? <p className="mt-3 border-t border-steel/10 pt-3 text-[8px] leading-4 text-steel">Observed → counterfactual power: {fmt(impact.current.power)} → {fmt(impact.proposed.power)} kW. Thermal/load delta: {impact.deltaLoad >= 0 ? "+" : ""}{fmt(impact.deltaLoad)} kW.</p> : null}</Panel>
      <Panel title="Scene inventory">{detected.length ? detected.map(([label, count]) => <div key={label} className="flex items-center justify-between border-b border-steel/10 py-2 text-[9px]"><span>{label}</span><span className="font-mono text-teal">×{count}</span></div>) : <p className="text-[9px] leading-4 text-steel">Scan a room, appliance or machine to seed the evidence map. Objects are not assigned coordinates the scan never established.</p>}</Panel>
      <Panel title="Engineering state"><div className="space-y-2 text-[9px] text-steel"><p><span className="text-paper">Rated capacity:</span> {values.capacity_kw != null ? `${values.capacity_kw} kW` : "not established"}</p><p><span className="text-paper">Observed load:</span> {values.load_kw != null ? `${values.load_kw} kW` : "not established"}</p><p><span className="text-paper">Measured power:</span> {values.power_kw != null ? `${values.power_kw} kW` : "not measured"}</p><p><span className="text-paper">Baseline efficiency:</span> {efficiency != null ? efficiency : "not established"}</p>{proposedEfficiency != null ? <p><span className="text-paper">Proposed efficiency:</span> {proposedEfficiency}</p> : null}{proposedHours != null ? <p><span className="text-paper">Proposed runtime:</span> {proposedHours} h/yr</p> : null}{proposedR != null ? <p><span className="text-paper">Proposed R-value:</span> {proposedR} m²K/W</p> : null}</div></Panel>
      <Panel title="Why this is different" accent><p className="text-[9px] leading-5 text-steel">OVERHAUL treats the 3D scene as a visual front-end to an evidence graph. Scan findings, measured values, model assumptions and retrofit consequences remain separate. A change is allowed to move the twin only when the engineering layer can explain the change.</p></Panel><p className="mt-4 font-mono text-[7px] uppercase tracking-[0.12em] text-steel">Drag to orbit · wheel to zoom · current ↔ counterfactual</p></aside></div></section>;
}

function State({ label, value, good }: { label: string; value: string; good: boolean }) { return <div className="border border-steel/10 p-3"><p className="font-mono text-[7px] uppercase text-steel">{label}</p><p className={`mt-1 text-sm ${good ? "text-teal" : "text-steel"}`}>{value}</p></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="border border-steel/10 bg-black/20 p-3"><p className="font-mono text-[7px] uppercase text-steel">{label}</p><p className="mt-1 font-mono text-[10px] text-paper">{value}</p></div>; }
function Panel({ title, children, accent = false }: { title: string; children: React.ReactNode; accent?: boolean }) { return <div className={`mt-4 border p-4 ${accent ? "border-teal/15 bg-teal/[0.025]" : "border-steel/10"}`}><p className={`font-mono text-[8px] uppercase tracking-[0.12em] ${accent ? "text-teal" : "text-steel"}`}>{title}</p><div className="mt-3">{children}</div></div>; }
