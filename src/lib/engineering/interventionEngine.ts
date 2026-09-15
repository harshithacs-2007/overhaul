/**
 * Deterministic retrofit intervention library.
 *
 * Interventions describe the engineering relationship, required evidence,
 * constraints, and a calculation function. The UI/AI can select an option,
 * but numeric consequences are calculated from supplied parameters only.
 */

export type InterventionScope = "building" | "facility" | "equipment";
export type InterventionCategory = "envelope" | "hvac" | "controls" | "equipment" | "operations";

export interface InterventionContext {
  floorAreaM2?: number;
  envelopeUA_W_per_K?: number;
  ventilationM3s?: number;
  outdoorTempC?: number;
  indoorTempC?: number;
  solarGainKW?: number;
  internalGainKW?: number;
  hvacCapacityKW?: number;
  hvacCOP?: number;
  annualCoolingHours?: number;
  loadKW?: number;
  ratedCapacityKW?: number;
  efficiency?: number;
  annualHours?: number;
  electricityRateINRPerKWh?: number;

  // Intervention-specific engineering inputs.
  existingRValue_m2K_W?: number;
  addedInsulationThicknessM?: number;
  insulationConductivity_W_mK?: number;
  baselineGlazingU_W_m2K?: number;
  proposedGlazingU_W_m2K?: number;
  glazingAreaM2?: number;
  baselineSolarHeatGainKW?: number;
  proposedSolarHeatGainKW?: number;
  baselineEfficiency?: number;
  proposedEfficiency?: number;
  proposedCapacityKW?: number;
  baselineRuntimeHours?: number;
  proposedRuntimeHours?: number;
  controlReductionFraction?: number;
}

export interface InterventionConstraint {
  id: string;
  label: string;
  type: "required" | "maximum" | "minimum";
  value?: number;
  unit?: string;
  note?: string;
}

export interface InterventionResult {
  interventionId: string;
  status: "simulated" | "insufficient-evidence" | "infeasible";
  equation: string;
  assumptions: string[];
  missingInputs: string[];
  constraints: InterventionConstraint[];
  thermalDeltaKW: number | null;
  electricalPowerDeltaKW: number | null;
  annualEnergyDeltaKWh: number | null;
  annualSavingINR: number | null;
  applicability: string[];
}

export interface InterventionDefinition {
  id: string;
  name: string;
  category: InterventionCategory;
  scopes: InterventionScope[];
  description: string;
  equation: string;
  requiredInputs: Array<keyof InterventionContext>;
  evidenceNeeds: string[];
  constraints?: InterventionConstraint[];
  simulate: (context: InterventionContext) => InterventionResult;
}

