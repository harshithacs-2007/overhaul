import type { NormalizedRecord } from "./types";
import type { EvidenceSource, ShadowObservation } from "../engineering/digitalShadow";

const SOURCE_MAP: Record<NormalizedRecord["provenance"][number]["confidence"], EvidenceSource> = {
  measured: "measured",
  provided: "document",
  inferred: "inferred",
  derived: "inferred",
};

const KEY_ALIASES: Record<string, string> = {
  power: "power_kw",
  power_kw: "power_kw",
  electrical_power_kw: "power_kw",
  demand_kw: "power_kw",
  load: "load_kw",
  load_kw: "load_kw",
  thermal_load_kw: "load_kw",
  capacity_kw: "rated_capacity_kw",
  rated_capacity_kw: "rated_capacity_kw",
  supply_temp: "supply_temp_c",
  supply_temp_c: "supply_temp_c",
  supply_temperature_c: "supply_temp_c",
  return_temp: "return_temp_c",
  return_temp_c: "return_temp_c",
  return_temperature_c: "return_temp_c",
  flow: "flow_m3h",
  flow_m3h: "flow_m3h",
  airflow_m3h: "flow_m3h",
  flow_m3_per_h: "flow_m3h",
};

function canonicalKey(key: string): string | null {
  const normalized = key.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return KEY_ALIASES[normalized] ?? null;
}

function bestProvenance(record: NormalizedRecord, field: string) {
  return record.provenance
    .filter((entry) => !entry.sourceField || entry.sourceField === field)
    .sort((a, b) => {
      const priority = { measured: 4, provided: 3, inferred: 2, derived: 1 } as const;
      return priority[b.confidence] - priority[a.confidence];
    })[0];
}

export function normalizedRecordToShadowObservations(
  record: NormalizedRecord,
): ShadowObservation[] {
  const observations: ShadowObservation[] = [];

  for (const [rawKey, rawValue] of Object.entries(record.variables)) {
    const key = canonicalKey(rawKey);
    if (!key || typeof rawValue !== "number" || !Number.isFinite(rawValue)) continue;

    const provenance = bestProvenance(record, rawKey);
    const source = provenance ? SOURCE_MAP[provenance.confidence] : "unknown";
    const unitByKey: Record<string, string> = {
      power_kw: "kW",
      load_kw: "kW",
      rated_capacity_kw: "kW",
      supply_temp_c: "°C",
      return_temp_c: "°C",
      flow_m3h: "m³/h",
    };

    observations.push({
      key,
      value: rawValue,
      unit: unitByKey[key] ?? "",
      source,
      confidence: provenance
        ? provenance.confidence === "measured"
          ? 1
          : provenance.confidence === "provided"
            ? 0.9
            : provenance.confidence === "inferred"
              ? 0.7
              : 0.6
        : 0.4,
      timestamp: record.timestamp,
    });
  }

  return observations;
}

export function normalizedRecordsToShadowObservations(
  records: NormalizedRecord[],
): ShadowObservation[] {
  return records.flatMap(normalizedRecordToShadowObservations);
}
