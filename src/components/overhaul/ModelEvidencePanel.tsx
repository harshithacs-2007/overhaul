"use client";

import { useEffect, useState } from "react";
import { loadRescastModel, rescastSurrogateStatus } from "@/lib/ml/rescastSurrogate";
import { loadRescastTimeseriesModel, rescastTimeseriesStatus } from "@/lib/ml/rescastTimeseriesSurrogate";

export default function ModelEvidencePanel() {
  const [status, setStatus] = useState({ building: rescastSurrogateStatus(), timeseries: rescastTimeseriesStatus() });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const responses = await Promise.all([
          fetch("/models/rescast_surrogate.json", { cache: "no-store" }),
          fetch("/models/rescast_timeseries_surrogate.json", { cache: "no-store" }),
        ]);
        if (responses[0].ok) { try { loadRescastModel(await responses[0].json()); } catch {} }
        if (responses[1].ok) { try { loadRescastTimeseriesModel(await responses[1].json()); } catch {} }
      } finally {
        if (!cancelled) setStatus({ building: rescastSurrogateStatus(), timeseries: rescastTimeseriesStatus() });
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const active = status.timeseries.available || status.building.available;
  const timeseries = status.timeseries;
  return <section className="border border-violet-300/12 bg-[#080b0c] px-5 py-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="font-mono text-[7px] uppercase tracking-[0.15em] text-violet-200">Model layer</p>
        <p className="mt-1 text-[10px] text-paper">{active ? "Learned screening model loaded" : "No learned artifact loaded"}</p>
        <p className="mt-1 text-[8px] text-steel">{timeseries.available ? `${timeseries.trainingDataset} · held-out R² ${timeseries.r2.toFixed(3)} · MAE ${timeseries.mae.toFixed(3)}` : status.building.available ? `${status.building.trainingDataset} · ${status.building.targets.length} target(s)` : "Deterministic physics remains authoritative."}</p>
      </div>
      <div className="flex items-center gap-2 font-mono text-[7px] uppercase"><span className={`border px-2.5 py-1.5 ${active ? "border-violet-200/25 text-violet-200" : "border-steel/15 text-steel"}`}>{active ? "Screening" : "Fallback"}</span><span className="border border-teal/20 px-2.5 py-1.5 text-teal">Physics authority</span></div>
    </div>
    {timeseries.available && !timeseries.beatsMeanBaseline ? <p className="mt-3 border-l border-gold/30 pl-3 text-[7px] leading-4 text-steel">The learned time-series model does not beat its held-out mean baseline, so it is not treated as a strong screening signal.</p> : null}
  </section>;
}
