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
  const area = numberOf(record, ["floorAreaM2", "floor_area_m2", "area_m2", "floor_area"]);
  const ua = numberOf(record, ["envelopeUA_W_per_K", "envelope_ua_w_per_k", "ua_w_per_k"]);
  const ventilation = numberOf(record, ["ventilationM3s", "ventilation_m3s", "airflow_m3s"]);
  const outdoor = numberOf(record, ["temperatureC", "temperature_c", "outdoor_temp_c", "ambient_temp_c"]);
  const indoor = numberOf(record, ["indoorTempC", "indoor_temp_c", "setpoint_c"]);
  const solar = numberOf(record, ["solarGainKW", "solar_gain_kw"]);
  const internal = numberOf(record, ["internalGainKW", "internal_gain_kw"]);
  const capacity = numberOf(record, ["hvacCapacityKW", "hvac_capacity_kw", "rated_capacity_kw", "capacity_kw"]);
  const cop = numberOf(record, ["hvacCOP", "hvac_cop", "cop"]);
  const hours = numberOf(record, ["annualCoolingHours", "annual_cooling_hours", "cooling_hours"]);

  return {
    floorAreaM2: area ?? 0,
    envelopeUA_W_per_K: ua ?? 0,
    ventilationM3s: ventilation ?? 0,
    outdoorTempC: outdoor ?? 0,
    indoorTempC: indoor ?? 24,
    solarGainKW: solar ?? 0,
    internalGainKW: internal ?? 0,
    hvacCapacityKW: capacity ?? 0,
    hvacCOP: cop ?? 0,
    annualCoolingHours: hours ?? 0,
  };
}

/** Build an equipment operating state from normalized dataset evidence. */
export function equipmentStateFromRecord(record: NormalizedRecord): EquipmentState {
  return {
    loadKW: numberOf(record, ["loadKW", "load_kw", "thermal_load_kw", "process_load_kw"]) ?? 0,
    ratedCapacityKW: numberOf(record, ["ratedCapacityKW", "rated_capacity_kw", "capacity_kw"]) ?? 0,
    efficiency: numberOf(record, ["efficiency", "cop", "eer", "kw_per_kw") ?? 0,
    annualHours: numberOf(record, ["annualHours", "annual_hours", "runtime_hours"]) ?? 0,
    electricityRateINRPerKWh: numberOf(record, ["electricityRateINRPerKWh", "energy_rate_inr_per_kwh", "tariff_inr_per_kwh"]) ?? 0,
  };
}

export function simulateBuildingRecord(
  baselineRecord: NormalizedRecord,
  retrofit: Partial<BuildingState>,
): PhysicsScenarioResult {
  return simulatePhysicsScenario({
    subject: "building",
    baseline: buildingStateFromRecord(baselineRecord),
    retrofit,
  });
}

export function simulateEquipmentRecord(
  baselineRecord: NormalizedRecord,
  retrofit: Partial<EquipmentState>,
): PhysicsScenarioResult {
  return simulatePhysicsScenario({
    subject: "equipment",
    baseline: equipmentStateFromRecord(baselineRecord),
    retrofit,
  });
}
