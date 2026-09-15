"use client";

import { useEffect, useState } from "react";

type Assessment = { siteName?: string | null; context?: { siteName?: string | null } };
type ClimateState = { location: string; temperature: number; humidity: number; min: number; max: number; rain: number; source: string; fetchedAt: string } | null;

function readAssessment(): Assessment | null { try { return JSON.parse(sessionStorage.getItem("overhaul:assessment") || "null"); } catch { return null; } }

export default function RegionalClimateLens() {
  const [climate, setClimate] = useState<ClimateState>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      const assessment = readAssessment();
      const query = assessment?.siteName || assessment?.context?.siteName;
      if (!query) return;
      setLoading(true);
      try {
        const geoResponse = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`);
        if (!geoResponse.ok) throw new Error(`Geocoding HTTP ${geoResponse.status}`);
        const geo = await geoResponse.json() as { results?: Array<{ name: string; latitude: number; longitude: number; country?: string }> };
        const place = geo.results?.[0];
        if (!place) return;
        const weatherResponse = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m&daily=temperature_2m_min,temperature_2m_max,precipitation_sum&forecast_days=7&timezone=auto`);
        if (!weatherResponse.ok) throw new Error(`Forecast HTTP ${weatherResponse.status}`);
        const weather = await weatherResponse.json() as { current?: { temperature_2m?: number; relative_humidity_2m?: number }; daily?: { temperature_2m_min?: number[]; temperature_2m_max?: number[]; precipitation_sum?: number[] } };
        const mins = weather.daily?.temperature_2m_min || [];
        const maxs = weather.daily?.temperature_2m_max || [];
        const rains = weather.daily?.precipitation_sum || [];
        const next: ClimateState = {
          location: `${place.name}${place.country ? `, ${place.country}` : ""}`,
          temperature: Number(weather.current?.temperature_2m),
          humidity: Number(weather.current?.relative_humidity_2m),
          min: mins.length ? Math.min(...mins) : NaN,
          max: maxs.length ? Math.max(...maxs) : NaN,
          rain: rains.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0),
          source: "Open-Meteo current weather + 7-day forecast",
          fetchedAt: new Date().toISOString(),
        };
        if (![next.temperature, next.humidity, next.min, next.max].every(Number.isFinite)) return;
        setClimate(next);
        sessionStorage.setItem("overhaul:climate-context", JSON.stringify(next));
        window.dispatchEvent(new CustomEvent("overhaul:climate-change"));
      } catch {
        // Regional context is advisory only. Failure never affects the engineering model.
      } finally { setLoading(false); }
    };
    void load();
    const sync = () => void load();
    window.addEventListener("overhaul:evidence-change", sync);
    window.addEventListener("overhaul:assessment-change", sync);
    return () => {
      window.removeEventListener("overhaul:evidence-change", sync);
      window.removeEventListener("overhaul:assessment-change", sync);
    };
  }, []);

  if (!climate && !loading) return null;
  return <div className="pointer-events-none fixed right-4 top-4 z-40 max-w-[350px] border border-teal/25 bg-[#070b0b]/92 px-4 py-3 shadow-2xl backdrop-blur no-print">
    {loading ? <div><p className="font-mono text-[8px] uppercase tracking-[0.14em] text-teal">Regional context</p><p className="mt-1 text-[9px] text-steel">Resolving site climate context…</p></div> : climate ? <div><div className="flex items-center justify-between gap-4"><p className="font-mono text-[8px] uppercase tracking-[0.14em] text-teal">Regional context</p><span className="font-mono text-[7px] uppercase text-steel">Live • advisory</span></div><p className="mt-1 text-[10px] text-paper">{climate.location}</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[8px] text-steel"><span>{climate.temperature.toFixed(1)}°C now</span><span>{climate.humidity.toFixed(0)}% RH</span><span>7d {climate.min.toFixed(0)}–{climate.max.toFixed(0)}°C</span><span>{climate.rain.toFixed(0)} mm rain</span></div><p className="mt-2 text-[8px] leading-4 text-steel">Used as regional operating context and stress-test evidence. It does not overwrite explicit design conditions or create a savings multiplier.</p><p className="mt-2 font-mono text-[7px] text-steel/70">{climate.source} · {new Date(climate.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p></div> : null}
  </div>;
}
