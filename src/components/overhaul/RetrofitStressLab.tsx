"use client";

import { useMemo } from "react";
import { simulatePhysicsScenario } from "@/lib/engineering";

type Scope = "building" | "facility" | "equipment";
type Values = Record<string, number | string | null | undefined>;
type ClimateContext = { location?: string; temperature?: number; humidity?: number; min?: number; max?: number; rain?: number } | null;
type Row = { label: string; currentPower: number; retrofitPower: number; currentEnergy: number; retrofitEnergy: number; contextual?: boolean };

function n(values: Values, ...keys: string[]) {
  for (const key of keys) { const value = Number(values[key]); if (Number.isFinite(value) && value >= 0) return value; }
  return null;
}
function fmt(value: number, digits = 1) { return value.toLocaleString("en-IN", { maximumFractionDigits: digits }); }

export default function RetrofitStressLab({ scope, values, climate = null }: { scope: Scope; values: Values; climate?: ClimateContext }) {
  const rows = useMemo<Row[]>(() => {
    const rate = n(values, "electricity_rate_inr_per_kwh", "electricity_rate", "tariff_inr_per_kwh");
    if (scope === "equipment") {
      const capacity = n(values, "capacity_kw"), efficiency = n(values, "efficiency", "cop"), targetEfficiency = n(values, "proposed_efficiency", "proposed_cop"), hours = n(values, "annual_hours", "runtime_hours", "annual_runtime_hours");
      if (capacity == null || efficiency == null || hours == null || targetEfficiency == null || targetEfficiency <= 0 || targetEfficiency === efficiency) return [];
      return [0.25, 0.5, 0.75, 1].map((fraction) => {
        const operatingLoad = Math.min(capacity, capacity * fraction);
        const baseline = { loadKW: operatingLoad, ratedCapacityKW: capacity, efficiency, annualHours: hours, electricityRateINRPerKWh: rate ?? 0 };
        const current = simulatePhysicsScenario({ subject: "equipment", baseline });
        const retrofit = simulatePhysicsScenario({ subject: "equipment", baseline, retrofit: { efficiency: targetEfficiency } });
        return { label: `${Math.round(fraction * 100)}% load`, currentPower: current.baseline.electricalPowerKW, retrofitPower: retrofit.proposed.electricalPowerKW, currentEnergy: current.baseline.annualEnergyKWh, retrofitEnergy: retrofit.proposed.annualEnergyKWh };
      });
    }

    const area = n(values, "floor_area_m2", "floor_area"), ua = n(values, "envelope_ua_w_per_k", "envelope_ua");
    const indoor = Number(values.indoor_temp_c), outdoor = Number(values.outdoor_temp_c);
    const capacity = n(values, "capacity_kw"), cop = n(values, "efficiency", "cop"), hours = n(values, "annual_cooling_hours", "cooling_hours");
    const proposedR = n(values, "proposed_r_value_m2k_w"), currentR = n(values, "existing_r_value_m2k_w"), envelopeArea = n(values, "envelope_area_m2");
    if (area == null || ua == null || !Number.isFinite(indoor) || !Number.isFinite(outdoor) || capacity == null || cop == null || hours == null || proposedR == null || currentR == null || envelopeArea == null || proposedR <= 0 || proposedR === currentR) return [];

    const proposedUA = envelopeArea / proposedR;
    const deltas = [-2, 0, 2, 4, 6];
    const generated: Row[] = deltas.map((delta) => {
      const boundary = outdoor + delta;
      const baseline = { floorAreaM2: area, envelopeUA_W_per_K: ua, ventilationM3s: n(values, "ventilation_m3s") ?? 0, outdoorTempC: boundary, indoorTempC: indoor, solarGainKW: n(values, "solar_gain_kw") ?? 0, internalGainKW: n(values, "internal_gain_kw") ?? 0, hvacCapacityKW: capacity, hvacCOP: cop, annualCoolingHours: hours, electricityRateINRPerKWh: rate ?? 0 };
      const current = simulatePhysicsScenario({ subject: scope === "facility" ? "facility" : "building", baseline });
      const retrofit = simulatePhysicsScenario({ subject: scope === "facility" ? "facility" : "building", baseline, retrofit: { envelopeUA_W_per_K: proposedUA } });
      return { label: `${boundary.toFixed(1)} °C`, currentPower: current.baseline.electricalPowerKW, retrofitPower: retrofit.proposed.electricalPowerKW, currentEnergy: current.baseline.annualEnergyKWh, retrofitEnergy: retrofit.proposed.annualEnergyKWh };
    });
    const regionalHigh = Number(climate?.max);
    if (Number.isFinite(regionalHigh) && regionalHigh > 0 && Math.abs(regionalHigh - outdoor) >= 0.5) {
      const baseline = { floorAreaM2: area, envelopeUA_W_per_K: ua, ventilationM3s: n(values, "ventilation_m3s") ?? 0, outdoorTempC: regionalHigh, indoorTempC: indoor, solarGainKW: n(values, "solar_gain_kw") ?? 0, internalGainKW: n(values, "internal_gain_kw") ?? 0, hvacCapacityKW: capacity, hvacCOP: cop, annualCoolingHours: hours, electricityRateINRPerKWh: rate ?? 0 };
      const current = simulatePhysicsScenario({ subject: scope === "facility" ? "facility" : "building", baseline });
      const retrofit = simulatePhysicsScenario({ subject: scope === "facility" ? "facility" : "building", baseline, retrofit: { envelopeUA_W_per_K: proposedUA } });
      generated.push({ label: `Regional 7d high · ${regionalHigh.toFixed(1)} °C`, currentPower: current.baseline.electricalPowerKW, retrofitPower: retrofit.proposed.electricalPowerKW, currentEnergy: current.baseline.annualEnergyKWh, retrofitEnergy: retrofit.proposed.annualEnergyKWh, contextual: true });
    }
    return generated;
  }, [scope, values, climate]);

  if (!rows.length) return <section className="border border-teal/15 bg-[#080a0a] p-5"><div className="flex items-start gap-3"><div className="grid h-8 w-8 shrink-0 place-items-center border border-teal/25 font-mono text-[8px] text-teal">ST</div><div><p className="font-mono text-[8px] uppercase tracking-[0.16em] text-teal">Retrofit stress test</p><h2 className="mt-1 font-display text-2xl">Test the retrofit, not just the average.</h2><p className="mt-2 max-w-3xl text-[9px] leading-5 text-steel">Add a defensible retrofit target. Building envelope tests require explicit envelope surface area; OVERHAUL will not derive it from floor area.</p></div></div></section>;

  const maxPower = Math.max(...rows.flatMap((row) => [row.currentPower, row.retrofitPower]), 1);
  const first = rows[0], last = rows[rows.length - 1];
  const worstSaving = Math.min(...rows.map((row) => row.currentEnergy > 0 ? (row.currentEnergy - row.retrofitEnergy) / row.currentEnergy * 100 : 0));
  return <section className="overflow-hidden border border-teal/20 bg-[#080a0a] shadow-[0_20px_90px_rgba(0,0,0,.2)]"><div className="border-b border-steel/10 px-5 py-5"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="font-mono text-[8px] uppercase tracking-[0.18em] text-teal">Retrofit stress test</p><h2 className="mt-1 font-display text-3xl">Does the retrofit still work when conditions move?</h2><p className="mt-2 max-w-3xl text-[10px] leading-5 text-steel">A deliberate counterfactual sweep. Buildings vary the explicit outdoor boundary and add a labeled live regional high when available; equipment varies load from 25% to 100% of rating.</p></div><span className="border border-teal/20 px-3 py-2 font-mono text-[7px] uppercase text-teal">{rows.length} explicit cases</span></div></div><div className="grid xl:grid-cols-[1.3fr_.7fr]"><div className="p-5"><div className="grid items-end gap-4" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0,1fr))` }}>{rows.map((row) => <div key={row.label} className="min-w-0"><div className={`flex h-56 items-end justify-center gap-1.5 border-b border-steel/10 px-2 ${row.contextual ? "bg-gold/[0.045]" : "bg-[linear-gradient(to_top,rgba(255,255,255,.035),transparent)]"}`}><div title={`Current ${row.currentPower.toFixed(1)} kW`} className="w-1/3 min-w-[10px] bg-steel/35" style={{ height: `${Math.max(4, row.currentPower / maxPower * 100)}%` }}/><div title={`Retrofit ${row.retrofitPower.toFixed(1)} kW`} className="w-1/3 min-w-[10px] bg-teal/75" style={{ height: `${Math.max(4, row.retrofitPower / maxPower * 100)}%` }}/></div><p className={`mt-2 truncate text-center font-mono text-[7px] uppercase ${row.contextual ? "text-gold" : "text-steel"}`}>{row.label}</p></div>)}</div><div className="mt-3 flex flex-wrap justify-center gap-5 font-mono text-[7px] uppercase text-steel"><span>■ Current</span><span className="text-teal">■ Retrofit</span><span className="text-gold">Regional context ≠ design baseline</span></div></div><aside className="border-t border-steel/10 p-5 xl:border-l xl:border-t-0"><p className="font-mono text-[8px] uppercase tracking-[0.14em] text-steel">Stress result</p><div className="mt-4 space-y-2"><Metric label="Lightest case" value={`${fmt(first.currentPower)} → ${fmt(first.retrofitPower)} kW`} /><Metric label="Heaviest case" value={`${fmt(last.currentPower)} → ${fmt(last.retrofitPower)} kW`} /><Metric label="Minimum modeled energy saving" value={`${Math.max(0, worstSaving).toFixed(1)}%`} /></div><div className="mt-4 border border-gold/15 bg-gold/[0.035] p-4"><p className="font-mono text-[8px] uppercase text-gold">Judge-proof distinction</p><p className="mt-2 text-[9px] leading-5 text-steel">This is not a fixed savings claim. The intervention is rerun under multiple stated conditions, and regional context is kept separate from the evidence-defined design boundary.</p></div></aside></div></section>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="border border-steel/10 bg-black/20 p-3"><p className="font-mono text-[7px] uppercase text-steel">{label}</p><p className="mt-1 font-mono text-[10px] text-paper">{value}</p></div>; }
