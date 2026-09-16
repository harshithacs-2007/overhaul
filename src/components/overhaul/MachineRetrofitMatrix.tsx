"use client";

import { useEffect, useMemo, useState } from "react";
import { calculateMachineBaseline, calculateMachineRetrofit } from "@/lib/engineering/machineRetrofitCalculations";
import { machinePathways, normalizeMachineClass, requiredMachineInputs, type MachineClass, type MachineMetric } from "@/lib/engineering";

type Values = Record<string, number | string | null>;

const FIELD_ALIASES: Record<MachineMetric, string[]> = {
  efficiency: ["efficiency", "cop", "eer"],
  flow: ["flow_m3h", "flow_rate_m3h", "airflow_m3h", "flow_rate"],
  pressure: ["pressure_bar", "pressure", "head_m"],
  temperature: ["temperature_c", "outdoor_temp_c", "supply_temp_c", "setpoint_c"],
  runtime: ["annual_hours", "runtime_hours", "annual_runtime_hours"],
  capacity: ["capacity_kw", "rated_capacity_kw", "hvac_capacity_kw"],
};

function available(values: Values, metric: MachineMetric) { return FIELD_ALIASES[metric].some((key) => Number.isFinite(Number(values[key])) && Number(values[key]) >= 0); }
function pretty(machineClass: string) { return machineClass.replaceAll("_", " "); }
function readNumber(values: Values, ...keys: string[]) { for (const key of keys) { const value = Number(values[key]); if (Number.isFinite(value) && value > 0) return value; } return null; }
function saveJson(key: string, value: unknown) { try { sessionStorage.setItem(key, JSON.stringify(value)); window.dispatchEvent(new CustomEvent("overhaul:supplemental-change")); } catch {} }