function finite(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function positive(value: number | undefined): value is number {
  return finite(value) && value > 0;
}

function missing(context: InterventionContext, inputs: Array<keyof InterventionContext>): string[] {
  return inputs.filter((key) => !finite(context[key] as number | undefined) || !(context[key] as number) || (context[key] as number) <= 0).map(String);
}

function savingsResult(
  definition: InterventionDefinition,
  context: InterventionContext,
  thermalDeltaKW: number,
  baselinePowerKW: number,
  proposedPowerKW: number,
  annualHours: number,
  assumptions: string[],
  missingInputs: string[] = [],
): InterventionResult {
  if (missingInputs.length) {
    return {
      interventionId: definition.id,
      status: "insufficient-evidence",
      equation: definition.equation,
      assumptions,
      missingInputs,
      constraints: definition.constraints ?? [],
      thermalDeltaKW: null,
      electricalPowerDeltaKW: null,
      annualEnergyDeltaKWh: null,
      annualSavingINR: null,
      applicability: ["Collect the missing evidence before using the intervention in a decision."],
    };
  }

  const rate = context.electricityRateINRPerKWh!;
  const annualEnergyDeltaKWh = (proposedPowerKW - baselinePowerKW) * annualHours;
  const annualSavingINR = -annualEnergyDeltaKWh * rate;

  return {
    interventionId: definition.id,
    status: "simulated",
    equation: definition.equation,
    assumptions,
    missingInputs: [],
    constraints: definition.constraints ?? [],
    thermalDeltaKW,
    electricalPowerDeltaKW: proposedPowerKW - baselinePowerKW,
    annualEnergyDeltaKWh,
    annualSavingINR,
    applicability: [definition.description],
  };
}

const registry: InterventionDefinition[] = [
  {
    id: "env.roof.insulation",
    name: "Add roof insulation",
    category: "envelope",
    scopes: ["building", "facility"],
    description: "Reduces conductive roof heat flow when the existing and added thermal resistance are known.",
    equation: "U_new = 1 / (R_existing + t / k); ΔQ = A × (U_new − U_existing) × ΔT",
    requiredInputs: ["floorAreaM2", "existingRValue_m2K_W", "addedInsulationThicknessM", "insulationConductivity_W_mK", "outdoorTempC", "indoorTempC", "hvacCOP", "annualCoolingHours", "electricityRateINRPerKWh"],
    evidenceNeeds: ["roof/ceiling area", "existing construction or R-value", "insulation thickness and conductivity", "outdoor/indoor design conditions"],
    simulate: (context) => {
      const required = registry[0];
      const needs = missing(context, required.requiredInputs);
      const existingR = context.existingRValue_m2K_W;
      const thickness = context.addedInsulationThicknessM;
      const conductivity = context.insulationConductivity_W_mK;
      const area = context.floorAreaM2;
      const deltaT = Math.max(context.outdoorTempC! - context.indoorTempC!, 0);
      const uExisting = 1 / existingR!;
      const uNew = 1 / (existingR! + thickness! / conductivity!);
      const thermalDelta = area! * (uNew - uExisting) * deltaT / 1000;
      const baselinePower = positive(context.hvacCOP) ? (area! * uExisting * deltaT / 1000) / context.hvacCOP! : 0;
      const proposedPower = positive(context.hvacCOP) ? (area! * uNew * deltaT / 1000) / context.hvacCOP! : 0;
      return savingsResult(required, context, thermalDelta, baselinePower, proposedPower, context.annualCoolingHours!, ["Roof heat transfer only; openings, thermal bridges, moisture, and solar effects are outside this intervention calculation."], needs);
    },
  },
  {
    id: "env.glazing.uvalue",
    name: "Upgrade glazing",
    category: "envelope",
    scopes: ["building", "facility"],
    description: "Replaces glazing with a lower U-value using measured/provided glazing area and thermal conditions.",
    equation: "ΔQ = A_glazing × (U_new − U_old) × ΔT",
    requiredInputs: ["glazingAreaM2", "baselineGlazingU_W_m2K", "proposedGlazingU_W_m2K", "outdoorTempC", "indoorTempC", "hvacCOP", "annualCoolingHours", "electricityRateINRPerKWh"],
    evidenceNeeds: ["glazing area", "existing U-value or construction", "proposed glazing U-value", "design indoor/outdoor temperature"],
    simulate: (context) => {
      const definition = registry[1];
      const needs = missing(context, definition.requiredInputs);
      const deltaT = Math.max(context.outdoorTempC! - context.indoorTempC!, 0);
      const thermalDelta = context.glazingAreaM2! * (context.proposedGlazingU_W_m2K! - context.baselineGlazingU_W_m2K!) * deltaT / 1000;
      const baselinePower = Math.max(context.glazingAreaM2! * context.baselineGlazingU_W_m2K! * deltaT / 1000 / context.hvacCOP!, 0);
      const proposedPower = Math.max(context.glazingAreaM2! * context.proposedGlazingU_W_m2K! * deltaT / 1000 / context.hvacCOP!, 0);
      return savingsResult(definition, context, thermalDelta, baselinePower, proposedPower, context.annualCoolingHours!, ["Conductive glazing heat transfer only; solar gains and frame effects require separate evidence/models."], needs);
    },
  },
  {
    id: "env.shading.solar",
    name: "Add external solar shading",
    category: "envelope",
    scopes: ["building", "facility"],
    description: "Reduces modeled solar heat gain when before/after gains are supplied from a solar or shading model.",
    equation: "ΔQ = Q_solar,new − Q_solar,baseline; ΔP = ΔQ / COP",
    requiredInputs: ["baselineSolarHeatGainKW", "proposedSolarHeatGainKW", "hvacCOP", "annualCoolingHours", "electricityRateINRPerKWh"],
    evidenceNeeds: ["baseline solar gain", "post-shading solar gain from a validated solar model", "HVAC COP"],
    simulate: (context) => {
      const definition = registry[2];
      const needs = missing(context, definition.requiredInputs);
      const thermalDelta = context.proposedSolarHeatGainKW! - context.baselineSolarHeatGainKW!;
      const baselinePower = context.baselineSolarHeatGainKW! / context.hvacCOP!;
      const proposedPower = context.proposedSolarHeatGainKW! / context.hvacCOP!;
      return savingsResult(definition, context, thermalDelta, baselinePower, proposedPower, context.annualCoolingHours!, ["Solar gain values must come from an explicit solar/shading calculation or measured calibration."], needs);
    },
  },
  {
    id: "hvac.efficiency.upgrade",
    name: "Upgrade HVAC efficiency",
    category: "hvac",
    scopes: ["building", "facility"],
    description: "Uses an existing and proposed COP to calculate the electrical consequence at the same thermal load.",
    equation: "P = Q / COP; ΔP = Q × (1/COP_new − 1/COP_old)",
    requiredInputs: ["loadKW", "hvacCOP", "baselineEfficiency", "proposedEfficiency", "annualCoolingHours", "electricityRateINRPerKWh"],
    evidenceNeeds: ["current thermal load", "current COP/efficiency reference", "proposed equipment performance data", "operating hours"],
    simulate: (context) => {
      const definition = registry[3];
      const needs = missing(context, definition.requiredInputs);
      const baselineCop = context.baselineEfficiency!;
      const proposedCop = context.proposedEfficiency!;
      const baselinePower = context.loadKW! / baselineCop;
      const proposedPower = context.loadKW! / proposedCop;
      return savingsResult(definition, context, 0, baselinePower, proposedPower, context.annualCoolingHours!, ["Assumes identical delivered thermal load and operating schedule; part-load curves require equipment-specific performance data."], needs);
    },
  },
  {
    id: "hvac.rightsize",
    name: "Right-size HVAC capacity",
    category: "hvac",
    scopes: ["building", "facility"],
    description: "Checks proposed capacity against a supplied design/peak load; it does not claim savings without a part-load model.",
    equation: "Utilization = Q_peak / Capacity; oversize risk when utilization is materially low",
    requiredInputs: ["loadKW", "hvacCapacityKW", "proposedCapacityKW"],
    evidenceNeeds: ["validated peak thermal load", "existing HVAC capacity", "proposed equipment capacity", "manufacturer part-load performance for quantified savings"],
    simulate: (context) => {
      const definition = registry[4];
      const needs = missing(context, definition.requiredInputs);
      const baselineUtilization = context.loadKW! / context.hvacCapacityKW!;
      const proposedUtilization = context.loadKW! / context.proposedCapacityKW!;
      const status = proposedUtilization > 1 ? "infeasible" : needs.length ? "insufficient-evidence" : "simulated";
      return {
        interventionId: definition.id,
        status,
        equation: definition.equation,
        assumptions: ["Capacity change alone does not imply a numeric annual energy saving; quantify with manufacturer part-load curves or a validated operating model."],
        missingInputs: needs,
        constraints: definition.constraints ?? [],
        thermalDeltaKW: null,
        electricalPowerDeltaKW: null,
        annualEnergyDeltaKWh: null,
        annualSavingINR: null,
        applicability: [
          `Existing utilization: ${(baselineUtilization * 100).toFixed(1)}%.`,
          `Proposed utilization: ${(proposedUtilization * 100).toFixed(1)}%.`,
          status === "infeasible" ? "Proposed capacity is below the supplied peak load." : "Part-load and sequencing evidence is still required for quantified savings.",
        ],
      };
    },
  },
  {
    id: "controls.runhours",
    name: "Reduce unnecessary runtime",
    category: "controls",
    scopes: ["building", "facility", "equipment"],
    description: "Quantifies savings when baseline and proposed runtime are supplied for the same average operating power.",
    equation: "P = Q / η; E = P × h; ΔE = P × (h_new − h_old)",
    requiredInputs: ["loadKW", "efficiency", "baselineRuntimeHours", "proposedRuntimeHours", "electricityRateINRPerKWh"],
    evidenceNeeds: ["measured operating load", "efficiency/COP", "baseline runtime", "proposed controlled runtime"],
    simulate: (context) => {
      const definition = registry[5];
      const needs = missing(context, definition.requiredInputs);
      if (needs.length) return savingsResult(definition, context, 0, 0, 0, 0, ["Same average operating power is assumed; schedule changes, cycling losses, comfort, and process constraints require separate checks.", "Baseline and proposed runtime must be independently measured or specified."], needs);
      const power = context.loadKW! / context.efficiency!;
      const baselineEnergy = power * context.baselineRuntimeHours!;
      const proposedEnergy = power * context.proposedRuntimeHours!;
      const rate = context.electricityRateINRPerKWh!;
      const savingINR = (baselineEnergy - proposedEnergy) * rate;
      return {
        interventionId: definition.id,
        status: context.proposedRuntimeHours! > context.baselineRuntimeHours! ? "infeasible" : "simulated",
        equation: definition.equation,
        assumptions: ["Average operating power is held constant; cycling losses, comfort, production constraints and startup energy require separate validation.", `Baseline runtime: ${context.baselineRuntimeHours!.toFixed(1)} h; proposed runtime: ${context.proposedRuntimeHours!.toFixed(1)} h.`],
        missingInputs: [],
        constraints: definition.constraints ?? [],
        thermalDeltaKW: 0,
        electricalPowerDeltaKW: 0,
        annualEnergyDeltaKWh: proposedEnergy - baselineEnergy,
        annualSavingINR: savingINR,
        applicability: [definition.description, context.proposedRuntimeHours! > context.baselineRuntimeHours! ? "Proposed runtime exceeds baseline; this is not a savings intervention." : "Runtime reduction produces a direct E = P × h reduction under the stated assumptions."],
      };
    },
  },
  {
    id: "equipment.efficiency.replace",
    name: "Replace equipment with higher-efficiency unit",
    category: "equipment",
    scopes: ["equipment", "facility", "building"],
    description: "Models same delivered load with a supplied current and replacement efficiency.",
    equation: "P_old = Q / η_old; P_new = Q / η_new",
    requiredInputs: ["loadKW", "efficiency", "proposedEfficiency", "annualHours", "electricityRateINRPerKWh"],
    evidenceNeeds: ["measured/validated load", "current equipment efficiency or power/load pair", "replacement performance data", "annual runtime"],
    simulate: (context) => {
      const definition = registry[6];
      const needs = missing(context, definition.requiredInputs);
      const baselinePower = context.loadKW! / context.efficiency!;
      const proposedPower = context.loadKW! / context.proposedEfficiency!;
      return savingsResult(definition, context, 0, baselinePower, proposedPower, context.annualHours!, ["Delivered useful load is held constant. Equipment-specific capacity limits, part-load curves, auxiliary power, maintenance, downtime, and embodied impacts require additional modeling."], needs);
    },
  },
];

export const INTERVENTION_LIBRARY: InterventionDefinition[] = registry;

export function getInterventionsFor(scope: InterventionScope): InterventionDefinition[] {
  return INTERVENTION_LIBRARY.filter((item) => item.scopes.includes(scope));
}

export function simulateIntervention(id: string, context: InterventionContext): InterventionResult {
  const intervention = INTERVENTION_LIBRARY.find((item) => item.id === id);
  if (!intervention) {
    return {
      interventionId: id,
      status: "insufficient-evidence",
      equation: "—",
      assumptions: [],
      missingInputs: ["unknown intervention id"],
      constraints: [],
      thermalDeltaKW: null,
      electricalPowerDeltaKW: null,
      annualEnergyDeltaKWh: null,
      annualSavingINR: null,
      applicability: ["Select an intervention from the registered engineering library."],
    };
  }
  return intervention.simulate(context);
}
