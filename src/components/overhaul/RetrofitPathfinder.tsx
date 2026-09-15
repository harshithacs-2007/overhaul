"use client";

import { useEffect, useMemo, useState } from "react";
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
  input?: { key: string; label: string; placeholder: string; unit: string };
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

function listMissing(parts: Array<[string, boolean]>) {
  return parts.filter(([, ready]) => !ready).map(([label]) => label);
}

function buildingBaseline(values: Values, overrides: { outdoorTempC?: number } = {}) {
  const floorArea = n(values, "floor_area_m2", "floor_area")!;
  const ua = n(values, "envelope_ua_w_per_k", "envelope_ua")!;
  const outdoor = Number.isFinite(Number(values.outdoor_temp_c)) ? Number(values.outdoor_temp_c) : Number(values.design_outdoor_temp_c);
  const indoor = Number.isFinite(Number(values.indoor_temp_c)) ? Number(values.indoor_temp_c) : Number(values.temperature_c);
  const capacity = n(values, "capacity_kw")!;
  const cop = n(values, "efficiency", "cop")!;
  const hours = n(values, "annual_cooling_hours", "cooling_hours")!;
  return {
    floorAreaM2: floorArea,
    envelopeUA_W_per_K: ua,
    ventilationM3s: n(values, "ventilation_m3s") ?? 0,
    outdoorTempC: overrides.outdoorTempC ?? outdoor,
    indoorTempC: indoor,
    solarGainKW: n(values, "solar_gain_kw") ?? 0,
    internalGainKW: n(values, "internal_gain_kw") ?? 0,
    hvacCapacityKW: capacity,
    hvacCOP: cop,
    annualCoolingHours: hours,
    electricityRateINRPerKWh: n(values, "electricity_rate_inr_per_kwh", "electricity_rate", "tariff_inr_per_kwh") ?? 0,
  };
}

function writeSupplemental(key: string, value: number | null) {
  try {
    const current = JSON.parse(sessionStorage.getItem("overhaul:supplemental-values") || "{}") as Record<string, unknown>;
    if (value == null || !Number.isFinite(value)) delete current[key];
    else current[key] = value;
    sessionStorage.setItem("overhaul:supplemental-values", JSON.stringify(current));
    window.dispatchEvent(new CustomEvent("overhaul:supplemental-change"));
  } catch {}
}

