import type { NormalizedRecord } from "../data/types";
import { buildingStateFromRecord, equipmentStateFromRecord } from "./physicsAdapters";
import { simulatePhysicsScenario, type BuildingState, type EquipmentState, type PhysicsScenarioResult } from "./physicsSimulation";

export interface PhysicsDatasetSelection { subject: "building" | "facility" | "equipment"; records: NormalizedRecord[]; selectedRecordIndex?: number }
export interface DatasetPhysicsResult extends PhysicsScenarioResult { sourceRecordCount: number; selectedRecordIndex: number; provenance: NormalizedRecord["provenance"]; usableFields: string[]; missingEngineeringInputs: string[] }

function usableNumber(record: NormalizedRecord, keys: string[]): boolean { return keys.some((key) => typeof record.variables[key] === "number" && Number.isFinite(record.variables[key] as number)); }
function inspectBuilding(record: NormalizedRecord) { return [["floorAreaM2", ["floorAreaM2", "floor_area_m2", "area_m2", "floor_area"]], ["envelopeUA_W_per_K", ["envelopeUA_W_per_K", "envelope_ua_w_per_k", "ua_w_per_k"]], ["outdoorTempC", ["temperatureC", "temperature_c", "outdoor_temp_c", "ambient_temp_c"]], ["hvacCapacityKW", ["hvacCapacityKW", "hvac_capacity_kw", "rated_capacity_kw", "capacity_kw"]], ["hvacCOP", ["hvacCOP", "hvac_cop", "cop"]]] as const; }
function inspectEquipment(record: NormalizedRecord) { return [["loadKW", ["loadKW", "load_kw", "thermal_load_kw", "process_load_kw"]], ["ratedCapacityKW", ["ratedCapacityKW", "rated_capacity_kw", "capacity_kw"]], ["efficiency", ["efficiency", "cop", "eer", "kw_per_kw"]], ["annualHours", ["annualHours", "annual_hours", "runtime_hours"]], ["electricityRateINRPerKWh", ["electricityRateINRPerKWh", "energy_rate_inr_per_kwh", "tariff_inr_per_kwh"]]] as const; }

export function selectBestPhysicsRecord(records: NormalizedRecord[], subject: PhysicsDatasetSelection["subject"]) {
  if (!records.length) throw new Error("No normalized engineering records supplied.");
  const ranked = records.map((record, index) => {
    const checks = subject === "equipment" ? inspectEquipment(record) : inspectBuilding(record);
    const usableFields = checks.filter(([, keys]) => usableNumber(record, [...keys])).map(([name]) => name);
    const missingEngineeringInputs = checks.filter(([, keys]) => !usableNumber(record, [...keys])).map(([name]) => name);
    return { record, index, usableFields, missingEngineeringInputs, score: usableFields.length };
  }).sort((a, b) => b.score - a.score || a.index - b.index);
  const best = ranked[0];
  return { record: best.record, index: best.index, usableFields: best.usableFields, missingEngineeringInputs: best.missingEngineeringInputs };
}

function assertEngineeringInputs(subject: PhysicsDatasetSelection["subject"], usableFields: string[], missingEngineeringInputs: string[]) {
  // Tariff is economics-only. Physical load/power/energy can be computed without it.
  const required = subject === "equipment" ? ["loadKW", "ratedCapacityKW", "efficiency", "annualHours"] : ["floorAreaM2", "envelopeUA_W_per_K", "outdoorTempC", "hvacCapacityKW", "hvacCOP"];
  const missingRequired = required.filter((field) => !usableFields.includes(field));
  if (missingRequired.length) throw new Error(`Insufficient engineering inputs for ${subject} simulation. Missing: ${missingRequired.join(", ")}. Dataset fields must be mapped to verified engineering quantities before physics simulation. Candidate missing fields: ${missingEngineeringInputs.join(", ") || "none"}.`);
}

export function simulateDatasetRecord(records: NormalizedRecord[], subject: PhysicsDatasetSelection["subject"], retrofit: Partial<BuildingState> | Partial<EquipmentState>): DatasetPhysicsResult {
  const selected = selectBestPhysicsRecord(records, subject);
  assertEngineeringInputs(subject, selected.usableFields, selected.missingEngineeringInputs);
  const baseline = subject === "equipment" ? equipmentStateFromRecord(selected.record) : buildingStateFromRecord(selected.record);
  const result = simulatePhysicsScenario({ subject, baseline, retrofit });
  return { ...result, sourceRecordCount: records.length, selectedRecordIndex: selected.index, provenance: selected.record.provenance, usableFields: selected.usableFields, missingEngineeringInputs: selected.missingEngineeringInputs };
}
