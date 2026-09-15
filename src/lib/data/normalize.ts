import type { NormalizedRecord } from "./types";

const COLUMN_ALIASES: Record<string, string[]> = {
  timestamp: ["timestamp", "datetime", "date_time", "time", "date"],
  latitude: ["latitude", "lat"],
  longitude: ["longitude", "lon", "lng"],
  temperatureC: ["temperature", "temperature_c", "temp", "temp_c", "air_temperature"],
  relativeHumidity: ["relative_humidity", "rh", "humidity", "relativehumidity"],
  powerKw: ["power_kw", "power", "electrical_power", "electric_power", "kw"],
  energyKwh: ["energy_kwh", "energy", "electricity", "kwh"],
  coolingLoadKw: ["cooling_load_kw", "cooling_load", "load_kw", "cooling_load_ton"],
  heatingLoadKw: ["heating_load_kw", "heating_load"],
  flowRate: ["flow_rate", "flow", "airflow", "water_flow"],
};

function normalizedKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function findColumn(headers: string[], aliases: string[]): string | undefined {
  const normalized = new Map(headers.map((header) => [normalizedKey(header), header]));
  for (const alias of aliases) {
    const found = normalized.get(normalizedKey(alias));
    if (found) return found;
  }
  return undefined;
}

export interface TabularNormalizationOptions {
  datasetId: string;
  sourcePath: string;
  subjectType?: NormalizedRecord["subjectType"];
  confidence?: NormalizedRecord["provenance"][number]["confidence"];
  region?: string;
}

/**
 * Converts one tabular row into OVERHAUL's stable engineering representation.
 * Raw field names remain in provenance so downstream calculations can audit the source.
 */
export function normalizeTabularRow(
  row: Record<string, unknown>,
  options: TabularNormalizationOptions,
  sourceRow?: number,
): NormalizedRecord {
  const headers = Object.keys(row);
  const variables: NormalizedRecord["variables"] = {};
  const provenance: NormalizedRecord["provenance"] = [];

  for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
    const sourceField = findColumn(headers, aliases);
    if (!sourceField) continue;
    const raw = row[sourceField];
    const numeric = asNumber(raw);
    variables[canonical] = numeric ?? (raw == null ? null : String(raw));
    provenance.push({
      sourcePath: options.sourcePath,
      sourceField,
      confidence: options.confidence ?? "measured",
    });
  }

  // Preserve useful fields not covered by the canonical aliases without guessing units.
  for (const [field, value] of Object.entries(row)) {
    if (provenance.some((item) => item.sourceField === field)) continue;
    const numeric = asNumber(value);
    variables[field] = numeric ?? (value == null ? null : String(value));
    provenance.push({
      sourcePath: options.sourcePath,
      sourceField: field,
      confidence: options.confidence ?? "measured",
    });
  }

  const timestampField = findColumn(headers, COLUMN_ALIASES.timestamp);
  const latField = findColumn(headers, COLUMN_ALIASES.latitude);
  const lonField = findColumn(headers, COLUMN_ALIASES.longitude);
  const latitude = latField ? asNumber(row[latField]) : null;
  const longitude = lonField ? asNumber(row[lonField]) : null;

  return {
    datasetId: options.datasetId,
    sourceRow,
    timestamp: timestampField && row[timestampField] != null ? String(row[timestampField]) : undefined,
    location:
      latitude != null || longitude != null || options.region
        ? {
            latitude: latitude ?? undefined,
            longitude: longitude ?? undefined,
            region: options.region,
          }
        : undefined,
    subjectType: options.subjectType,
    variables,
    provenance,
  };
}

export function normalizeTabularRows(
  rows: Record<string, unknown>[],
  options: TabularNormalizationOptions,
): NormalizedRecord[] {
  return rows.map((row, index) => normalizeTabularRow(row, options, index + 1));
}