export default function RetrofitPathfinder({ scope, values }: { scope: Scope; values: Values }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [targetValue, setTargetValue] = useState("");
  const [installedCost, setInstalledCost] = useState("");

  useEffect(() => {
    setTargetValue("");
    setInstalledCost("");
  }, [scope]);

  const pathways = useMemo<Pathway[]>(() => {
    const rate = n(values, "electricity_rate_inr_per_kwh", "electricity_rate", "tariff_inr_per_kwh");

    if (scope === "equipment") {
      const load = n(values, "load_kw");
      const capacity = n(values, "capacity_kw");
      const efficiency = n(values, "efficiency", "cop");
      const hours = n(values, "annual_hours", "runtime_hours", "annual_runtime_hours");
      const proposedEfficiency = n(values, "proposed_efficiency", "proposed_cop");
      const baseHours = n(values, "baseline_runtime_hours");
      const proposedHours = n(values, "proposed_runtime_hours");
      const baselineReady = load != null && capacity != null && efficiency != null && hours != null && rate != null;
      const candidates: Pathway[] = [];

      const efficiencyMissing = listMissing([
        ["operating load", load != null],
        ["rated capacity", capacity != null],
        ["baseline efficiency", efficiency != null],
        ["annual runtime", hours != null],
        ["electricity rate", rate != null],
        ["proposed efficiency from a datasheet/reference", proposedEfficiency != null],
      ]);

      if (baselineReady && proposedEfficiency != null && proposedEfficiency > 0 && proposedEfficiency !== efficiency) {
        const baseline = { loadKW: load!, ratedCapacityKW: capacity!, efficiency: efficiency!, annualHours: hours!, electricityRateINRPerKWh: rate! };
        candidates.push({ id: "efficiency", title: "Efficiency upgrade", mechanism: "Reduce input power for the same stated operating load.", gate: "Baseline and proposed equipment performance are established from supplied evidence.", computable: true, result: simulatePhysicsScenario({ subject: "equipment", baseline, retrofit: { efficiency: proposedEfficiency } }) });
      } else {
        candidates.push({ id: "efficiency", title: "Efficiency upgrade", mechanism: "Compare the installed equipment with a higher-efficiency replacement or upgrade.", gate: efficiencyMissing.length ? `Needs: ${efficiencyMissing.join(" · ")}.` : "Proposed efficiency must differ from the baseline.", computable: false, input: !baselineReady || proposedEfficiency == null ? { key: "proposed_efficiency", label: "Target efficiency", placeholder: efficiency != null ? `Current: ${efficiency}` : "From new-equipment datasheet", unit: "COP / ratio" } : undefined });
      }

      const runtimeMissing = listMissing([
        ["current annual runtime", baseHours != null || hours != null],
        ["target runtime", proposedHours != null],
        ["operating load", load != null],
        ["rated capacity", capacity != null],
        ["efficiency", efficiency != null],
        ["electricity rate", rate != null],
      ]);
      const currentHours = baseHours ?? hours;
      if (currentHours != null && load != null && capacity != null && efficiency != null && rate != null && proposedHours != null && proposedHours !== currentHours) {
        const baseline = { loadKW: load, ratedCapacityKW: capacity, efficiency, annualHours: currentHours, electricityRateINRPerKWh: rate };
        candidates.push({ id: "runtime", title: "Runtime / controls optimisation", mechanism: "Change annual runtime while holding the supplied load and efficiency constant.", gate: "Baseline and proposed runtime are explicitly supplied.", computable: true, result: simulatePhysicsScenario({ subject: "equipment", baseline, retrofit: { annualHours: proposedHours } }) });
      } else {
        candidates.push({ id: "runtime", title: "Runtime / controls optimisation", mechanism: "Reduce unnecessary operating hours without assuming an efficiency change.", gate: runtimeMissing.length ? `Needs: ${runtimeMissing.join(" · ")}.` : "Proposed runtime must differ from the baseline.", computable: false, input: { key: "proposed_runtime_hours", label: "Target annual runtime", placeholder: currentHours != null ? `Current: ${fmt(currentHours, 0)}` : "Enter target hours", unit: "h/yr" } });
      }

      candidates.push({ id: "condition", title: "Condition-led maintenance before replacement", mechanism: "Resolve abnormal performance evidence before committing to replacement CAPEX.", gate: "Needs measured/reference evidence such as power, flow, pressure, temperature, vibration, or a documented fault condition.", computable: false });
      return candidates;
    }

    const floorArea = n(values, "floor_area_m2", "floor_area");
    const ua = n(values, "envelope_ua_w_per_k", "envelope_ua");
    const outdoor = Number(values.outdoor_temp_c);
    const indoor = Number(values.indoor_temp_c);
    const capacity = n(values, "capacity_kw");
    const cop = n(values, "efficiency", "cop");
    const hours = n(values, "annual_cooling_hours", "cooling_hours");
    const proposedR = n(values, "proposed_r_value_m2k_w");
    const currentR = n(values, "existing_r_value_m2k_w");
    const proposedEfficiency = n(values, "proposed_efficiency", "proposed_cop");
    const baselineReady = floorArea != null && ua != null && Number.isFinite(outdoor) && Number.isFinite(indoor) && capacity != null && cop != null && hours != null && rate != null;
    const candidates: Pathway[] = [];
    const unresolvedThermalInputs = listMissing([
      ["ventilation", n(values, "ventilation_m3s") != null],
      ["solar gain", n(values, "solar_gain_kw") != null],
      ["internal gains", n(values, "internal_gain_kw") != null],
    ]);
    const partialNote = unresolvedThermalInputs.length ? ` Partial thermal model: ${unresolvedThermalInputs.join(" · ")} not established, so those terms are excluded rather than guessed.` : " Full supplied thermal inputs are available.";

    const envelopeMissing = listMissing([
      ["floor area", floorArea != null], ["baseline envelope UA", ua != null], ["outdoor design condition", Number.isFinite(outdoor)], ["indoor target condition", Number.isFinite(indoor)], ["HVAC capacity", capacity != null], ["HVAC COP / efficiency", cop != null], ["annual cooling hours", hours != null], ["electricity rate", rate != null], ["existing R-value", currentR != null], ["proposed R-value", proposedR != null],
    ]);

    if (baselineReady && proposedR != null && proposedR > 0 && currentR != null && proposedR !== currentR) {
      const baseline = buildingBaseline(values);
      const proposedUA = floorArea! / proposedR;
      candidates.push({ id: "envelope", title: "Envelope retrofit", mechanism: `Reduce envelope heat transfer, then propagate the new load through HVAC power and annual energy.${partialNote}`, gate: `Floor area, envelope UA, indoor/outdoor boundary, HVAC performance, cooling hours and both R-values are established.${partialNote}`, computable: true, result: simulatePhysicsScenario({ subject: scope === "facility" ? "facility" : "building", baseline, retrofit: { envelopeUA_W_per_K: proposedUA } }) });
    } else {
      candidates.push({ id: "envelope", title: "Envelope retrofit", mechanism: "Model load reduction from insulation/envelope improvements before sizing HVAC consequences.", gate: envelopeMissing.length ? `Needs: ${envelopeMissing.join(" · ")}.${unresolvedThermalInputs.length ? ` Available model will remain partial until ${unresolvedThermalInputs.join(" and ")} are established.` : ""}` : "The proposed R-value must differ from the existing R-value.", computable: false, input: { key: "proposed_r_value_m2k_w", label: "Target envelope R-value", placeholder: currentR != null ? `Current: ${currentR}` : "From material/build-up evidence", unit: "m²K/W" } });
    }

    const hvacMissing = listMissing([
      ["floor area", floorArea != null], ["envelope UA", ua != null], ["indoor/outdoor boundary", Number.isFinite(outdoor) && Number.isFinite(indoor)], ["HVAC capacity", capacity != null], ["baseline COP / efficiency", cop != null], ["annual cooling hours", hours != null], ["electricity rate", rate != null], ["proposed HVAC efficiency", proposedEfficiency != null],
    ]);
    if (baselineReady && proposedEfficiency != null && proposedEfficiency > 0 && proposedEfficiency !== cop) {
      const baseline = buildingBaseline(values);
      candidates.push({ id: "hvac-efficiency", title: "HVAC efficiency upgrade", mechanism: `Hold the evidence-defined thermal load constant and propagate a new COP/efficiency through electrical power and annual energy.${partialNote}`, gate: `Baseline HVAC model and proposed efficiency are established.${partialNote}`, computable: true, result: simulatePhysicsScenario({ subject: scope === "facility" ? "facility" : "building", baseline, retrofit: { hvacCOP: proposedEfficiency } }) });
    } else {
      candidates.push({ id: "hvac-efficiency", title: "HVAC efficiency upgrade", mechanism: "Evaluate a better-performing HVAC option without guessing its COP.", gate: hvacMissing.length ? `Needs: ${hvacMissing.join(" · ")}.` : "Proposed efficiency must differ from the baseline.", computable: false, input: { key: "proposed_efficiency", label: "Target HVAC efficiency", placeholder: cop != null ? `Current: ${cop}` : "From equipment datasheet", unit: "COP / ratio" } });
    }

    candidates.push({ id: "controls", title: "Controls / sequencing retrofit", mechanism: "Use actual operating schedules, setpoints, staging, and part-load behavior to reduce avoidable operation.", gate: "Needs operating-hour, setpoint, BMS trend, or controller evidence before quantification.", computable: false });
    candidates.push({ id: "capacity", title: "Capacity / plant right-sizing study", mechanism: "Recalculate peak load and capacity margin before resizing or replacing equipment.", gate: "Needs credible peak/design boundary and load inputs; resizing is not treated as automatic energy saving.", computable: false });
    return candidates;
  }, [scope, values]);

  const selectedPathway = pathways.find((x) => x.id === selected) || pathways.find((x) => x.computable) || pathways[0] || null;
  const cost = Number(installedCost);
  const annualSaving = selectedPathway?.result?.delta.annualSavingINR ?? null;
  const simplePayback = annualSaving != null && annualSaving > 0 && Number.isFinite(cost) && cost > 0 ? cost / annualSaving : null;

  const applyTarget = () => {
    if (!selectedPathway?.input) return;
    const value = Number(targetValue);
    if (!Number.isFinite(value) || value < 0) return;
    writeSupplemental(selectedPathway.input.key, value);
    setTargetValue("");
  };

  return (
    <section className="overflow-hidden border border-amber-200/20 bg-[#080909] shadow-[0_22px_90px_rgba(0,0,0,.22)]">
      <div className="border-b border-steel/10 px-5 py-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-amber-200">Retrofit decision lab</p>
            <h2 className="mt-1 font-display text-3xl">Change the intervention. See the consequence.</h2>
            <p className="mt-2 max-w-3xl text-[10px] leading-5 text-steel">Start with the retrofit you are considering. OVERHAUL pulls the baseline from evidence, asks only for the target parameter that matters, and runs the consequence through the engineering model.</p>
          </div>
          <div className="border border-steel/15 px-3 py-2 font-mono text-[8px] uppercase text-steel">{pathways.filter((x) => x.computable).length} quantified · {pathways.filter((x) => !x.computable).length} evidence-gated</div>
        </div>
      </div>

      {selectedPathway ? (
        <div className="grid xl:grid-cols-[.82fr_1.18fr]">
          <div className="border-b border-steel/10 xl:border-b-0 xl:border-r">
            {pathways.map((pathway) => {
              const active = selectedPathway.id === pathway.id;
              return <button key={pathway.id} type="button" onClick={() => setSelected(pathway.id)} className={`block w-full border-b border-steel/10 px-5 py-4 text-left transition ${active ? "bg-amber-200/[0.045]" : "hover:bg-white/[0.018]"}`}>
                <div className="flex items-start justify-between gap-3"><div><p className={`text-sm ${active ? "text-paper" : "text-steel"}`}>{pathway.title}</p><p className="mt-1 text-[9px] leading-4 text-steel">{pathway.mechanism}</p></div><span className={`mt-0.5 font-mono text-[7px] uppercase ${pathway.computable ? "text-teal" : "text-steel/60"}`}>{pathway.computable ? "Simulatable" : "Needs evidence"}</span></div>
              </button>;
            })}
          </div>

          <div className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-mono text-[8px] uppercase text-steel">Selected pathway</p><h3 className="mt-1 font-display text-2xl">{selectedPathway.title}</h3></div><span className={`border px-3 py-1.5 font-mono text-[7px] uppercase ${selectedPathway.computable ? "border-teal/30 text-teal" : "border-steel/15 text-steel"}`}>{selectedPathway.computable ? "Engineering-computable" : "Evidence-gated"}</span></div>
            <p className="mt-3 text-[9px] leading-5 text-steel">{selectedPathway.gate}</p>

            {selectedPathway.result ? (
              <>
                <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <Metric label="Modeled load" value={`${fmt(selectedPathway.result.proposed.thermalLoadKW)} kW`} />
                  <Metric label="Electrical power" value={`${fmt(selectedPathway.result.proposed.electricalPowerKW)} kW`} />
                  <Metric label="Annual energy" value={`${fmt(selectedPathway.result.proposed.annualEnergyKWh)} kWh`} />
                  <Metric label="Energy change" value={`${selectedPathway.result.delta.savingPercent >= 0 ? "−" : "+"}${Math.abs(selectedPathway.result.delta.savingPercent).toFixed(1)}%`} />
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr]">
                  <label className="border border-steel/10 bg-black/20 p-3"><span className="font-mono text-[7px] uppercase text-steel">Installed cost (optional)</span><div className="mt-2 flex items-center gap-2"><span className="font-mono text-[9px] text-steel">₹</span><input inputMode="decimal" value={installedCost} onChange={(e) => setInstalledCost(e.target.value)} placeholder="Enter quoted cost" className="min-w-0 flex-1 bg-transparent text-[11px] outline-none"/></div></label>
                  <div className="border border-steel/10 bg-black/20 p-3"><span className="font-mono text-[7px] uppercase text-steel">Simple payback</span><p className="mt-2 font-mono text-[11px] text-paper">{simplePayback != null ? `${fmt(simplePayback, 1)} years` : "Needs cost + positive saving"}</p></div>
                </div>
              </>
            ) : selectedPathway.input ? (
              <div className="mt-5 border border-amber-200/20 bg-amber-200/[0.035] p-4">
                <p className="font-mono text-[8px] uppercase text-amber-200">One useful input</p>
                <p className="mt-2 text-[9px] leading-5 text-steel">You do not need to fill the whole engineering model. Enter just the proposed value for this retrofit, ideally from a manufacturer datasheet, quote, test report, or measured operating target.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <div className="flex min-w-[220px] flex-1 items-center border border-steel/20 bg-black/25 px-3"><input inputMode="decimal" type="number" min="0" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} placeholder={selectedPathway.input.placeholder} className="min-w-0 flex-1 bg-transparent py-3 text-[10px] outline-none"/><span className="font-mono text-[8px] text-steel">{selectedPathway.input.unit}</span></div>
                  <button type="button" onClick={applyTarget} disabled={!targetValue} className="border border-teal bg-teal px-4 py-3 font-mono text-[8px] uppercase tracking-[0.12em] text-navy disabled:opacity-30">Run what-if</button>
                </div>
              </div>
            ) : (
              <div className="mt-5 border border-steel/15 bg-black/20 p-4"><p className="font-mono text-[8px] uppercase text-steel">Evidence gate</p><p className="mt-2 text-[9px] leading-5 text-steel">This pathway may be relevant, but OVERHAUL will not attach a savings value until the listed engineering evidence is available.</p></div>
            )}

            {selectedPathway.result ? <div className="mt-4 border border-teal/15 bg-teal/[0.025] p-4"><p className="font-mono text-[8px] uppercase text-teal">Calculation trace</p><div className="mt-2 space-y-1 text-[9px] leading-5 text-steel"><p>Current → proposed annual energy: {fmt(selectedPathway.result.baseline.annualEnergyKWh)} → {fmt(selectedPathway.result.proposed.annualEnergyKWh)} kWh.</p><p>Power change: {selectedPathway.result.delta.electricalPowerKW >= 0 ? "+" : ""}{fmt(selectedPathway.result.delta.electricalPowerKW)} kW.</p>{selectedPathway.result.verdict.map((line) => <p key={line}>{line}</p>)}</div></div> : null}
          </div>
        </div>
      ) : <div className="p-8 text-center text-[9px] text-steel">Add evidence to establish a baseline. Retrofit pathways will appear here.</div>}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="border border-steel/10 bg-black/25 p-3"><p className="font-mono text-[7px] uppercase text-steel">{label}</p><p className="mt-1 font-mono text-[11px] text-paper">{value}</p></div>;
}
