"use client";

import { useEffect, useMemo, useState } from "react";
import { calculateRetrofitEconomics } from "@/lib/engineering/economicsEngine";
import { optimizeRetrofitPortfolio, type PortfolioOption } from "@/lib/engineering/portfolioOptimizer";
import { simulateIntervention, type InterventionContext, type InterventionResult } from "@/lib/engineering/interventionEngine";

type Scope = "building" | "facility" | "equipment";
type Extraction = { observations?: Array<{ field: string; numericValue: number | null; unit: string | null; confidence: number }> };

type OptionState = PortfolioOption & { interventionId: string; status: InterventionResult["status"]; equation: string; missingInputs: string[] };

const DEFINITIONS = [
  ["env.roof.insulation", "Roof insulation", "Envelope", "capex_roof_insulation_inr", "downtime_roof_insulation_hours"],
  ["env.glazing.uvalue", "High-performance glazing", "Envelope", "capex_glazing_inr", "downtime_glazing_hours"],
  ["env.shading.solar", "External shading", "Envelope", "capex_shading_inr", "downtime_shading_hours"],
  ["hvac.efficiency.upgrade", "HVAC efficiency upgrade", "HVAC", "capex_hvac_efficiency_inr", "downtime_hvac_efficiency_hours"],
  ["hvac.rightsize", "Right-size HVAC", "HVAC", "capex_hvac_rightsize_inr", "downtime_hvac_rightsize_hours"],
  ["controls.runhours", "Controls + runtime optimisation", "Controls", "capex_controls_inr", "downtime_controls_hours"],
  ["equipment.efficiency.replace", "Equipment replacement", "Equipment", "capex_equipment_replace_inr", "downtime_equipment_replace_hours"],
] as const;

