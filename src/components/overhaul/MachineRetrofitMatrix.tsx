"use client";

import { useMemo, useState } from "react";
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

export default function MachineRetrofitMatrix({ assetClass, values }: { assetClass?: string | null; values: Values }) {
  const [machineClass, setMachineClass] = useState<MachineClass>(normalizeMachineClass(assetClass));
  const pathways = machinePathways(machineClass);
  const state = useMemo(() => Object.fromEntries(Object.keys(FIELD_ALIASES).map((metric) => [metric, available(values, metric as MachineMetric)])) as Partial<Record<MachineMetric, boolean>>, [values]);

  return <section className="overflow-hidden border border-teal/15 bg-[#070a09]"><div className="border-b border-steel/10 px-5 py-5"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="font-mono text-[8px] uppercase tracking-[0.18em] text-teal">Industrial retrofit matrix</p><h2 className="mt-1 font-display text-2xl">Machine-specific pathways.</h2><p className="mt-2 max-w-3xl text-[10px] leading-5 text-steel">The retrofit engine changes with the machine class. OVERHAUL does not treat a pump, compressor, chiller and motor as the same generic “efficiency upgrade”.</p></div><select aria-label="Machine class" value={machineClass} onChange={(event) => setMachineClass(event.target.value as MachineClass)} className="border border-steel/15 bg-black px-3 py-2 text-xs capitalize text-paper outline-none">{["chiller","compressor","pump","fan","motor","boiler","cooling_tower","refrigeration","process_equipment"].map((item) => <option key={item} value={item}>{pretty(item)}</option>)}</select></div></div><div className="grid gap-5 p-5 lg:grid-cols-[.65fr_1.35fr]"><div className="border border-steel/10 p-4"><p className="font-mono text-[8px] uppercase text-steel">Evidence state</p><div className="mt-3 space-y-2">{(Object.keys(FIELD_ALIASES) as MachineMetric[]).map((metric) => <div key={metric} className="flex items-center justify-between border-b border-steel/10 py-2 text-[9px]"><span className="capitalize">{metric}</span><span className={state[metric] ? "text-teal" : "text-steel/60"}>{state[metric] ? "established" : "missing"}</span></div>)}</div><p className="mt-4 text-[8px] leading-4 text-steel">Green means the current assessment contains a numeric field that can support this machine dimension. It does not mean the measurement is appropriate for every retrofit pathway.</p></div><div className="grid gap-2">{pathways.map((pathway) => { const missing = requiredMachineInputs(pathway, state); const ready = missing.length === 0; return <div key={pathway.id} className={`border p-4 ${ready ? "border-teal/20 bg-teal/[0.025]" : "border-steel/10"}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm text-paper">{pathway.title}</p><p className="mt-1 text-[9px] leading-4 text-steel">{pathway.mechanism}</p></div><span className={`font-mono text-[7px] uppercase ${ready ? "text-teal" : "text-steel/60"}`}>{ready ? "Evidence-ready" : "Needs evidence"}</span></div><div className="mt-3 flex flex-wrap gap-1">{pathway.expectedTargets.map((target) => <span key={target} className="border border-steel/10 px-2 py-1 font-mono text-[7px] text-steel">{target}</span>)}</div>{missing.length ? <p className="mt-3 text-[8px] text-steel">Missing: {missing.join(" · ")}</p> : <p className="mt-3 text-[8px] text-teal">Required machine variables are present; explicit retrofit target/curve evidence can now drive simulation.</p>}</div>; })}</div></div></section>;
}
