import type { NormalizedRecord } from "../data/types";
import { normalizedRecordsToShadowObservations } from "../data/shadowBridge";
import type { ExpectedSignal, ShadowObservation, ShadowSubject } from "./digitalShadow";
import { buildDigitalShadow } from "./digitalShadow";

export interface RescastObservedMetrics {
  intervalCount: number;
  electricityEnergyKWh: number;
  meanElectricityPowerKW?: number;
  peakElectricityPowerKW?: number;
  meanHVACLoadKW?: number;
  peakHVACLoadKW?: number;
  meanIndoorTempC?: number;
  meanOutdoorTempC?: number;
  coolingDegreeHours?: number;
}

export interface RescastShadowCalibration {
  datasetId: string;
  buildingId?: string;
  window: {
    start?: string;
    end?: string;
    intervalCount: number;
  };
  observed: RescastObservedMetrics;
  shadow: ReturnType<typeof buildDigitalShadow>;
}

export interface RescastShadowInput {
  records: NormalizedRecord[];
  subject?: ShadowSubject;
  buildingId?: string;
  expectedSignals?: ExpectedSignal[];
}

function finiteNumbers(records: NormalizedRecord[], key: string): number[] {
  const values: number[] = [];
  for (const record of records) {
    const value = record.variables[key];
    if (typeof value === "number" && Number.isFinite(value)) values.push(value);
  }
  return values;
}

function mean(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function max(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  let result = -Infinity;
  for (const value of values) result = Math.max(result, value);
  return result;
}

function sum(values: number[]): number {
  let result = 0;
  for (const value of values) result += value;
  return result;
}

function coolingDegreeHours(records: NormalizedRecord[]): number {
  let total = 0;
  for (const record of records) {
    const outdoor = record.variables.outdoorTempC;
    const indoor = record.variables.coolingSetpointC;
    if (typeof outdoor !== "number" || !Number.isFinite(outdoor)) continue;
    if (typeof indoor !== "number" || !Number.isFinite(indoor)) continue;
    total += Math.max(outdoor - indoor, 0) * 0.25;
  }
  return total;
}

function observationMean(
  observations: ShadowObservation[],
  key: string,
): number | undefined {
  const values: number[] = [];
  for (const observation of observations) {
    if (observation.key === key && Number.isFinite(observation.value)) {
      values.push(observation.value);
    }
  }
  return mean(values);
}

function observationMax(
  observations: ShadowObservation[],
  key: string,
): number | undefined {
  let result = -Infinity;
  let found = false;
  for (const observation of observations) {
    if (observation.key !== key || !Number.isFinite(observation.value)) continue;
    result = Math.max(result, observation.value);
    found = true;
  }
  return found ? result : undefined;
}

export function summarizeRescastShadowWindow(
  records: NormalizedRecord[],
  observations: ShadowObservation[] = normalizedRecordsToShadowObservations(records),
): RescastObservedMetrics {
  const electricityEnergy = finiteNumbers(records, "electricityEnergyKWh");
  const electricityPower = finiteNumbers(records, "electricityPowerKW");
  const hvacLoad = finiteNumbers(records, "hvacLoadPowerKW");
  const indoorTemp = finiteNumbers(records, "indoorTempC");
  const outdoorTemp = finiteNumbers(records, "outdoorTempC");

  return {
    intervalCount: records.length,
    electricityEnergyKWh: sum(electricityEnergy),
    meanElectricityPowerKW: observationMean(observations, "power_kw") ?? mean(electricityPower),
    peakElectricityPowerKW: observationMax(observations, "power_kw") ?? max(electricityPower),
    meanHVACLoadKW: observationMean(observations, "load_kw") ?? mean(hvacLoad),
    peakHVACLoadKW: observationMax(observations, "load_kw") ?? max(hvacLoad),
    meanIndoorTempC: observationMean(observations, "indoor_temp_c") ?? mean(indoorTemp),
    meanOutdoorTempC: observationMean(observations, "outdoor_temp_c") ?? mean(outdoorTemp),
    coolingDegreeHours: coolingDegreeHours(records),
  };
}

export function buildRescastDigitalShadow(
  input: RescastShadowInput,
): RescastShadowCalibration {
  if (input.records.length === 0) {
    throw new Error("At least one normalized RESCAST record is required.");
  }

  const datasetId = input.records[0]?.datasetId ?? "unknown-dataset";
  const buildingId = input.buildingId;
  const observations = normalizedRecordsToShadowObservations(input.records);
  const subject = input.subject ?? "building";
  const observed = summarizeRescastShadowWindow(input.records, observations);
  const expectedSignals = input.expectedSignals ?? [];

  // Critical invariant: the observed series stays observed. Expected values
  // must come from an independent reference/calibration model, never from the
  // same observations being compared.
  const shadow = buildDigitalShadow(subject, observations, expectedSignals);
  const timestamps = input.records
    .map((record) => record.timestamp)
    .filter((timestamp): timestamp is string => typeof timestamp === "string" && timestamp.length > 0)
    .sort();

  return {
    datasetId,
    buildingId,
    window: {
      start: timestamps[0],
      end: timestamps[timestamps.length - 1],
      intervalCount: input.records.length,
    },
    observed,
    shadow,
  };
}
