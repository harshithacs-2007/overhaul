"use client";

import { useEffect, useState } from "react";

type DatasetHour = { timestamp: string; outdoorTempC: number; solarIrradianceKWhM2: number };
type StoredClimate = { location: string; latitude: number; longitude: number; year: number; source: string; fetchedAt: string; hourlySeries?: DatasetHour[] };
type Assessment = { siteName?: string | null; context?: { siteName?: string | null } };

function readAssessment(): Assessment | null { try { return JSON.parse(sessionStorage.getItem("overhaul:assessment") || "null"); } catch { return null; } }

export default function ClimateDatasetBridge() {
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [count, setCount] = useState(0);
  const [location, setLocation] = useState("");

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const assessment = readAssessment();
      const query = assessment?.siteName || assessment?.context?.siteName;
      if (!query || query.length < 2) return;
      setStatus("loading");
      try {
        const geo = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
        if (!geo.ok) throw new Error("Geocoding failed");
        const geoPayload = await geo.json() as { results?: Array<{ label: string; latitude: number; longitude: number }> };
        const place = geoPayload.results?.[0];
        if (!place) throw new Error("Location could not be resolved");
        const climate = await fetch(`/api/climate/nasa-power?latitude=${place.latitude}&longitude=${place.longitude}&year=2025`);
        if (!climate.ok) throw new Error("NASA POWER dataset unavailable");
        const payload = await climate.json() as { series?: DatasetHour[]; year: number; source: string; latitude: number; longitude: number };
        if (!payload.series?.length || payload.series.length < 8000) throw new Error("Incomplete NASA POWER annual series");
        const stored: StoredClimate = { location: place.label, latitude: payload.latitude, longitude: payload.longitude, year: payload.year, source: payload.source, fetchedAt: new Date().toISOString(), hourlySeries: payload.series };
        if (cancelled) return;
        sessionStorage.setItem("overhaul:climate-context", JSON.stringify(stored));
        setCount(payload.series.length);
        setLocation(place.label);
        setStatus("ready");
        window.dispatchEvent(new CustomEvent("overhaul:climate-change"));
      } catch {
        if (!cancelled) setStatus("error");
      }
    };
    void run();
    return () => { cancelled = true; };
  }, []);

  if (status === "idle") return null;
  return <section className="border border-violet-200/15 bg-[#09090d] p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-mono text-[8px] uppercase tracking-[.18em] text-violet-200">Climate dataset bridge</p><h2 className="mt-1 font-display text-2xl">Real hourly boundary conditions.</h2></div><span className={`font-mono text-[8px] uppercase ${status === "ready" ? "text-teal" : status === "error" ? "text-amber-200" : "text-steel"}`}>{status === "ready" ? `${count.toLocaleString()} hourly points` : status}</span></div>
    {status === "ready" ? <p className="mt-3 text-[9px] leading-5 text-steel">{location} · NASA POWER Sustainable Buildings community · 2025 hourly T2M + ALLSKY_SFC_SW_DWN. This series is used as the annual outdoor boundary; it is not a generic savings multiplier.</p> : status === "loading" ? <p className="mt-3 text-[9px] text-steel">Resolving the site and loading a complete historical year…</p> : <p className="mt-3 text-[9px] text-amber-200">The annual climate boundary could not be loaded. Annual building-energy calculations remain blocked rather than substituted with a guessed climate.</p>}
  </section>;
}
