/**
 * Deterministic what-if physics for building/facility/equipment assessments.
 * Decision-critical numerical consequences are calculated here; missing or
 * invalid engineering inputs are rejected rather than silently substituted.
 */

export type EngineeringSubject = "building" | "facility" | "equipment";

export interface BuildingState {
  floorAreaM2: number;
  envelopeUA_W_per_K: number;
  ventilationM3s: number;
  outdoorTempC: number;
  indoorTempC: number;
  solarGainKW: number;
  internalGainKW: number;
  hvacCapacityKW: number;
  hvacCOP: number;
  annualCoolingHours: number;
  electricityRateINRPerKWh: number;
}

export interface EquipmentState {
  loadKW: number;
  ratedCapacityKW: number;
  efficiency: number;
  annualHours: number;
  electricityRateINRPerKWh: number;
}

export interface PhysicsScenario {
  subject: EngineeringSubject;
  baseline: BuildingState | EquipmentState;
  retrofit?: Partial<BuildingState> | Partial<EquipmentState>;
}

export interface PhysicsScenarioResult {
  subject: EngineeringSubject;
  baseline: { thermalLoadKW: number; electricalPowerKW: number; annualEnergyKWh: number; utilization: number };
  proposed: { thermalLoadKW: number; electricalPowerKW: number; annualEnergyKWh: number; utilization: number };
  delta: { thermalLoadKW: number; electricalPowerKW: number; annualEnergyKWh: number; annualCostINR: number; annualSavingINR: number; savingPercent: number };
  verdict: string[];
}

function finiteNonNegative(name: string, value: number) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be finite and non-negative.`);
  return value;
}
function finitePositive(name: string, value: number) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be finite and greater than zero.`);
  return value;
}

function validateBuilding(state: BuildingState) {
  finitePositive("Floor area", state.floorAreaM2);
  finiteNonNegative("Envelope UA", state.envelopeUA_W_per_K);
  finiteNonNegative("Ventilation flow", state.ventilationM3s);
  if (!Number.isFinite(state.outdoorTempC) || !Number.isFinite(state.indoorTempC)) throw new Error("Indoor and outdoor temperatures must be finite.");
  finiteNonNegative("Solar gain", state.solarGainKW);
  finiteNonNegative("Internal gain", state.internalGainKW);
  finitePositive("HVAC capacity", state.hvacCapacityKW);
  finitePositive("HVAC COP", state.hvacCOP);
  finiteNonNegative("Annual cooling hours", state.annualCoolingHours);
  if (state.annualCoolingHours > 8760) throw new Error("Annual cooling hours cannot exceed 8760 h/yr.");
  finiteNonNegative("Electricity rate", state.electricityRateINRPerKWh);
}

function validateEquipment(state: EquipmentState) {
  finiteNonNegative("Equipment load", state.loadKW);
  finitePositive("Rated capacity", state.ratedCapacityKW);
  finitePositive("Equipment efficiency", state.efficiency);
  finiteNonNegative("Annual runtime", state.annualHours);
  if (state.annualHours > 8760) throw new Error("Annual runtime cannot exceed 8760 h/yr.");
  finiteNonNegative("Electricity rate", state.electricityRateINRPerKWh);
}

function buildingLoad(state: BuildingState): number {
  const deltaT = Math.max(state.outdoorTempC - state.indoorTempC, 0);
  const envelopeKW = state.envelopeUA_W_per_K * deltaT / 1000;
  const ventilationKW = state.ventilationM3s * 1.2 * 1005 * deltaT / 1000;
  return envelopeKW + ventilationKW + state.solarGainKW + state.internalGainKW;
}
function buildingElectricalPower(state: BuildingState, loadKW: number) { return loadKW / state.hvacCOP; }
function buildingAnnualEnergy(state: BuildingState, loadKW: number) { return buildingElectricalPower(state, loadKW) * state.annualCoolingHours; }
function equipmentElectricalPower(state: EquipmentState) { return state.loadKW / state.efficiency; }
function equipmentAnnualEnergy(state: EquipmentState) { return equipmentElectricalPower(state) * state.annualHours; }