export default function MachineRetrofitMatrix({ assetClass, values }: { assetClass?: string | null; values: Values }) {
  const [machineClass, setMachineClass] = useState<MachineClass>(() => normalizeMachineClass(assetClass));
  const pathways = machinePathways(machineClass);
  const [selectedPathway, setSelectedPathway] = useState(pathways[0]?.id || "");
  const [targetEfficiency, setTargetEfficiency] = useState("");
  const [targetCOP, setTargetCOP] = useState("");
  const [targetRuntime, setTargetRuntime] = useState("");

  useEffect(() => {
    const next = machinePathways(machineClass);
    setSelectedPathway((current) => next.some((pathway) => pathway.id === current) ? current : next[0]?.id || "");
  }, [machineClass]);

  useEffect(() => {
    setTargetEfficiency(values.proposed_efficiency == null ? "" : String(values.proposed_efficiency));
    setTargetCOP(values.proposed_cop == null ? "" : String(values.proposed_cop));
    setTargetRuntime(values.proposed_runtime_hours == null ? "" : String(values.proposed_runtime_hours));
  }, [values.proposed_efficiency, values.proposed_cop, values.proposed_runtime_hours]);

  const state = useMemo(() => Object.fromEntries(Object.keys(FIELD_ALIASES).map((metric) => [metric, available(values, metric as MachineMetric)])) as Partial<Record<MachineMetric, boolean>>, [values]);
  const selected = pathways.find((pathway) => pathway.id === selectedPathway) || pathways[0] || null;
  const currentLoad = readNumber(values, "load_kw", "observed_load_kw", "operating_load_kw", "capacity_kw", "rated_capacity_kw");
  const currentCapacity = readNumber(values, "capacity_kw", "rated_capacity_kw");
  const currentPower = readNumber(values, "power_kw", "observed_power_kw", "input_power_kw");
  const currentEfficiency = readNumber(values, "efficiency");
  const currentCOP = readNumber(values, "cop");
  const currentRuntime = readNumber(values, "annual_hours", "runtime_hours", "annual_runtime_hours");
  const rate = readNumber(values, "electricity_rate_inr_per_kwh", "electricity_rate", "tariff_inr_per_kwh");
  const target = {
    targetEfficiency: Number(targetEfficiency) > 0 ? Number(targetEfficiency) : null,
    targetCOP: Number(targetCOP) > 0 ? Number(targetCOP) : null,
    targetRuntimeHours: Number(targetRuntime) > 0 ? Number(targetRuntime) : null,
  };
  const baseline = useMemo(() => calculateMachineBaseline({ loadKW: currentLoad, ratedCapacityKW: currentCapacity, powerKW: currentPower, efficiency: currentEfficiency, cop: currentCOP, runtimeHours: currentRuntime, electricityRateINRPerKWh: rate }), [currentLoad, currentCapacity, currentPower, currentEfficiency, currentCOP, currentRuntime, rate]);
  const simulation = useMemo(() => calculateMachineRetrofit({ loadKW: currentLoad, ratedCapacityKW: currentCapacity, powerKW: currentPower, efficiency: currentEfficiency, cop: currentCOP, runtimeHours: currentRuntime, electricityRateINRPerKWh: rate, targetEfficiency: target.targetEfficiency, targetCOP: target.targetCOP, targetRuntimeHours: target.targetRuntimeHours, title: selected?.title || "Machine retrofit" }), [currentLoad, currentCapacity, currentPower, currentEfficiency, currentCOP, currentRuntime, rate, target.targetEfficiency, target.targetCOP, target.targetRuntimeHours, selected?.title]);

  const persistTarget = (key: "proposed_efficiency" | "proposed_cop" | "proposed_runtime_hours", value: string) => {
    const parsed = Number(value);
    const existing = (() => { try { return JSON.parse(sessionStorage.getItem("overhaul:supplemental-values") || "{}") as Values; } catch { return {}; } })();
    saveJson("overhaul:supplemental-values", { ...existing, [key]: Number.isFinite(parsed) && parsed > 0 ? parsed : undefined });
  };

  return <section className="overflow-hidden border border-teal/15 bg-[#070a09]">
    <div className="border-b border-steel/10 px-5 py-5"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="font-mono text-[8px] uppercase tracking-[0.18em] text-teal">Industrial retrofit matrix</p><h2 className="mt-1 font-display text-2xl">Machine-specific pathways that can actually run a counterfactual.</h2><p className="mt-2 max-w-3xl text-[10px] leading-5 text-steel">The pathway tells OVERHAUL which engineering relationship applies. The numeric lab below writes the explicit target into the shared assessment state; no generic percentage is assumed.</p></div><select aria-label="Machine class" value={machineClass} onChange={(event) => setMachineClass(event.target.value as MachineClass)} className="border border-steel/15 bg-black px-3 py-2 text-xs capitalize text-paper outline-none">{["air_conditioner","chiller","compressor","pump","fan","motor","boiler","cooling_tower","refrigeration","process_equipment"].map((item) => <option key={item} value={item}>{pretty(item)}</option>)}</select></div></div>
    <div className="grid gap-5 p-5 lg:grid-cols-[.65fr_1.35fr]">
      <div className="border border-steel/10 p-4"><p className="font-mono text-[8px] uppercase text-steel">Evidence state</p><div className="mt-3 space-y-2">{(Object.keys(FIELD_ALIASES) as MachineMetric[]).map((metric) => <div key={metric} className="flex items-center justify-between border-b border-steel/10 py-2 text-[9px]"><span className="capitalize">{metric}</span><span className={state[metric] ? "text-teal" : "text-steel/60"}>{state[metric] ? "established" : "missing"}</span></div>)}</div><p className="mt-4 text-[8px] leading-4 text-steel">A green signal means a numeric field exists. It does not make an unsupported retrofit pathway valid.</p></div>
      <div className="space-y-4">
        <div className="grid gap-2">{pathways.map((pathway) => { const missing = requiredMachineInputs(pathway, state); const active = pathway.id === selectedPathway; return <button key={pathway.id} type="button" onClick={() => setSelectedPathway(pathway.id)} className={`border p-4 text-left ${active ? "border-teal/40 bg-teal/[.04]" : "border-steel/10"}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm text-paper">{pathway.title}</p><p className="mt-1 text-[9px] leading-4 text-steel">{pathway.mechanism}</p></div><span className={`font-mono text-[7px] uppercase ${missing.length ? "text-amber-200" : "text-teal"}`}>{missing.length ? "Needs evidence" : "Evidence-ready"}</span></div><div className="mt-3 flex flex-wrap gap-1">{pathway.expectedTargets.map((item) => <span key={item} className="border border-steel/10 px-2 py-1 font-mono text-[7px] text-steel">{item}</span>)}</div>{missing.length ? <p className="mt-3 text-[8px] text-steel">Missing: {missing.join(" · ")}</p> : <p className="mt-3 text-[8px] text-teal">Required machine variables are present; the counterfactual can use an explicit target.</p>}</button>; })}</div>
        {selected ? <div className="border border-amber-200/20 bg-amber-200/[.025] p-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="font-mono text-[8px] uppercase text-amber-200">Numeric retrofit lab</p><h3 className="mt-1 font-display text-2xl">{selected.title}</h3><p className="mt-1 text-[9px] leading-4 text-steel">Only fields entered here are changed in the what-if model.</p></div><div className="font-mono text-[8px] uppercase text-steel">{simulation ? "computed" : "blocked"}</div></div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">{selected.id.includes("efficiency") ? currentCOP != null ? <TargetField label="Target COP" value={targetCOP} set={(value) => { setTargetCOP(value); persistTarget("proposed_cop", value); }} placeholder={String((currentCOP || 1) + 0.2)} /> : <TargetField label="Target efficiency" value={targetEfficiency} set={(value) => { setTargetEfficiency(value); persistTarget("proposed_efficiency", value); }} placeholder="e.g. 0.90" /> : null}{(selected.id.includes("runtime") || selected.id.includes("controls") || selected.id.includes("sequencing")) ? <TargetField label="Target runtime (h/yr)" value={targetRuntime} set={(value) => { setTargetRuntime(value); persistTarget("proposed_runtime_hours", value); }} placeholder={currentRuntime ? String(Math.max(1, Math.round(currentRuntime * 0.9))) : "e.g. 1800"} /> : null}{!selected.id.includes("efficiency") && !selected.id.includes("runtime") && !selected.id.includes("controls") && !selected.id.includes("sequencing") ? <p className="md:col-span-3 border border-steel/10 p-3 text-[9px] leading-4 text-steel">This pathway needs a machine curve / operating-point model rather than a generic efficiency percentage. The pathway remains visible, but no unsupported savings calculation is substituted.</p> : null}</div>
          {simulation ? <div className="mt-4 grid gap-2 sm:grid-cols-4"><Result label="Baseline power" value={baseline.currentPowerKW != null ? `${baseline.currentPowerKW.toFixed(2)} kW` : baseline.calculatedPowerKW != null ? `${baseline.calculatedPowerKW.toFixed(2)} kW calc.` : "—"}/><Result label="Target power" value={simulation.powerKW != null ? `${simulation.powerKW.toFixed(2)} kW` : "—"}/><Result label="Energy change" value={simulation.energySavingKWh != null ? `${simulation.energySavingKWh.toFixed(1)} kWh/yr` : "—"}/><Result label="Cost change" value={simulation.costSavingINR != null ? `₹${Math.round(simulation.costSavingINR).toLocaleString("en-IN")}` : "Tariff needed"}/></div> : <div className="mt-4 border border-steel/10 p-4 text-[9px] text-steel">Enter an explicit target supported by the available baseline before a numeric result is shown.</div>}
        </div> : null}
      </div>
    </div>
  </section>;
}

function TargetField({ label, value, set, placeholder }: { label: string; value: string; set: (value: string) => void; placeholder: string }) { return <label className="block"><span className="font-mono text-[8px] uppercase text-steel">{label}</span><input value={value} onChange={(event) => set(event.target.value)} type="number" min="0" step="any" placeholder={placeholder} className="mt-2 w-full border border-steel/15 bg-black/20 px-3 py-3 text-[10px] text-paper outline-none focus:border-teal/40"/></label>; }
function Result({ label, value }: { label: string; value: string }) { return <div className="border border-teal/10 p-3"><p className="font-mono text-[7px] uppercase text-steel">{label}</p><p className="mt-1 font-mono text-[10px] text-paper">{value}</p></div>; }
