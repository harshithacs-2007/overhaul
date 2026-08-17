/**
 * Location resolution + ClimateContext.
 * City name ≠ exact building location. Current weather alone is insufficient.
 */

import type { ProvenancedValue } from "./provenance";
import type { DataSourceMeta } from "./sources";

export interface GeoCoordinates {
  latitude: number;
  longitude: number;
}

export interface ResolvedLocation {
  /** Free-text address or place query as entered */
  query: string;
  /** Structured label from geocoder — not claimed as parcel centroid unless stated */
  displayName: string;
  coordinates: GeoCoordinates;
  countryCode?: string;
  countryName?: string;
  admin1?: string;
  timezone?: string;
  /** Explicit: approximate place vs address-level */
  precision: "address" | "place" | "city" | "region" | "unknown";
  geocodeMeta?: DataSourceMeta;
  warnings: string[];
}

export type ClimateVariableAvailability =
  | "available"
  | "unavailable"
  | "partial"
  | "not_requested";

export interface ClimateSeriesPoint {
  /** ISO date or month key */
  t: string;
  value: number;
}

export interface ClimateVariable<T = number> {
  availability: ClimateVariableAvailability;
  data: ProvenancedValue<T> | null;
  series?: ClimateSeriesPoint[];
  meta?: DataSourceMeta;
  note?: string;
}

export interface ClimateContext {
  location: Pick<ResolvedLocation, "coordinates" | "timezone" | "countryCode" | "displayName">;
  /** Historical / long-term context — required for engineering readiness assessment */
  historical: {
    meanTempC: ClimateVariable;
    seasonalTempC: ClimateVariable<ClimateSeriesPoint[]>;
  };
  humidity: ClimateVariable;
  solarRadiation: ClimateVariable;
  wind: ClimateVariable;
  designConditions: {
    heatingDesignTempC: ClimateVariable;
    coolingDesignTempC: ClimateVariable;
  };
  extremes: {
    maxTempC: ClimateVariable;
    minTempC: ClimateVariable;
  };
  /** Only when authoritative projection source exists */
  futureProjections: ClimateVariable<ClimateSeriesPoint[]> | null;
  /** Optional observational snapshot — insufficient alone */
  currentObservation: ClimateVariable | null;
  retrievedAt: string;
  provider: string;
  warnings: string[];
  completeness: {
    engineeringUsable: boolean;
    missing: string[];
  };
}

export function assessClimateCompleteness(ctx: ClimateContext): ClimateContext["completeness"] {
  const missing: string[] = [];
  const need = [
    ["historical.meanTempC", ctx.historical.meanTempC],
    ["designConditions.coolingDesignTempC", ctx.designConditions.coolingDesignTempC],
  ] as const;
  for (const [name, v] of need) {
    if (v.availability !== "available" || v.data?.value == null) missing.push(name);
  }
  // Current-only is never enough
  if (
    ctx.currentObservation?.availability === "available" &&
    missing.length > 0 &&
    ctx.historical.meanTempC.availability !== "available"
  ) {
    missing.push("historical climate (current weather alone is insufficient)");
  }
  return {
    engineeringUsable: missing.length === 0,
    missing,
  };
}
