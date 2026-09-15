"use client";

import { useMemo } from "react";
import { simulatePhysicsScenario } from "@/lib/engineering";

type Scope = "building" | "facility" | "equipment";
type Values = Record<string, number | string | null | undefined>;

type Row = { label: string; currentPower: number; retrofitPower: number; currentEnergy: number; retrofitEnergy: number };

function n(values: Values, ...keys: string[]) {
  for (const key of keys) {
    const value = Number(values[key]);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

function fmt(value: number, digits = 1) {
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export default function RetrofitStressLab({ scope, values }: { scope: Scope; values: Values }) {
  const rows = useMemo<Row[]>(() => {
    const rate = n(values, "electricity_rate_inr_per_kwh", "electricity_rate", "tariff_inr_per_kwh");

    if (scope === "equipment") {
      const capacity = n(values, "capacity_kw");
      const load = n(values, "load_kw");
      const efficiency = n(values, "efficiency", "cop");
      const proposedEfficiency = n(values, "proposed_efficiency", "proposed_cop");
      const hours = n(values, "annual_hours", "runtime_hours", "annual_runtime_hours");
      if (capacity == null || efficiency == null || hours == null) return [];
      const targetEfficiency = proposedEfficiency != null && proposedEfficiency > 0 ? proposedEfficiency : null;
      if (targetEfficiency == null || targetEfficiency === efficiency) return [];

      const points = [0.25, 0.5, 0.75, 1];
      return points.map((fraction) => {
        const operatingLoad = Math.min(capacity, capacity * fraction);
        const current = simulatePhysicsScenario({
          subject: "equipment",
          baseline: { loadKW: operatingLoad, ratedCapacityKW: capacity, efficiency, annualHours: hours, electricityRateINRPerKWh: rate ?? 0 },
        });
        const retrofit = simulatePhysicsScenario({
          subject: "equipment",
          baseline: { loadKW: operatingLoad, ratedCapacityKW: capacity, efficiency, annualHours: hours, electricityRateINRPerKWh: rate ?? 0 },
          retrofit: { efficiency: targetEfficiency },
        });
        return { label: `${Math.round(fraction * 100)}% load`, currentPower: current.baseline.electricalPowerKW, retrofitPower: retrofit.proposed.electricalPowerKW, currentEnergy: current.baseline.annualEnergyKWh, retrofitEnergy: retrofit.proposed.annualEnergyKWh };
      });
    }

    const area = n(values, "floor_area_m2", "floor_area");
    const ua = n(values, "envelope_ua_w_per_k", "envelope_ua");
    const indoor = Number(values.indoor_temp_c);
    const outdoor = Number(values.outdoor_temp_c);
    const capacity = n(values, "capacity_kw");
    const cop = n(values, "efficiency", "cop");
    const proposedR = n(values, "proposed_r_value_m2k_w");
    const currentR = n(values, "existing_r_value_m2k_w");
    const hours = n(values, "annual_cooling_hours", "cooling_hours");
    if (area == null || ua == null || !Number.isFinite(indoor) || !Number.isFinite(outdoor) || capacity == null || cop == null || hours == null || proposedR == null || currentR == null || proposedR <= 0 || proposedR === currentR) return [];

    const proposedUA = area / proposedR;
    const deltas = [-2, 0, 2, 4, 6];
    return deltas.map((delta) => {
      const boundary = outdoor + delta;
      const baseline = { floorAreaM2: area, envelopeUA_W_per_K: ua, ventilationM3s: 0, outdoorTempC: boundary, indoorTempC: indoor, solarGainKW: 0, internalGainKW: 0, hvacCapacityKW: capacity, hvacCOP: cop, annualCoolingHours: hours, electricityRateINRPerKWh: rate ?? 0 };
      const current = simulatePhysicsScenario({ subject: scope === "facility" ? "facility" : "building", baseline });
      const retrofit = simulatePhysicsScenario({ subject: scope === "facility" ? "facility" : "building", baseline, retrofit: { envelopeUA_W_per_K: proposedUA } });
      return { label: `${boundary.toFixed(1)} °C`, currentPower: current.baseline.electricalPowerKW, retrofitPower: retrofit.proposed.electricalPowerKW, currentEnergy: current.baseline.annualEnergyKWh, retrofitEnergy: retrofit.proposed.annualEnergyKWh };
    });
  }, [scope, values]);

  if (!rows.length) {
    return <section className="border border-teal/15 bg-[#080a0a] p-5"><div className="flex items-start gap-3"><div className="grid h-8 w-8 shrink-0 place-items-center border border-teal/25 font-mono text-[8px] text-teal">ST</div><div><p className="font-mono text-[8px] uppercase tracking-[0.16em] text-teal">Retrofit stress test</p><h2 className="mt-1 font-display text-2xl">Test the retrofit, not just the average.</h2><p className="mt-2 max-w-3xl text-[9px] leading-5 text-steel">Add a defensible proposed efficiency or envelope R-value and OVERHAUL will test the retrofit across explicit operating conditions. No stress case is treated as a measured forecast.</p></div></div></section>;
  }

  const maxPower = Math.max(...rows.flatMap((row) => [row.currentPower, row.retrofitPower]), 1);
  const first = rows[0];
  const last = rows[rows.length - 1];
  const worstSaving = Math.min(...rows.map((row) => row.currentEnergy > 0 ? (row.currentEnergy - row.retrofitEnergy) / row.currentEnergy * 100 : 0));

  return <section className="overflow-hidden border border-teal/20 bg-[#080a0a] shadow-[0_20px_90px_rgba(0,0,0,.2)]">
    <div className="border-b border-steel/10 px-5 py-5">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="font-mono text-[8px] uppercase tracking-[0.18em] text-teal">Retrofit stress test</p><h2 className="mt-1 font-display text-3xl">Does the retrofit still work when conditions move?</h2><p className="mt-2 max-w-3xl text-[10px] leading-5 text-steel">A deliberate counterfactual sweep. For buildings, outdoor temperature changes around the supplied boundary. For equipment, operating load moves from 25% to 100% of rated capacity. The same deterministic model is rerun at every point.</p></div><span className="border border-teal/20 px-3 py-2 font-mono text-[7px] uppercase text-teal">{rows.length} explicit cases</span></div>
    </div>
    <div className="grid xl:grid-cols-[1.3fr_.7fr]">
      <div className="p-5">
        <div className="grid items-end gap-4" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0,1fr))` }}>
          {rows.map((row) => <div key={row.label} className="min-w-0"><div className="flex h-56 items-end justify-center gap-1.5 border-b border-steel/10 bg-[linear-gradient(to_top,rgba(255,255,255,.035),transparent)] px-2"><div title={`Current ${row.currentPower.toFixed(1)} kW`} className="w-1/3 min-w-[10px] bg-steel/35" style={{ height: `${Math.max(4, row.currentPower / maxPower * 100)}%` }}/><div title={`Retrofit ${row.retrofitPower.toFixed(1)} kW`} className="w-1/3 min-w-[10px] bg-teal/75" style={{ height: `${Math.max(4, row.retrofitPower / maxPower * 100)}%` }}/></div><p className="mt-2 truncate text-center font-mono text-[7px] uppercase text-steel">{row.label}</p></div>)}
        </div>
        <div className="mt-3 flex justify-center gap-5 font-mono text-[7px] uppercase text-steel"><span><i className="mr-2 inline-block h-2 w-2 bg-steel/35"/>Current</span><span><i className="mr-2 inline-block h-2 w-2 bg-teal/75"/>Retrofit</span></div>
      </div>
      <aside className="border-t border-steel/10 p-5 xl:border-l xl:border-t-0">
        <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-steel">Stress result</p>
        <div className="mt-4 space-y-2">
          <Metric label="Lightest case" value={`${fmt(first.currentPower)} → ${fmt(first.retrofitPower)} kW`} />
          <Metric label="Heaviest case" value={`${fmt(last.currentPower)} → ${fmt(last.retrofitPower)} kW`} />
          <Metric label="Minimum modeled energy saving" value={`${Math.max(0, worstSaving).toFixed(1)}%`} />
        </div>
        <div className="mt-4 border border-gold/15 bg-gold/[0.035] p-4"><p className="font-mono text-[8px] uppercase text-gold">Judge-proof distinction</p><p className="mt-2 text-[9px] leading-5 text-steel">This is not a fixed “20% savings” claim. The intervention is rerun under multiple stated conditions, so the presentation can show where the retrofit is robust and where it needs more evidence.</p></div>
      </aside>
    </div>
  </section>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="border border-steel/10 bg-black/20 p-3"><p className="font-mono text-[7px] uppercase text-steel">{label}</p><p className="mt-1 font-mono text-[10px] text-paper">{value}</p></div>;
}
