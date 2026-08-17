/** Geocoding — address/place → coordinates. City ≠ exact building location. */

import type { ResolvedLocation } from "./climate";
import type { DataSourceMeta } from "./sources";

export interface GeocodeResult {
  ok: true;
  location: ResolvedLocation;
  alternatives: ResolvedLocation[];
}

export interface GeocodeFailure {
  ok: false;
  error: "invalid_query" | "ambiguous" | "not_found" | "provider_failure" | "rate_limited";
  message: string;
  alternatives?: ResolvedLocation[];
}

function geocodeMeta(): DataSourceMeta {
  return {
    source: "Open-Meteo Geocoding API",
    provider: "open-meteo-geocoding",
    dataset: "geocoding-api.open-meteo.com/v1/search",
    version: "v1",
    retrievedAt: new Date().toISOString(),
    geographicScope: "global",
    originalUnit: "degrees",
    normalizedUnit: "degrees",
    quality: "medium",
  };
}

function precisionFromResult(r: {
  feature_code?: string;
  rank?: number;
}): ResolvedLocation["precision"] {
  const code = (r.feature_code ?? "").toUpperCase();
  if (code.startsWith("PPLX") || code === "PPL") return "city";
  if (code.startsWith("PPL")) return "place";
  if (code.startsWith("ADM")) return "region";
  if (code.startsWith("RD") || code.startsWith("BLDG")) return "address";
  return "unknown";
}

export async function resolveLocationQuery(
  query: string
): Promise<GeocodeResult | GeocodeFailure> {
  const q = query.trim();
  if (q.length < 2) {
    return { ok: false, error: "invalid_query", message: "Enter a more specific location query" };
  }
  if (q.length > 200) {
    return { ok: false, error: "invalid_query", message: "Query too long" };
  }

  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en&format=json`;
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (res.status === 429) {
      return { ok: false, error: "rate_limited", message: "Geocoder rate limited" };
    }
    if (!res.ok) {
      return {
        ok: false,
        error: "provider_failure",
        message: `Geocoder HTTP ${res.status}`,
      };
    }
    const json = (await res.json()) as {
      results?: Array<{
        id: number;
        name: string;
        latitude: number;
        longitude: number;
        country_code?: string;
        country?: string;
        admin1?: string;
        timezone?: string;
        feature_code?: string;
      }>;
    };
    const results = json.results ?? [];
    if (!results.length) {
      return { ok: false, error: "not_found", message: "No matching locations" };
    }

    const mapped: ResolvedLocation[] = results.map((r) => ({
      query: q,
      displayName: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
      coordinates: { latitude: r.latitude, longitude: r.longitude },
      countryCode: r.country_code,
      countryName: r.country,
      admin1: r.admin1,
      timezone: r.timezone,
      precision: precisionFromResult(r),
      geocodeMeta: geocodeMeta(),
      warnings: [
        "Geocoded place is not guaranteed to be the building parcel centroid",
      ],
    }));

    if (mapped.length > 1) {
      // Still return top hit but flag ambiguous
      return {
        ok: true,
        location: mapped[0],
        alternatives: mapped.slice(1),
      };
    }

    return { ok: true, location: mapped[0], alternatives: [] };
  } catch (err) {
    return {
      ok: false,
      error: "provider_failure",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
