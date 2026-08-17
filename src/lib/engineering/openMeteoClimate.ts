/**
 * Open-Meteo ClimateProvider — server-side only.
 * Never invents missing variables; marks unavailable explicitly.
 */

import type { ClimateProvider } from "./providers";
import type { ClimateQuery } from "./providers";
import {
  assessClimateCompleteness,
  type ClimateContext,
  type ClimateVariable,
} from "./climate";
import { externalData, unknownValue } from "./provenance";
import type { DataSourceMeta } from "./sources";
import { getSupabaseAdmin, locationKey } from "@/lib/supabase/server";

function meta(partial: Partial<DataSourceMeta> & Pick<DataSourceMeta, "dataset" | "originalUnit" | "normalizedUnit" | "geographicScope">): DataSourceMeta {
  return {
    source: "Open-Meteo",
    provider: "open-meteo-climate",
    version: "v1",
    retrievedAt: new Date().toISOString(),
    quality: "medium",
    license: "Open-Meteo non-commercial / CC where applicable — check current terms",
    ...partial,
  };
}

function unavailable(note: string): ClimateVariable {
  return {
    availability: "unavailable",
    data: null,
    note,
  };
}

function availableNumber(
  value: number,
  m: DataSourceMeta
): ClimateVariable {
  return {
    availability: "available",
    data: externalData(value, m.provider, m.dataset),
    meta: m,
  };
}

async function readCtxCache(lat: number, lon: number): Promise<ClimateContext | null> {
  try {
    const sb = getSupabaseAdmin();
    if (!sb) return null;
    const { data, error } = await sb
      .from("climate_context_cache")
      .select("*")
      .eq("location_key", locationKey(lat, lon))
      .maybeSingle();
    if (error || !data) return null;
    const age = Date.now() - new Date(data.fetched_at).getTime();
    if (age > 24 * 60 * 60 * 1000) return null;
    return data.payload as ClimateContext;
  } catch {
    return null;
  }
}

async function writeCtxCache(lat: number, lon: number, ctx: ClimateContext): Promise<void> {
  try {
    const sb = getSupabaseAdmin();
    if (!sb) return;
    await sb.from("climate_context_cache").upsert(
      {
        location_key: locationKey(lat, lon),
        latitude: lat,
        longitude: lon,
        payload: ctx,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "location_key" }
    );
  } catch {
    /* non-fatal */
  }
}

export class OpenMeteoClimateProvider implements ClimateProvider {
  readonly name = "open-meteo-climate";

