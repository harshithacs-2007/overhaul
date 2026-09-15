"use client";

import { useMemo, useState } from "react";
import { simulatePhysicsScenario } from "@/lib/engineering";

type Scope = "building" | "facility" | "equipment";
type Values = Record<string, number | string | null | undefined>;

type Pathway = {
  id: string;
  title: string;
  mechanism: string;
  gate: string;
  computable: boolean;
  result?: ReturnType<typeof simulatePhysicsScenario>;
};

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

export default function RetrofitPathfinder({ scope, values }: { scope: Scope; values: Values }) {
  const [selected, setSelected] = useState<string | null>(null);

  const pathways = useMemo<Pathway[]>(() => {
    const rate = n(values, "electricity_rate_inr_per_kwh", "electricity_rate", "tariff_inr_per_kwh");
    if (rate == null) return [];

    if (scope === "equipment") {
      const load = n(values, "load_kw");
      const capacity = n(values, "capacity_kw");
      const efficiency = n(values, "efficiency", "cop");
      const hours = n(values, "annual_hours", "runtime_hours", "annual_runtime_hours");
      if (load == null || capacity == null || efficiency == null || hours == null) return [];

      const baseline = { loadKW: load, ratedCapacityKW: capacity, efficiency, annualHours: hours, electricityRateINRPerKWh: rate };
      const candidates: Pathway[] = [];
      const proposedEfficiency = n(values, "proposed_efficiency", "proposed_cop");
      if (proposedEfficiency != null && proposedEfficiency > 0 && proposedEfficiency !== efficiency) {
        candidates.push({
          id: "efficiency",
          title: "Efficiency upgrade",
          mechanism: "Reduce input power for the same stated operating load.",
          gate: "Baseline load, rated capacity, efficiency, runtime and tariff established; proposed efficiency supplied.",
          computable: true,
          result: simulatePhysicsScenario({ subject: "equipment", baseline, retrofit: { efficiency: proposedEfficiency } }),
        });
      }
      const baseHours = n(values, "baseline_runtime_hours");
      const proposedHours = n(values, "proposed_runtime_hours");
      if (baseHours != null && proposedHours != null && baseHours !== proposedHours) {
        candidates.push({
          id: "runtime",
          title: "Runtime / controls optimisation",
          mechanism: "Change annual runtime while holding the supplied load and efficiency constant.",
          gate: "Baseline and proposed runtime are explicitly supplied.",
          computable: true,
          result: simulatePhysicsScenario({ subject: "equipment", baseline: { ...baseline, annualHours: baseHours }, retrofit: { annualHours: proposedHours } }),
        });
      }
      candidates.push({
        id: "condition",
        title: "Condition-led maintenance before replacement",
        mechanism: "Resolve abnormal performance evidence before committing to replacement CAPEX.",
        gate: "Needs measured/reference evidence such as power, flow, pressure or temperature residuals.",
        computable: false,
      });
      return candidates;
    }

    const floorArea = n(values, "floor_area_m2", "floor_area");
    const ua = n(values, "envelope_ua_w_per_k", "envelope_ua");
    const outdoor = Number(values.outdoor_temp_c);
    const indoor = Number(values.indoor_temp_c);
    const capacity = n(values, "capacity_kw");
    const cop = n(values, "efficiency", "cop");
    const hours = n(values, "annual_cooling_hours", "cooling_hours");
    if (floorArea == null || ua == null || !Number.isFinite(outdoor) || !Number.isFinite(indoor) || capacity == null || cop == null || hours == null) return [];

    const baseline = { floorAreaM2: floorArea, envelopeUA_W_per_K: ua, ventilationM3s: 0, outdoorTempC: outdoor, indoorTempC: indoor, solarGainKW: 0, internalGainKW: 0, hvacCapacityKW: capacity, hvacCOP: cop, annualCoolingHours: hours, electricityRateINRPerKWh: rate };
    const candidates: Pathway[] = [];
    const proposedR = n(values, "proposed_r_value_m2k_w");
    const currentR = n(values, "existing_r_value_m2k_w");
    if (proposedR != null && proposedR > 0 && proposedR !== currentR) {
      const proposedUA = floorArea / proposedR;
      candidates.push({
        id: "envelope",
        title: "Envelope retrofit",
        mechanism: "Reduce envelope heat transfer, then propagate the new load through HVAC power and annual energy.",
        gate: "Floor area, envelope UA, indoor/outdoor boundary, HVAC capacity/COP, cooling hours and proposed R-value established.",
        computable: true,
        result: simulatePhysicsScenario({ subject: scope === "facility" ? "facility" : "building", baseline, retrofit: { envelopeUA_W_per_K: proposedUA } }),
      });
    }
    const proposedEfficiency = n(values, "proposed_efficiency", "proposed_cop");
    if (proposedEfficiency != null && proposedEfficiency > 0 && proposedEfficiency !== cop) {
      candidates.push({
        id: "hvac-efficiency",
        title: "HVAC efficiency upgrade",
        mechanism: "Hold the modeled thermal load constant and propagate a new COP/efficiency through electrical power and annual energy.",
        gate: "Baseline thermal boundary and HVAC performance are established; proposed efficiency supplied.",
        computable: true,
        result: simulatePhysicsScenario({ subject: scope === "facility" ? "facility" : "building", baseline, retrofit: { hvacCOP: proposedEfficiency } }),
      });
    }
    candidates.push({
      id: "controls",
      title: "Controls / sequencing retrofit",
      mechanism: "Use operating schedules, setpoints and part-load behavior to reduce unnecessary operation.",
      gate: "Needs actual operating hours, setpoints or BMS trend evidence before quantification.",
      computable: false,
    });
    candidates.push({
      id: "capacity",
      title: "Capacity / plant-right-sizing study",
      mechanism: "Recalculate peak load and capacity margin before resizing or replacing equipment.",
      gate: "Peak/design boundary and credible load inputs are required; resizing is not treated as automatic energy saving.",
      computable: false,
    });
    return candidates;
  }, [scope, values]);

  const selectedPathway = pathways.find((x) => x.id === selected) || pathways.find((x) => x.computable) || pathways[0] || null;

  return (
    <section className="overflow-hidden border border-amber-200/20 bg-[#080909] shadow-[0_22px_90px_rgba(0,0,0,.22)]">
      <div className="border-b border-steel/10 px-5 py-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-amber-200">Retrofit decision lab</p>
            <h2 className="mt-1 font-display text-3xl">Change the intervention. See the consequence.</h2>
            <p className="mt-2 max-w-3xl text-[10px] leading-5 text-steel">Retrofit pathways appear only when the evidence supports them. Quantified pathways run through the deterministic engineering model; unquantified pathways stay explicitly blocked.</p>
          </div>
          <div className="border border-steel/15 px-3 py-2 font-mono text-[8px] uppercase text-steel">{pathways.filter((x) => x.computable).length} quantified · {pathways.filter((x) => !x.computable).length} evidence-gated</div>
        </div>
      </div>

      {pathways.length === 0 ? (
        <div className="grid min-h-[180px] place-items-center p-8 text-center"><div><p className="font-display text-xl text-paper">Build the baseline first.</p><p className="mt-2 max-w-md text-[9px] leading-5 text-steel">OVERHAUL will not manufacture a retrofit saving from missing load, efficiency, runtime or boundary-condition data. Add evidence and the retrofit lab will populate itself.</p></div></div>
      ) : (
        <div className="grid xl:grid-cols-[.85fr_1.15fr]">
          <div className="border-b border-steel/10 xl:border-b-0 xl:border-r">
            {pathways.map((pathway) => {
              const active = selectedPathway?.id === pathway.id;
              return <button key={pathway.id} type="button" onClick={() => setSelected(pathway.id)} className={`block w-full border-b border-steel/10 px-5 py-4 text-left transition ${active ? "bg-amber-200/[0.045]" : "hover:bg-white/[0.018]"}`}>
                <div className="flex items-start justify-between gap-3"><div><p className={`text-sm ${active ? "text-paper" : "text-steel"}`}>{pathway.title}</p><p className="mt-1 text-[9px] leading-4 text-steel">{pathway.mechanism}</p></div><span className={`mt-0.5 font-mono text-[7px] uppercase ${pathway.computable ? "text-teal" : "text-steel/60"}`}>{pathway.computable ? "Simulatable" : "Needs evidence"}</span></div>
              </button>;
            })}
          </div>

          <div className="p-5">
            {selectedPathway ? <>
              <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-mono text-[8px] uppercase text-steel">Selected pathway</p><h3 className="mt-1 font-display text-2xl">{selectedPathway.title}</h3></div><span className={`border px-3 py-1.5 font-mono text-[7px] uppercase ${selectedPathway.computable ? "border-teal/30 text-teal" : "border-steel/15 text-steel"}`}>{selectedPathway.computable ? "Engineering-computable" : "Evidence-gated"}</span></div>
              <p className="mt-3 text-[9px] leading-5 text-steel">{selectedPathway.gate}</p>
              {selectedPathway.result ? (
                <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <Metric label="Thermal / operating load" value={`${fmt(selectedPathway.result.proposed.thermalLoadKW)} kW`} />
                  <Metric label="Electrical power" value={`${fmt(selectedPathway.result.proposed.electricalPowerKW)} kW`} />
                  <Metric label="Annual energy" value={`${fmt(selectedPathway.result.proposed.annualEnergyKWh)} kWh`} />
                  <Metric label="Energy change" value={`${selectedPathway.result.delta.savingPercent >= 0 ? "−" : "+"}${Math.abs(selectedPathway.result.delta.savingPercent).toFixed(1)}%`} />
                </div>
              ) : null}
              {selectedPathway.result ? <div className="mt-4 border border-teal/15 bg-teal/[0.025] p-4"><p className="font-mono text-[8px] uppercase text-teal">Why this number exists</p><div className="mt-2 space-y-1 text-[9px] leading-5 text-steel">{selectedPathway.result.verdict.length ? selectedPathway.result.verdict.map((line) => <p key={line}>{line}</p>) : <p>Computed from supplied baseline and intervention parameters only.</p>}</div></div> : <div className="mt-5 border border-steel/15 bg-black/20 p-4"><p className="font-mono text-[8px] uppercase text-steel">Next useful evidence</p><p className="mt-2 text-[9px] leading-5 text-steel">This pathway is visible because it may be relevant, but OVERHAUL will not attach a saving value until the required engineering evidence is present.</p></div>}
            </> : null}
          </div>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="border border-steel/10 bg-black/25 p-3"><p className="font-mono text-[7px] uppercase text-steel">{label}</p><p className="mt-1 font-mono text-[11px] text-paper">{value}</p></div>;
}