export default function EconomicsPortfolioPanel() {
  const [assessment, setAssessment] = useState<{ assessmentSubject?: Scope } | null>(null);
  const [extracts, setExtracts] = useState<Extraction[]>([]);

  useEffect(() => {
    try {
      setAssessment(JSON.parse(sessionStorage.getItem("overhaul:assessment") || "null"));
      setExtracts(JSON.parse(sessionStorage.getItem("overhaul:evidence-extractions") || "[]"));
    } catch {
      setAssessment(null);
      setExtracts([]);
    }
  }, []);

  const observations = useMemo(() => {
    const map = new Map<string, number>();
    for (const extract of extracts) {
      for (const observation of extract.observations ?? []) {
        if (observation.numericValue != null && Number.isFinite(observation.numericValue)) {
          map.set(canonical(observation.field), observation.numericValue);
        }
      }
    }
    return map;
  }, [extracts]);

  const metrics = useMemo(() => ({
    floorAreaM2: get(observations, ["floor_area_m2", "floor_area"]),
    outdoorTempC: get(observations, ["outdoor_temp_c", "design_outdoor_temp_c"]),
    indoorTempC: get(observations, ["indoor_temp_c", "temperature_c"]),
    hvacCapacityKW: get(observations, ["rated_capacity_kw", "capacity_kw"]),
    hvacCOP: get(observations, ["cop", "efficiency"]),
    annualCoolingHours: get(observations, ["annual_cooling_hours", "cooling_hours"]),
    loadKW: get(observations, ["cooling_load_kw", "hvac_load_kw", "load_kw"]),
    ratedCapacityKW: get(observations, ["rated_capacity_kw", "capacity_kw"]),
    efficiency: get(observations, ["efficiency", "cop"]),
    annualHours: get(observations, ["annual_hours", "runtime_hours", "annual_runtime_hours"]),
    electricityRateINRPerKWh: get(observations, ["electricity_rate_inr_per_kwh", "electricity_rate", "tariff_inr_per_kwh"]),
    existingRValue_m2K_W: get(observations, ["existing_r_value_m2k_w", "r_value_m2k_w"]),
    addedInsulationThicknessM: get(observations, ["added_insulation_thickness_m"]),
    insulationConductivity_W_mK: get(observations, ["insulation_conductivity_w_mk", "conductivity_w_mk"]),
    baselineGlazingU_W_m2K: get(observations, ["baseline_glazing_u_w_m2k", "glazing_u_old"]),
    proposedGlazingU_W_m2K: get(observations, ["proposed_glazing_u_w_m2k", "glazing_u_new"]),
    glazingAreaM2: get(observations, ["glazing_area_m2"]),
    baselineSolarHeatGainKW: get(observations, ["baseline_solar_heat_gain_kw"]),
    proposedSolarHeatGainKW: get(observations, ["proposed_solar_heat_gain_kw"]),
    baselineEfficiency: get(observations, ["baseline_efficiency", "efficiency", "cop"]),
    proposedEfficiency: get(observations, ["proposed_efficiency", "proposed_cop"]),
    proposedCapacityKW: get(observations, ["proposed_capacity_kw"]),
    baselineRuntimeHours: get(observations, ["baseline_runtime_hours"]),
    proposedRuntimeHours: get(observations, ["proposed_runtime_hours"]),
  }), [observations]);

  const context = metrics as InterventionContext;
  const options = useMemo<OptionState[]>(() => DEFINITIONS.flatMap(([id, name, category, capexKey, downtimeKey]) => {
    const result = simulateIntervention(id, context);
    const capex = observations.get(capexKey);
    if (result.status !== "simulated" || capex == null || capex < 0 || result.annualSavingINR == null || result.annualEnergyDeltaKWh == null) return [];
    return [{
      id,
      name,
      capexINR: capex,
      annualSavingINR: result.annualSavingINR,
      annualEnergySavingKWh: Math.max(-result.annualEnergyDeltaKWh, 0),
      downtimeHours: Math.max(observations.get(downtimeKey) ?? 0, 0),
      interventionId: id,
      status: result.status,
      equation: result.equation,
      missingInputs: [],
      priorityWeight: category === "equipment" ? 1.05 : 1,
    }];
  }), [context, observations]);

  const portfolio = useMemo(() => optimizeRetrofitPortfolio(options, {
    budgetINR: observations.get("portfolio_budget_inr"),
    maxDowntimeHours: observations.get("portfolio_max_downtime_hours"),
    maxActions: observations.get("portfolio_max_actions"),
    minAnnualSavingINR: observations.get("portfolio_min_annual_saving_inr"),
    carbonTargetKgPerYear: observations.get("portfolio_carbon_target_kg_per_year"),
  }), [options, observations]);

  const economics = useMemo(() => options.length ? calculateRetrofitEconomics({
    capexINR: portfolio.totalCapexINR,
    annualSavingINR: portfolio.totalAnnualSavingINR,
    annualEnergySavingKWh: portfolio.totalAnnualEnergySavingKWh,
    analysisYears: observations.get("analysis_years") ?? 10,
    discountRate: (observations.get("discount_rate_percent") ?? 8) / 100,
    escalationRate: (observations.get("escalation_rate_percent") ?? 3) / 100,
  }) : null, [options, portfolio, observations]);

  return (
    <section className="mx-auto mt-4 max-w-[1500px] px-4 sm:px-6 lg:px-8">
      <div className="border border-steel/20 bg-black/15 p-5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-teal">Evidence-backed decision economics</p>
            <h2 className="font-display mt-1 text-3xl sm:text-4xl">Only price what the evidence supports.</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-steel">Portfolio economics now consume quantified intervention results. An intervention enters the financial optimizer only when its engineering model is simulated and an explicit capex observation is available; otherwise it remains evidence-gated.</p>
          </div>
          <div className="font-mono text-[9px] uppercase text-steel">scope {assessment?.assessmentSubject ?? "building"}</div>
        </div>

        {!options.length ? (
          <div className="mt-5 border border-clay/25 bg-clay/5 p-4">
            <p className="font-mono text-[9px] uppercase text-clay">Financial decision blocked</p>
            <p className="mt-2 text-xs leading-5 text-steel">No intervention currently has both a deterministic quantified saving and an explicit capex value in the evidence package. Add cost/pricing evidence before showing payback, NPV or a ranked portfolio.</p>
          </div>
        ) : null}

        {options.length ? <>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <Metric label="Selected capex" value={`₹${portfolio.totalCapexINR.toLocaleString("en-IN")}`} />
            <Metric label="Annual saving" value={`₹${portfolio.totalAnnualSavingINR.toLocaleString("en-IN")}`} />
            <Metric label="Energy saving" value={`${portfolio.totalAnnualEnergySavingKWh.toLocaleString("en-IN")} kWh/yr`} />
            <Metric label="Payback" value={economics?.simplePaybackYears == null ? "Not established" : `${economics.simplePaybackYears.toFixed(1)} yr`} />
          </div>
          <div className="mt-4 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
            <div>
              <p className="font-mono text-[9px] uppercase text-teal">Ranked portfolio</p>
              <div className="mt-3 space-y-2">{portfolio.selected.map((option, index) => <div key={option.id} className="flex items-center justify-between gap-4 border border-steel/15 p-3"><div><span className="font-mono text-[8px] text-teal">0{index + 1}</span><span className="ml-3 text-sm">{option.name}</span><p className="ml-6 mt-1 text-[9px] text-steel">{option.annualEnergySavingKWh?.toLocaleString("en-IN") ?? "0"} kWh/yr · ₹{option.annualSavingINR.toLocaleString("en-IN")}/yr</p></div><span className="font-mono text-[8px] text-steel">{option.downtimeHours ?? 0}h</span></div>)}</div>
            </div>
            <div className="border border-steel/15 p-4"><p className="font-mono text-[9px] uppercase text-steel">Financial view</p><div className="mt-3 space-y-2 text-xs text-steel"><p>NPV: <span className="text-paper">₹{(economics?.npvINR ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span></p><p>IRR: <span className="text-paper">{economics?.irrPercent == null ? "—" : `${economics.irrPercent.toFixed(1)}%`}</span></p><p>Lifecycle cost delta: <span className="text-paper">₹{(economics?.lifecycleCostDeltaINR ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span></p><p>Target: <span className={portfolio.targetStatus === "met" ? "text-teal" : "text-clay"}>{portfolio.targetStatus}</span></p></div></div>
          </div>
        </> : null}
      </div>
    </section>
  );
}

function get(map: Map<string, number>, keys: string[]) { for (const key of keys) { const v = map.get(key); if (v != null) return v; } return null; }
function canonical(field: string) { return field.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); }
function Metric({ label, value }: { label: string; value: string }) { return <div className="border border-steel/15 p-4"><p className="font-mono text-[8px] uppercase text-steel">{label}</p><p className="mt-1 text-lg text-paper">{value}</p></div>; }