  async getClimateContext(query: ClimateQuery): Promise<ClimateContext> {
    const { latitude: lat, longitude: lon } = query;
    const cached = await readCtxCache(lat, lon);
    if (cached) return cached;

    const warnings: string[] = [];
    const scope = `${lat.toFixed(2)},${lon.toFixed(2)}`;

    // Archive API — monthly means for a recent climatological year window
    let meanTemp: ClimateVariable = unavailable("Historical mean temperature not retrieved");
    let seasonal: ClimateVariable<import("./climate").ClimateSeriesPoint[]> = {
      availability: "unavailable",
      data: null,
      note: "Seasonal series not retrieved",
    };
    let humidity: ClimateVariable = unavailable("Humidity not retrieved");
    let wind: ClimateVariable = unavailable("Wind not retrieved");
    const solar: ClimateVariable = unavailable(
      "Solar radiation not retrieved from this provider call"
    );
    let coolDesign: ClimateVariable = unavailable("Cooling design temperature not derived");
    let heatDesign: ClimateVariable = unavailable("Heating design temperature not derived");
    let maxT: ClimateVariable = unavailable("Extreme max not retrieved");
    let minT: ClimateVariable = unavailable("Extreme min not retrieved");
    let future: ClimateContext["futureProjections"] = null;
    let current: ClimateVariable | null = null;

    try {
      const archiveUrl =
        `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
        `&start_date=2019-01-01&end_date=2023-12-31` +
        `&daily=temperature_2m_mean,temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean,windspeed_10m_mean` +
        `&timezone=auto`;
      const res = await fetch(archiveUrl, { next: { revalidate: 86400 } });
      if (!res.ok) {
        warnings.push(`Archive API HTTP ${res.status}`);
      } else {
        const json = (await res.json()) as {
          timezone?: string;
          daily?: {
            time?: string[];
            temperature_2m_mean?: (number | null)[];
            temperature_2m_max?: (number | null)[];
            temperature_2m_min?: (number | null)[];
            relative_humidity_2m_mean?: (number | null)[];
            windspeed_10m_mean?: (number | null)[];
          };
        };
        const means = (json.daily?.temperature_2m_mean ?? []).filter(
          (v): v is number => typeof v === "number"
        );
        const maxes = (json.daily?.temperature_2m_max ?? []).filter(
          (v): v is number => typeof v === "number"
        );
        const mins = (json.daily?.temperature_2m_min ?? []).filter(
          (v): v is number => typeof v === "number"
        );
        const rh = (json.daily?.relative_humidity_2m_mean ?? []).filter(
          (v): v is number => typeof v === "number"
        );
        const windVals = (json.daily?.windspeed_10m_mean ?? []).filter(
          (v): v is number => typeof v === "number"
        );

        if (means.length) {
          const avg = means.reduce((a, b) => a + b, 0) / means.length;
          meanTemp = availableNumber(
            avg,
            meta({
              dataset: "ERA5-land via Open-Meteo archive daily temperature_2m_mean 2019–2023",
              originalUnit: "°C",
              normalizedUnit: "°C",
              geographicScope: scope,
              effectiveAt: "2019-01-01/2023-12-31",
            })
          );
          // Seasonal: monthly averages of daily means
          const byMonth = new Map<number, number[]>();
          json.daily!.time!.forEach((t, i) => {
            const v = json.daily!.temperature_2m_mean![i];
            if (typeof v !== "number") return;
            const m = Number(t.slice(5, 7));
            if (!byMonth.has(m)) byMonth.set(m, []);
            byMonth.get(m)!.push(v);
          });
          const series = [...byMonth.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([m, vals]) => ({
              t: `month-${String(m).padStart(2, "0")}`,
              value: vals.reduce((a, b) => a + b, 0) / vals.length,
            }));
          seasonal = {
            availability: "available",
            data: externalData(series, "open-meteo-climate", "monthly mean temps"),
            series,
            meta: meta({
              dataset: "Monthly means from archive daily temperature_2m_mean",
              originalUnit: "°C",
              normalizedUnit: "°C",
              geographicScope: scope,
            }),
          };
        }

        if (maxes.length) {
          const sorted = [...maxes].sort((a, b) => b - a);
          const p99 = sorted[Math.max(0, Math.floor(sorted.length * 0.01))];
          coolDesign = availableNumber(
            p99,
            meta({
              dataset: "Approx cooling design = 99th pct daily max 2019–2023 (not ASHRAE station design)",
              originalUnit: "°C",
              normalizedUnit: "°C",
              geographicScope: scope,
              quality: "low",
            })
          );
          maxT = availableNumber(
            sorted[0],
            meta({
              dataset: "Observed daily max extreme 2019–2023",
              originalUnit: "°C",
              normalizedUnit: "°C",
              geographicScope: scope,
            })
          );
          warnings.push(
            "Cooling design temperature is a statistical proxy from archive maxima, not a published design dry-bulb"
          );
        }
        if (mins.length) {
          const sorted = [...mins].sort((a, b) => a - b);
          const p01 = sorted[Math.max(0, Math.floor(sorted.length * 0.01))];
          heatDesign = availableNumber(
            p01,
            meta({
              dataset: "Approx heating design = 1st pct daily min 2019–2023 (not ASHRAE station design)",
              originalUnit: "°C",
              normalizedUnit: "°C",
              geographicScope: scope,
              quality: "low",
            })
          );
          minT = availableNumber(
            sorted[0],
            meta({
              dataset: "Observed daily min extreme 2019–2023",
              originalUnit: "°C",
              normalizedUnit: "°C",
              geographicScope: scope,
            })
          );
        }
        if (rh.length) {
          humidity = availableNumber(
            rh.reduce((a, b) => a + b, 0) / rh.length,
            meta({
              dataset: "Mean relative humidity 2019–2023",
              originalUnit: "%",
              normalizedUnit: "%",
              geographicScope: scope,
            })
          );
        }
        if (windVals.length) {
          wind = availableNumber(
            windVals.reduce((a, b) => a + b, 0) / windVals.length,
            meta({
              dataset: "Mean windspeed_10m 2019–2023",
              originalUnit: "km/h",
              normalizedUnit: "km/h",
              geographicScope: scope,
            })
          );
        }
      }
    } catch (err) {
      warnings.push(
        `Archive fetch failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // Future CMIP6 — only if authoritative API responds
    try {
      const futUrl =
        `https://climate-api.open-meteo.com/v1/climate?latitude=${lat}&longitude=${lon}` +
        `&start_date=2035-01-01&end_date=2035-12-31&models=CMIP6` +
        `&daily=temperature_2m_max`;
      const res = await fetch(futUrl, { next: { revalidate: 86400 } });
      if (res.ok) {
        const json = (await res.json()) as {
          daily?: { time?: string[]; temperature_2m_max?: number[] };
        };
        const vals = json.daily?.temperature_2m_max ?? [];
        const times = json.daily?.time ?? [];
        if (vals.length && times.length === vals.length) {
          const series = times.map((t, i) => ({ t, value: vals[i] }));
          future = {
            availability: "available",
            data: externalData(series, "open-meteo-cmip6", "CMIP6 2035 daily max"),
            series,
            meta: meta({
              provider: "open-meteo-cmip6",
              dataset: "CMIP6 daily temperature_2m_max 2035",
              originalUnit: "°C",
              normalizedUnit: "°C",
              geographicScope: scope,
              quality: "medium",
            }),
          };
        } else {
          future = {
            availability: "unavailable",
            data: null,
            note: "CMIP6 response lacked usable series",
          };
        }
      } else {
        future = {
          availability: "unavailable",
          data: null,
          note: `CMIP6 HTTP ${res.status}`,
        };
      }
    } catch {
      future = {
        availability: "unavailable",
        data: null,
        note: "CMIP6 provider failure",
      };
    }

    // Optional current observation — explicitly insufficient alone
    try {
      const curUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m`;
      const res = await fetch(curUrl, { next: { revalidate: 3600 } });
      if (res.ok) {
        const json = (await res.json()) as { current?: { temperature_2m?: number } };
        if (typeof json.current?.temperature_2m === "number") {
          current = availableNumber(
            json.current.temperature_2m,
            meta({
              provider: "open-meteo-forecast",
              dataset: "current temperature_2m",
              originalUnit: "°C",
              normalizedUnit: "°C",
              geographicScope: scope,
              quality: "high",
            })
          );
          warnings.push(
            "Current observation included for context only — insufficient for engineering design"
          );
        }
      }
    } catch {
      current = { availability: "unavailable", data: null, note: "Current weather unavailable" };
    }

    const ctx: ClimateContext = {
      location: {
        coordinates: { latitude: lat, longitude: lon },
        countryCode: query.countryCode,
        displayName: scope,
      },
      historical: { meanTempC: meanTemp, seasonalTempC: seasonal },
      humidity,
      solarRadiation: solar,
      wind,
      designConditions: {
        heatingDesignTempC: heatDesign,
        coolingDesignTempC: coolDesign,
      },
      extremes: { maxTempC: maxT, minTempC: minT },
      futureProjections: future,
      currentObservation: current,
      retrievedAt: new Date().toISOString(),
      provider: this.name,
      warnings,
      completeness: { engineeringUsable: false, missing: [] },
    };
    ctx.completeness = assessClimateCompleteness(ctx);
    // Ensure unknownValue path unused placeholder doesn't leak invented numbers
    void unknownValue;
    await writeCtxCache(lat, lon, ctx);
    return ctx;
  }
}
