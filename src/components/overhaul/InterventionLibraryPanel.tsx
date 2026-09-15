"use client";

import { useMemo, useState } from "react";
import { getInterventionsFor, simulateIntervention, type InterventionContext, type InterventionScope } from "@/lib/engineering/interventionEngine";

type Extraction = {
  observations?: Array<{
    field: string;
    numericValue: number | null;
    unit: string | null;
  }>;
};

function canonical(field: string): string {
  return field
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function buildContext(extracts: Extraction[]): InterventionContext {
  const values = new Map<string, number>();
  for (const extract of extracts) {
    for (const observation of extract.observations ?? []) {
      if (observation.numericValue == null || !Number.isFinite(observation.numericValue)) continue;
      const key = canonical(observation.field);
      if (!values.has(key)) values.set(key, observation.numericValue);
    }
  }

  const get = (...keys: string[]): number | undefined => {
    for (const key of keys) {
      const value = values.get(key);
      if (value != null) return value;
    }
    return undefined;
  };

  return {
    floorAreaM2: get("floor_area_m2", "floor_area"),
    outdoorTempC: get("outdoor_temp_c", "ambient_temp_c", "temperature_outdoor_c"),
    indoorTempC: get("indoor_temp_c", "temperature_c", "temperature_indoor_c"),
    hvacCOP: get("cop", "hvac_cop"),
    loadKW: get("load_kw", "cooling_load_kw", "hvac_load_kw", "thermal_load_kw"),
    hvacCapacityKW: get("hvac_capacity_kw", "rated_capacity_kw", "capacity_kw"),
    proposedCapacityKW: get("proposed_capacity_kw"),
    annualCoolingHours: get("annual_cooling_hours", "annual_hours"),
    annualHours: get("annual_hours", "annual_runtime_hours"),
    electricityRateINRPerKWh: get("electricity_rate_inr_per_kwh", "tariff_inr_per_kwh", "electricity_rate"),
    existingRValue_m2K_W: get("existing_r_value_m2k_w", "roof_r_value", "r_value"),
    addedInsulationThicknessM: get("added_insulation_thickness_m", "insulation_thickness_m"),
    insulationConductivity_W_mK: get("insulation_conductivity_w_mk", "conductivity_w_mk"),
    glazingAreaM2: get("glazing_area_m2", "window_area_m2"),
    baselineGlazingU_W_m2K: get("baseline_glazing_u_w_m2k", "glazing_u_w_m2k", "window_u_value"),
    proposedGlazingU_W_m2K: get("proposed_glazing_u_w_m2k", "new_glazing_u_w_m2k"),
    baselineSolarHeatGainKW: get("baseline_solar_heat_gain_kw", "solar_gain_kw"),
    proposedSolarHeatGainKW: get("proposed_solar_heat_gain_kw", "new_solar_gain_kw"),
    baselineEfficiency: get("baseline_efficiency", "current_cop", "current_efficiency"),
    proposedEfficiency: get("proposed_efficiency", "new_cop", "new_efficiency"),
    efficiency: get("efficiency", "current_efficiency", "current_cop"),
    proposedRuntimeHours: get("proposed_runtime_hours", "controlled_runtime_hours"),
    baselineRuntimeHours: get("baseline_runtime_hours", "current_runtime_hours"),
    ratedCapacityKW: get("rated_capacity_kw", "capacity_kw"),
  };
}

export default function InterventionLibraryPanel({ scope, extracts }: { scope: InterventionScope; extracts: Extraction[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const context = useMemo(() => buildContext(extracts), [extracts]);
  const interventions = useMemo(() => getInterventionsFor(scope), [scope]);
  const selected = interventions.find((item) => item.id === selectedId) ?? interventions[0];
  const result = selected ? simulateIntervention(selected.id, context) : null;

  return (
    <section className="mx-auto mt-4 max-w-[1500px] px-4 sm:px-6 lg:px-8">
      <div className="border border-steel/20 bg-black/15 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-teal">Engineering intervention library</p>
            <h2 className="font-display mt-1 text-3xl sm:text-4xl">Every option has a calculation, evidence contract and gate.</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-steel">OVERHAUL no longer treats retrofit labels as fixed percentage guesses. Each registered action declares its equation and required evidence, then returns a simulated consequence only when those inputs exist.</p>
          </div>
          <div className="border border-steel/15 px-3 py-2 font-mono text-[9px] uppercase text-steel">{interventions.length} registered actions · {scope}</div>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-[0.95fr_1.35fr]">
          <div className="space-y-2">
            {interventions.map((item) => {
              const isSelected = selected?.id === item.id;
              const preview = simulateIntervention(item.id, context);
              return (
                <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={`w-full border p-4 text-left ${isSelected ? "border-teal bg-teal/5" : "border-steel/15 hover:border-steel/35"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-steel">{item.category} · {item.id}</p>
                      <p className="mt-1 text-sm text-paper">{item.name}</p>
                    </div>
                    <span className={`font-mono text-[8px] uppercase ${preview.status === "simulated" ? "text-teal" : preview.status === "infeasible" ? "text-clay" : "text-steel"}`}>{preview.status}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {selected && result ? (
            <div className="border border-steel/15 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[9px] uppercase text-teal">{selected.category} intervention</p>
                  <h3 className="mt-1 text-2xl">{selected.name}</h3>
                </div>
                <span className="font-mono text-[9px] uppercase text-steel">{result.status}</span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Metric label="Equation" value={selected.equation} />
                <Metric label="Evidence gate" value={result.missingInputs.length ? `${result.missingInputs.length} input${result.missingInputs.length === 1 ? "" : "s"} missing` : "Inputs satisfied"} />
                <Metric label="Thermal Δ" value={result.thermalDeltaKW == null ? "Not quantified" : `${result.thermalDeltaKW.toFixed(2)} kW`} />
                <Metric label="Annual saving" value={result.annualSavingINR == null ? "Not quantified" : `₹${result.annualSavingINR.toFixed(0)} / yr`} />
              </div>

              {result.missingInputs.length ? (
                <div className="mt-4 border border-clay/25 bg-clay/5 p-4">
                  <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-clay">Request evidence before ranking</p>
                  <p className="mt-2 text-xs leading-5 text-steel">{result.missingInputs.join(" · ")}</p>
                </div>
              ) : null}

              <div className="mt-4 border border-steel/15 p-4">
                <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-steel">Evidence contract</p>
                <div className="mt-2 space-y-1 text-xs leading-5 text-steel">{selected.evidenceNeeds.map((item) => <p key={item}>· {item}</p>)}</div>
              </div>

              <div className="mt-4 border border-steel/15 p-4">
                <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-steel">Engineering interpretation</p>
                <div className="mt-2 space-y-1 text-xs leading-5 text-steel">{result.applicability.map((item) => <p key={item}>· {item}</p>)}</div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="border border-steel/15 p-3"><p className="font-mono text-[8px] uppercase text-steel">{label}</p><p className="mt-2 text-xs leading-5 text-paper">{value}</p></div>;
}
