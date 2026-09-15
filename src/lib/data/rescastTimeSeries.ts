import type { NormalizedRecord } from "./types";

/**
 * Verified RESCAST time-series fields.
 * Source metadata defines a 15-minute resolution, load quantities in kWh,
 * temperatures in °F, solar irradiation in Btu/(hr·ft²), humidity in %,
 * and wind speed in m/s.
 */
export const RESCAST_TIMESERIES_FIELDS = {
  time: "Time",
  electricityKwh: "Fuel Use: Electricity: Total",
  hvacLoadKwh: "HVAC Load",
  totalLoadKwh: "Total Load",
  indoorTempF: "Temperature: Conditioned Space",
  heatingSetpointF: "Temperature: Heating Setpoint",
  coolingSetpointF: "Temperature: Cooling Setpoint",
  outdoorTempF: "Weather: Drybulb Temperature",
  wetbulbTempF: "Weather: Wetbulb Temperature",
  solarBtuPerHourFt2: "Solar Irradiation",
  relativeHumidity: "Relative Humidity",
  windSpeedMps: "Wind Speed",
} as const;

function finite(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function fahrenheitToCelsius(value: unknown): number | undefined {
  const number = finite(value);
  return number == null ? undefined : (number - 32) * (5 / 9);
}

/** Convert 15-minute energy in kWh to average interval power in kW. */
function intervalKwhToKw(value: unknown): number | undefined {
  const number = finite(value);
  return number == null ? undefined : number * 4;
}

/** Convert Btu/(hr·ft²) to W/m² using exact unit conversion constants. */
function solarToWPerM2(value: unknown): number | undefined {
  const number = finite(value);
  return number == null ? undefined : number * 3.154590745;
}

/**
 * Promote only source fields whose units and cadence are explicitly defined by
 * RESCAST metadata. Static categorical housing fields remain untouched.
 */
export function normalizeRescastTimeseriesRow(
  row: Record<string, unknown>,
  options: {
    datasetId: string;
    sourcePath: string;
    sourceRow?: number;
    buildingId?: string | number;
  },
): NormalizedRecord {
  const variables: NormalizedRecord["variables"] = {};
  const provenance: NormalizedRecord["provenance"] = [];

  const add = (canonical: string, value: number | string | undefined, sourceField: string) => {
    if (value == null || (typeof value === "number" && !Number.isFinite(value))) return;
    variables[canonical] = value;
    provenance.push({
      sourcePath: options.sourcePath,
      sourceField,
      confidence: "measured",
    });
  };

  add("electricityEnergyKWh", finite(row[RESCAST_TIMESERIES_FIELDS.electricityKwh]), RESCAST_TIMESERIES_FIELDS.electricityKwh);
  add("electricityPowerKW", intervalKwhToKw(row[RESCAST_TIMESERIES_FIELDS.electricityKwh]), RESCAST_TIMESERIES_FIELDS.electricityKwh);
  add("hvacLoadEnergyKWh", finite(row[RESCAST_TIMESERIES_FIELDS.hvacLoadKwh]), RESCAST_TIMESERIES_FIELDS.hvacLoadKwh);
  add("hvacLoadPowerKW", intervalKwhToKw(row[RESCAST_TIMESERIES_FIELDS.hvacLoadKwh]), RESCAST_TIMESERIES_FIELDS.hvacLoadKwh);
  add("totalLoadEnergyKWh", finite(row[RESCAST_TIMESERIES_FIELDS.totalLoadKwh]), RESCAST_TIMESERIES_FIELDS.totalLoadKwh);
  add("totalLoadPowerKW", intervalKwhToKw(row[RESCAST_TIMESERIES_FIELDS.totalLoadKwh]), RESCAST_TIMESERIES_FIELDS.totalLoadKwh);
  add("indoorTempC", fahrenheitToCelsius(row[RESCAST_TIMESERIES_FIELDS.indoorTempF]), RESCAST_TIMESERIES_FIELDS.indoorTempF);
  add("heatingSetpointC", fahrenheitToCelsius(row[RESCAST_TIMESERIES_FIELDS.heatingSetpointF]), RESCAST_TIMESERIES_FIELDS.heatingSetpointF);
  add("coolingSetpointC", fahrenheitToCelsius(row[RESCAST_TIMESERIES_FIELDS.coolingSetpointF]), RESCAST_TIMESERIES_FIELDS.coolingSetpointF);
  add("outdoorTempC", fahrenheitToCelsius(row[RESCAST_TIMESERIES_FIELDS.outdoorTempF]), RESCAST_TIMESERIES_FIELDS.outdoorTempF);
  add("wetbulbTempC", fahrenheitToCelsius(row[RESCAST_TIMESERIES_FIELDS.wetbulbTempF]), RESCAST_TIMESERIES_FIELDS.wetbulbTempF);
  add("solarIrradianceWPerM2", solarToWPerM2(row[RESCAST_TIMESERIES_FIELDS.solarBtuPerHourFt2]), RESCAST_TIMESERIES_FIELDS.solarBtuPerHourFt2);
  add("relativeHumidityPct", finite(row[RESCAST_TIMESERIES_FIELDS.relativeHumidity]), RESCAST_TIMESERIES_FIELDS.relativeHumidity);
  add("windSpeedMps", finite(row[RESCAST_TIMESERIES_FIELDS.windSpeedMps]), RESCAST_TIMESERIES_FIELDS.windSpeedMps);

  const timestampValue = row[RESCAST_TIMESERIES_FIELDS.time];
  if (timestampValue != null) {
    provenance.push({
      sourcePath: options.sourcePath,
      sourceField: RESCAST_TIMESERIES_FIELDS.time,
      confidence: "measured",
    });
  }

  if (options.buildingId != null) {
    variables.buildingId = String(options.buildingId);
  }

  return {
    datasetId: options.datasetId,
    sourceRow: options.sourceRow,
    timestamp: timestampValue == null ? undefined : String(timestampValue),
    subjectType: "building",
    variables,
    provenance,
  };
}

export function summarizeRescastTimeseries(records: NormalizedRecord[]) {
  const numeric = (key: string) => records
    .map((record) => record.variables[key])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  const mean = (values: number[]) => values.length ? sum(values) / values.length : undefined;
  const peak = (values: number[]) => values.length ? Math.max(...values) : undefined;

  const electricityEnergy = numeric("electricityEnergyKWh");
  const hvacLoad = numeric("hvacLoadPowerKW");
  const indoor = numeric("indoorTempC");
  const outdoor = numeric("outdoorTempC");

  return {
    intervalCount: records.length,
    electricityEnergyKWh: sum(electricityEnergy),
    meanElectricityIntervalKWh: mean(electricityEnergy),
    peakHvacLoadKW: peak(hvacLoad),
    meanIndoorTempC: mean(indoor),
    meanOutdoorTempC: mean(outdoor),
    coolingDiscomfortDegreeHours: records.reduce((total, record) => {
      const indoorTemp = record.variables.indoorTempC;
      const setpoint = record.variables.coolingSetpointC;
      if (typeof indoorTemp !== "number" || typeof setpoint !== "number") return total;
      return total + Math.max(indoorTemp - setpoint, 0) * 0.25;
    }, 0),
  };
}
