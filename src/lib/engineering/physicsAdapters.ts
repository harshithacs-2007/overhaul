import type { NormalizedRecord } from "../data/types";
import { simulatePhysicsScenario, type BuildingState, type EquipmentState, type PhysicsScenarioResult } from "./physicsSimulation";

function numberOf(record: NormalizedRecord, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record.variables[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

/** Build a conservative building physics state from normalized dataset evidence. */
export function buildingStateFromRecord(record: NormalizedRecord): BuildingState {
  return {
    floorAreaM2: numberOf(record, ["floorAreaM2", "floor_area_m2", "area_m2", "floor_area"]) ?? 0,
    envelopeUA_W_per_K: numberOf(record, ["envelopeUA_W_per_K", "envelope_ua_w_per_k", "ua_w_per_k"]) ?? 0,
    ventilationM3s: numberOf(record, ["ventilationM3s", "ventilation_m3s", "airflow_m3s"]) ?? 0,
    outdoorTempC: numberOf(record, ["temperatureC", "temperature_c", "outdoor_temp_c", "ambient_temp_c"]) ?? 0,
    indoorTempC: numberOf(record, ["indoorTempC", "indoor_temp_c", "setpoint_c"]) ?? 24,
    solarGainKW: numberOf(record, ["solarGainKW", "solar_gain_kw"]) ?? 0,
    internalGainKW: numberOf(record, ["internalGainKW", "internal_gain_kw"]) ?? 0,
    hvacCapacityKW: numberOf(record, ["hvacCapacityKW", "hvac_capacity_kw", "rated_capacity_kw", "capacity_kw"]) ?? 0,
    hvacCOP: numberOf(record, ["hvacCOP", "hvac_cop", "cop"]) ?? 0,
    annualCoolingHours: numberOf(record, ["annualCoolingHours", "annual_cooling_hours", "cooling_hours"]) ?? 0,
  };
}

/** Build an equipment operating state from normalized dataset evidence. */
export function equipmentStateFromRecord(record: NormalizedRecord): EquipmentState {
  return {
    loadKW: numberOf(record, ["loadKW", "load_kw", "thermal_load_kw", "process_load_kw"]) ?? 0,
    ratedCapacityKW: numberOf(record, ["ratedCapacityKW", "rated_capacity_kw", "capacity_kw"]) ?? 0,
    efficiency: numberOf(record, ["efficiency", "cop", "eer", "kw_per_kw"]) ?? 0,
    annualHours: numberOf(record, ["annualHours", "annual_hours", "runtime_hours"]) ?? 0,
    electricityRateINRPerKWh: numberOf(record, ["electricityRateINRPerKWh", "energy_rate_inr_per_kwh", "tariff_inr_per_kwh"]) ?? 0,
  };
}

export function simulateBuildingRecord(
  baselineRecord: NormalizedRecord,
  retrofit: Partial<BuildingState>,
): PhysicsScenarioResult {
  return simulatePhysicsScenario({ subject: "building", baseline: buildingStateFromRecord(baselineRecord), retrofit });
}

export function simulateEquipmentRecord(
  baselineRecord: NormalizedRecord,
  retrofit: Partial<EquipmentState>,
): PhysicsScenarioResult {
  return simulatePhysicsScenario({ subject: "equipment", baseline: equipmentStateFromRecord(baselineRecord), retrofit });
}
