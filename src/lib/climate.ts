import { getSupabaseAdmin, locationKey } from "@/lib/supabase/server";
import type { ClimateSnapshot } from "@/lib/calculations/pipeline";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

async function readCache(
  lat: number,
  lon: number,
  kind: "current" | "future_2035"
): Promise<ClimateSnapshot | null> {
  try {
    const sb = getSupabaseAdmin();
    if (!sb) return null;
    const key = locationKey(lat, lon);
    const { data, error } = await sb
      .from("climate_cache")
      .select("*")
      .eq("location_key", key)
      .eq("kind", kind)
      .maybeSingle();
    if (error || !data) return null;
    const age = Date.now() - new Date(data.fetched_at).getTime();
    if (age > CACHE_TTL_MS) return null;
    return {
      outdoorTempC: data.outdoor_temp_c,
      source: (data.payload as { source?: string })?.source ?? "supabase-cache",
      fetchedAt: data.fetched_at,
      isFuture: kind === "future_2035",
      yearLabel: kind === "future_2035" ? "2035 projected" : "Today",
    };
  } catch {
    return null;
  }
}

async function writeCache(
  lat: number,
  lon: number,
  kind: "current" | "future_2035",
  outdoorTempC: number,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const sb = getSupabaseAdmin();
    if (!sb) return;
    const key = locationKey(lat, lon);
    await sb.from("climate_cache").upsert(
      {
        location_key: key,
        latitude: lat,
        longitude: lon,
        kind,
        outdoor_temp_c: outdoorTempC,
        payload,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "location_key,kind" }
    );
  } catch {
    // non-fatal
  }
}

/** Fallback when API unavailable — documented assumption */
export function climateFallback(
  isFuture: boolean,
  lat: number
): ClimateSnapshot {
  // Rough latitude-based cooling-season proxy (documented assumption)
  const base = Math.max(28, 38 - Math.abs(lat) * 0.15);
  return {
    outdoorTempC: isFuture ? base + 1.5 : base,
    source: "fallback (documented assumption — Open-Meteo unavailable)",
    fetchedAt: new Date().toISOString(),
    isFuture,
    yearLabel: isFuture ? "2035 projected" : "Today",
  };
}

export async function fetchCurrentClimate(
  lat: number,
  lon: number
): Promise<ClimateSnapshot> {
  try {
    const cached = await readCache(lat, lon, "current");
    if (cached) return cached;

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m&timezone=auto`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) throw new Error(`Open-Meteo forecast HTTP ${res.status}`);
    const json = (await res.json()) as {
      current?: { temperature_2m?: number };
    };
    const temp = json.current?.temperature_2m;
    if (typeof temp !== "number") throw new Error("Missing temperature_2m");

    const snap: ClimateSnapshot = {
      outdoorTempC: temp,
      source: "Open-Meteo Weather API (current temperature_2m)",
      fetchedAt: new Date().toISOString(),
      isFuture: false,
      yearLabel: "Today",
    };
    await writeCache(lat, lon, "current", temp, {
      source: snap.source,
      raw: json,
    });
    return snap;
  } catch {
    return climateFallback(false, lat);
  }
}

/**
 * Future climate ~2035 from Open-Meteo Climate API (CMIP6).
 * Uses mean of daily max as cooling-design proxy.
 */
export async function fetchFutureClimate2035(
  lat: number,
  lon: number
): Promise<ClimateSnapshot> {
  try {
    const cached = await readCache(lat, lon, "future_2035");
    if (cached) return cached;

    const url =
      `https://climate-api.open-meteo.com/v1/climate?latitude=${lat}&longitude=${lon}` +
      `&start_date=2035-01-01&end_date=2035-12-31&models=CMIP6` +
      `&daily=temperature_2m_max,temperature_2m_min`;
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) throw new Error(`Open-Meteo climate HTTP ${res.status}`);
    const json = (await res.json()) as {
      daily?: { temperature_2m_max?: number[] };
    };
    const maxima = json.daily?.temperature_2m_max ?? [];
    if (!maxima.length) throw new Error("No CMIP6 daily maxima");

    // Cooling-season proxy: mean of warmest quartile of daily maxima
    const sorted = [...maxima].sort((a, b) => b - a);
    const warm = sorted.slice(0, Math.max(1, Math.floor(sorted.length * 0.25)));
    const temp = warm.reduce((s, t) => s + t, 0) / warm.length;

    const snap: ClimateSnapshot = {
      outdoorTempC: temp,
      source:
        "Open-Meteo Climate API CMIP6 — mean of warmest-quartile daily max (2035)",
      fetchedAt: new Date().toISOString(),
      isFuture: true,
      yearLabel: "2035 projected",
    };
    await writeCache(lat, lon, "future_2035", temp, {
      source: snap.source,
      sampleSize: maxima.length,
    });
    return snap;
  } catch {
    return climateFallback(true, lat);
  }
}
