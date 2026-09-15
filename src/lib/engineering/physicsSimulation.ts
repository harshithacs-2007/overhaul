/**
 * Deterministic what-if physics for building/facility/equipment assessments.
 * Numerical consequences are calculated here; AI may orchestrate inputs but does not invent values.
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
  baseline: {
    thermalLoadKW: number;
    electricalPowerKW: number;
    annualEnergyKWh: number;
    utilization: number;
  };
  proposed: {
    thermalLoadKW: number;
    electricalPowerKW: number;
    annualEnergyKWh: number;
    utilization: number;
  };
  delta: {
    thermalLoadKW: number;
    electricalPowerKW: number;
    annualEnergyKWh: number;
    annualCostINR: number;
    annualSavingINR: number;
    savingPercent: number;
  };
  verdict: string[];
}

function finitePositive(value: number, fallback = 0): number {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function buildingLoad(state: BuildingState): number {
  const deltaT = Math.max(state.outdoorTempC - state.indoorTempC, 0);
  const envelopeKW = state.envelopeUA_W_per_K * deltaT / 1000;
  // Sensible ventilation load: m_dot * cp * dT, with air density ≈ 1.2 kg/m³ and cp ≈ 1005 J/(kg·K).
  const ventilationKW = Math.max(state.ventilationM3s, 0) * 1.2 * 1005 * deltaT / 1000;
  return finitePositive(
    envelopeKW + ventilationKW + finitePositive(state.solarGainKW) + finitePositive(state.internalGainKW),
  );
}

function buildingElectricalPower(state: BuildingState, loadKW: number): number {
  const cop = Math.max(finitePositive(state.hvacCOP), 0.1);
  return loadKW / cop;
}

function buildingAnnualEnergy(state: BuildingState, loadKW: number): number {
  return buildingElectricalPower(state, loadKW) * Math.max(finitePositive(state.annualCoolingHours), 0);
}

function equipmentLoad(state: EquipmentState): number {
  return Math.min(finitePositive(state.loadKW), finitePositive(state.ratedCapacityKW));
}

function equipmentElectricalPower(state: EquipmentState, loadKW: number): number {
  const efficiency = Math.max(finitePositive(state.efficiency), 0.001);
  return loadKW / efficiency;
}

function equipmentAnnualEnergy(state: EquipmentState, loadKW: number): number {
  return equipmentElectricalPower(state, loadKW) * Math.max(finitePositive(state.annualHours), 0);
}

export function simulatePhysicsScenario(scenario: PhysicsScenario): PhysicsScenarioResult {
  if (scenario.subject === "building" || scenario.subject === "facility") {
    const base = scenario.baseline as BuildingState;
    const proposed = { ...base, ...(scenario.retrofit as Partial<BuildingState> | undefined) };
    const baseLoad = buildingLoad(base);
    const proposedLoad = buildingLoad(proposed);
    const basePower = buildingElectricalPower(base, baseLoad);
    const proposedPower = buildingElectricalPower(proposed, proposedLoad);
    const baseEnergy = buildingAnnualEnergy(base, baseLoad);
    const proposedEnergy = buildingAnnualEnergy(proposed, proposedLoad);
    const rate = Math.max(finitePositive(proposed.electricityRateINRPerKWh), finitePositive(base.electricityRateINRPerKWh));
    const annualSavingINR = (baseEnergy - proposedEnergy) * rate;
    const savingPercent = baseEnergy > 0 ? (baseEnergy - proposedEnergy) / baseEnergy * 100 : 0;
    const verdict: string[] = [];

    if (proposedLoad > proposed.hvacCapacityKW) verdict.push("Proposed thermal load exceeds available HVAC capacity.");
    else if (proposed.hvacCapacityKW > 0 && proposedLoad < proposed.hvacCapacityKW * 0.35) verdict.push("HVAC capacity is materially above the proposed peak load; check part-load operation and sequencing.");
    if (proposedLoad < baseLoad) verdict.push("Envelope/operating change reduces modeled thermal load before HVAC conversion.");
    if (proposedEnergy < baseEnergy) verdict.push("Modeled annual cooling electricity decreases under the stated hours and COP.");

    return {
      subject: scenario.subject,
      baseline: {
        thermalLoadKW: baseLoad,
        electricalPowerKW: basePower,
        annualEnergyKWh: baseEnergy,
        utilization: base.hvacCapacityKW > 0 ? baseLoad / base.hvacCapacityKW : 0,
      },
      proposed: {
        thermalLoadKW: proposedLoad,
        electricalPowerKW: proposedPower,
        annualEnergyKWh: proposedEnergy,
        utilization: proposed.hvacCapacityKW > 0 ? proposedLoad / proposed.hvacCapacityKW : 0,
      },
      delta: {
        thermalLoadKW: proposedLoad - baseLoad,
        electricalPowerKW: proposedPower - basePower,
        annualEnergyKWh: proposedEnergy - baseEnergy,
        annualCostINR: -annualSavingINR,
        annualSavingINR,
        savingPercent,
      },
      verdict,
    };
  }

  const base = scenario.baseline as EquipmentState;
  const proposed = { ...base, ...(scenario.retrofit as Partial<EquipmentState> | undefined) };
  const baseLoad = equipmentLoad(base);
  const proposedLoad = equipmentLoad(proposed);
  const basePower = equipmentElectricalPower(base, baseLoad);
  const proposedPower = equipmentElectricalPower(proposed, proposedLoad);
  const baseEnergy = equipmentAnnualEnergy(base, baseLoad);
  const proposedEnergy = equipmentAnnualEnergy(proposed, proposedLoad);
  const rate = Math.max(finitePositive(proposed.electricityRateINRPerKWh), finitePositive(base.electricityRateINRPerKWh));
  const annualSavingINR = (baseEnergy - proposedEnergy) * rate;
  const savingPercent = baseEnergy > 0 ? (baseEnergy - proposedEnergy) / baseEnergy * 100 : 0;
  const verdict: string[] = [];

  if (proposed.loadKW > proposed.ratedCapacityKW) verdict.push("Required equipment load exceeds rated capacity.");
  if (proposed.efficiency > base.efficiency) verdict.push("Proposed equipment efficiency is higher than baseline under the supplied reference values.");
  if (proposedEnergy < baseEnergy) verdict.push("Modeled annual electricity consumption decreases under the stated load and runtime.");

  return {
    subject: "equipment",
    baseline: {
      thermalLoadKW: baseLoad,
      electricalPowerKW: basePower,
      annualEnergyKWh: baseEnergy,
      utilization: base.ratedCapacityKW > 0 ? baseLoad / base.ratedCapacityKW : 0,
    },
    proposed: {
      thermalLoadKW: proposedLoad,
      electricalPowerKW: proposedPower,
      annualEnergyKWh: proposedEnergy,
      utilization: proposed.ratedCapacityKW > 0 ? proposedLoad / proposed.ratedCapacityKW : 0,
    },
    delta: {
      thermalLoadKW: proposedLoad - baseLoad,
      electricalPowerKW: proposedPower - basePower,
      annualEnergyKWh: proposedEnergy - baseEnergy,
      annualCostINR: -annualSavingINR,
      annualSavingINR,
      savingPercent,
    },
    verdict,
  };
}
