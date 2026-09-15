"use client";

import { useEffect, useState } from "react";

type Assessment = { siteName?: string | null; context?: { siteName?: string | null } };
type ClimateState = { location: string; temperature: number; humidity: number; min: number; max: number; rain: number } | null;

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
        const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`).then((r) => r.json()) as { results?: Array<{ name: string; latitude: number; longitude: number; country?: string }> };
        const place = geo.results?.[0];
        if (!place) return;
        const weather = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m&daily=temperature_2m_min,temperature_2m_max,precipitation_sum&forecast_days=7&timezone=auto`).then((r) => r.json()) as { current?: { temperature_2m?: number; relative_humidity_2m?: number }; daily?: { temperature_2m_min?: number[]; temperature_2m_max?: number[]; precipitation_sum?: number[] } };
        const mins = weather.daily?.temperature_2m_min || []; const maxs = weather.daily?.temperature_2m_max || []; const rains = weather.daily?.precipitation_sum || [];
        const next: ClimateState = { location: `${place.name}${place.country ? `, ${place.country}` : ""}`, temperature: Number(weather.current?.temperature_2m), humidity: Number(weather.current?.relative_humidity_2m), min: mins.length ? Math.min(...mins) : NaN, max: maxs.length ? Math.max(...maxs) : NaN, rain: rains.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0) };
        if (![next.temperature, next.humidity].every(Number.isFinite)) return;
        setClimate(next);
        sessionStorage.setItem("overhaul:climate-context", JSON.stringify(next));
      } catch {
        // Regional context is advisory only. Failure never affects the engineering model.
      } finally { setLoading(false); }
    };
    void load();
    const sync = () => void load();
    window.addEventListener("overhaul:evidence-change", sync);
    return () => window.removeEventListener("overhaul:evidence-change", sync);
  }, []);

  if (!climate && !loading) return null;
  return <div className="pointer-events-none fixed right-4 top-4 z-40 max-w-[330px] border border-teal/25 bg-[#070b0b]/92 px-4 py-3 shadow-2xl backdrop-blur no-print">
    {loading ? <div><p className="font-mono text-[8px] uppercase tracking-[0.14em] text-teal">Regional context</p><p className="mt-1 text-[9px] text-steel">Resolving site climate context…</p></div> : climate ? <div><div className="flex items-center justify-between gap-4"><p className="font-mono text-[8px] uppercase tracking-[0.14em] text-teal">Regional context</p><span className="font-mono text-[7px] uppercase text-steel">Advisory</span></div><p className="mt-1 text-[10px] text-paper">{climate.location}</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[8px] text-steel"><span>{climate.temperature.toFixed(1)}°C now</span><span>{climate.humidity.toFixed(0)}% RH</span><span>7d {climate.min.toFixed(0)}–{climate.max.toFixed(0)}°C</span></div><p className="mt-2 text-[8px] leading-4 text-steel">Climate context can shape pathway priority. Engineering savings still require explicit site/design evidence.</p></div> : null}
  </div>;
}