export function simulatePhysicsScenario(scenario: PhysicsScenario): PhysicsScenarioResult {
  if (scenario.subject === "building" || scenario.subject === "facility") {
    const base = scenario.baseline as BuildingState;
    const proposed = { ...base, ...(scenario.retrofit as Partial<BuildingState> | undefined) };
    validateBuilding(base);
    validateBuilding(proposed);
    const baseLoad = buildingLoad(base);
    const proposedLoad = buildingLoad(proposed);
    const basePower = buildingElectricalPower(base, baseLoad);
    const proposedPower = buildingElectricalPower(proposed, proposedLoad);
    const baseEnergy = buildingAnnualEnergy(base, baseLoad);
    const proposedEnergy = buildingAnnualEnergy(proposed, proposedLoad);
    const annualSavingINR = (baseEnergy - proposedEnergy) * base.electricityRateINRPerKWh;
    const savingPercent = baseEnergy > 0 ? (baseEnergy - proposedEnergy) / baseEnergy * 100 : 0;
    const verdict: string[] = [];
    if (proposedLoad > proposed.hvacCapacityKW) verdict.push("Required thermal load exceeds installed HVAC capacity; this is a capacity shortfall, not zero-load operation.");
    else if (proposedLoad < proposed.hvacCapacityKW * 0.35) verdict.push("Installed HVAC capacity is materially above the modeled peak load; evaluate part-load efficiency and sequencing.");
    if (proposedLoad < baseLoad) verdict.push("Modeled thermal load decreases under the supplied counterfactual inputs.");
    if (proposedEnergy < baseEnergy) verdict.push("Modeled annual cooling electricity decreases under the supplied hours and COP.");
    return {
      subject: scenario.subject,
      baseline: { thermalLoadKW: baseLoad, electricalPowerKW: basePower, annualEnergyKWh: baseEnergy, utilization: baseLoad / base.hvacCapacityKW },
      proposed: { thermalLoadKW: proposedLoad, electricalPowerKW: proposedPower, annualEnergyKWh: proposedEnergy, utilization: proposedLoad / proposed.hvacCapacityKW },
      delta: { thermalLoadKW: proposedLoad - baseLoad, electricalPowerKW: proposedPower - basePower, annualEnergyKWh: proposedEnergy - baseEnergy, annualCostINR: -annualSavingINR, annualSavingINR, savingPercent },
      verdict,
    };
  }

  const base = scenario.baseline as EquipmentState;
  const proposed = { ...base, ...(scenario.retrofit as Partial<EquipmentState> | undefined) };
  validateEquipment(base);
  validateEquipment(proposed);
  const baseLoad = base.loadKW;
  const proposedLoad = proposed.loadKW;
  const basePower = equipmentElectricalPower(base);
  const proposedPower = equipmentElectricalPower(proposed);
  const baseEnergy = equipmentAnnualEnergy(base);
  const proposedEnergy = equipmentAnnualEnergy(proposed);
  const annualSavingINR = (baseEnergy - proposedEnergy) * base.electricityRateINRPerKWh;
  const savingPercent = baseEnergy > 0 ? (baseEnergy - proposedEnergy) / baseEnergy * 100 : 0;
  const verdict: string[] = [];
  if (proposed.loadKW > proposed.ratedCapacityKW) verdict.push("Required equipment load exceeds rated capacity.");
  if (proposed.efficiency > base.efficiency) verdict.push("Proposed equipment efficiency exceeds the supplied baseline efficiency.");
  if (proposedEnergy < baseEnergy) verdict.push("Modeled annual electricity consumption decreases under the supplied load and runtime.");
  return {
    subject: "equipment",
    baseline: { thermalLoadKW: baseLoad, electricalPowerKW: basePower, annualEnergyKWh: baseEnergy, utilization: baseLoad / base.ratedCapacityKW },
    proposed: { thermalLoadKW: proposedLoad, electricalPowerKW: proposedPower, annualEnergyKWh: proposedEnergy, utilization: proposedLoad / proposed.ratedCapacityKW },
    delta: { thermalLoadKW: proposedLoad - baseLoad, electricalPowerKW: proposedPower - basePower, annualEnergyKWh: proposedEnergy - baseEnergy, annualCostINR: -annualSavingINR, annualSavingINR, savingPercent },
    verdict,
  };
}
