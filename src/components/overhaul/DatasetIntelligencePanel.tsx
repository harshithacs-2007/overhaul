"use client";

import { useMemo } from "react";

type Observation = { field: string; value: string; numericValue: number | null; unit: string | null; confidence: number; sourceText?: string; notes?: string };
type Extraction = { sourceName?: string; observations?: Observation[]; warnings?: string[] };
type Series = { key: string; label: string; mean: number | null; p95: number | null; std: number | null; min: number | null; max: number | null; unit: string | null; missing: number | null };

function fmt(value: number | null, digits = 2) {
  return value == null || !Number.isFinite(value) ? "—" : value.toLocaleString("en-IN", { maximumFractionDigits: digits });
}

export default function DatasetIntelligencePanel({ extracts }: { extracts: Extraction[] }) {
  const analysis = useMemo(() => {
    const observations = extracts.flatMap((extract) => extract.observations || []).filter((row) => row.field.startsWith("dataset_"));
    if (!observations.length) return null;

    const find = (field: string) => observations.find((row) => row.field === field);
    const rowCount = find("dataset_row_count")?.numericValue ?? null;
    const columnCount = find("dataset_column_count")?.numericValue ?? null;
    const start = find("dataset_period_start");
    const end = find("dataset_period_end");
    const cadence = find("dataset_median_sampling_interval_hours");

    const bySeries = new Map<string, Series>();
    for (const observation of observations) {
      const match = observation.field.match(/^dataset_(.+)_(mean|p95|std|min|max|missing_fraction)$/);
      if (!match) continue;
      const [, key, metric] = match;
      const current = bySeries.get(key) || { key, label: key.replaceAll("_", " "), mean: null, p95: null, std: null, min: null, max: null, unit: observation.unit, missing: null };
      if (metric === "mean") current.mean = observation.numericValue;
      if (metric === "p95") current.p95 = observation.numericValue;
      if (metric === "std") current.std = observation.numericValue;
      if (metric === "min") current.min = observation.numericValue;
      if (metric === "max") current.max = observation.numericValue;
      if (metric === "missing_fraction") current.missing = observation.numericValue;
      if (!current.unit) current.unit = observation.unit;
      bySeries.set(key, current);
    }

    const series = [...bySeries.values()]
      .filter((item) => item.mean != null && item.std != null)
      .sort((a, b) => Math.abs((b.std || 0) / Math.max(Math.abs(b.mean || 0), 1e-9)) - Math.abs((a.std || 0) / Math.max(Math.abs(a.mean || 0), 1e-9)))
      .slice(0, 6);

    const warnings = extracts.flatMap((extract) => extract.warnings || []).filter((warning) => /dataset|sample|baseline/i.test(warning)).slice(0, 3);
    return { rowCount, columnCount, start, end, cadence, series, warnings };
  }, [extracts]);

  if (!analysis) return null;

  return (
    <section className="overflow-hidden border border-violet-300/15 bg-[#080b0c] shadow-[0_20px_90px_rgba(0,0,0,.18)]">
      <div className="border-b border-steel/10 px-5 py-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-violet-200">Dataset intelligence</p>
            <h2 className="mt-1 font-display text-3xl">What the uploaded data actually says.</h2>
            <p className="mt-2 max-w-3xl text-[10px] leading-5 text-steel">OVERHAUL computes dataset structure and variability deterministically first. AI interpretation sits on top of those statistics; no sample average is silently promoted to a design or annual baseline.</p>
          </div>
          <div className="flex flex-wrap gap-2 font-mono text-[7px] uppercase text-steel">
            <span className="border border-steel/15 px-3 py-2">{analysis.rowCount != null ? `${fmt(analysis.rowCount, 0)} rows` : "Rows unresolved"}</span>
            <span className="border border-steel/15 px-3 py-2">{analysis.columnCount != null ? `${fmt(analysis.columnCount, 0)} columns` : "Columns unresolved"}</span>
            {analysis.cadence?.numericValue != null ? <span className="border border-teal/20 px-3 py-2 text-teal">{fmt(analysis.cadence.numericValue, 2)} h cadence</span> : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-[.75fr_1.25fr]">
        <div className="border border-steel/10 bg-black/20 p-4">
          <p className="font-mono text-[7px] uppercase tracking-[0.12em] text-steel">Observed data window</p>
          <div className="mt-4 space-y-3">
            <DataRow label="Start" value={analysis.start?.value || "Not detected"} />
            <DataRow label="End" value={analysis.end?.value || "Not detected"} />
            <DataRow label="Source files" value={String(new Set(extracts.map((extract) => extract.sourceName).filter(Boolean)).size)} />
          </div>
          {analysis.warnings.map((warning) => <p key={warning} className="mt-4 border-l border-gold/30 pl-3 text-[8px] leading-4 text-steel">{warning}</p>)}
        </div>

        <div className="border border-steel/10 bg-black/20 p-4">
          <div className="flex items-center justify-between"><p className="font-mono text-[7px] uppercase tracking-[0.12em] text-steel">Most variable numeric series</p><span className="font-mono text-[7px] text-violet-200">derived from parsed rows</span></div>
          {analysis.series.length ? (
            <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[650px] text-left"><thead><tr className="border-b border-steel/10 font-mono text-[7px] uppercase text-steel"><th className="py-2 pr-3">Series</th><th className="px-2 py-2">Mean</th><th className="px-2 py-2">P95</th><th className="px-2 py-2">Std</th><th className="px-2 py-2">Range</th><th className="pl-2 py-2">Missing</th></tr></thead><tbody>{analysis.series.map((item) => <tr key={item.key} className="border-b border-steel/10 last:border-0 text-[9px] text-paper"><td className="py-3 pr-3">{item.label}</td><td className="px-2 py-3 font-mono">{fmt(item.mean)}{item.unit ? ` ${item.unit}` : ""}</td><td className="px-2 py-3 font-mono">{fmt(item.p95)}</td><td className="px-2 py-3 font-mono">{fmt(item.std)}</td><td className="px-2 py-3 font-mono">{fmt(item.min)} → {fmt(item.max)}</td><td className="pl-2 py-3 font-mono">{item.missing == null ? "—" : `${(item.missing * 100).toFixed(1)}%`}</td></tr>)}</tbody></table></div>
          ) : <p className="mt-4 text-[9px] text-steel">No numeric series with enough rows were established.</p>}
        </div>
      </div>
    </section>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-4 border-b border-steel/10 pb-3"><span className="font-mono text-[7px] uppercase text-steel">{label}</span><span className="max-w-[70%] break-all text-right text-[9px] text-paper">{value}</span></div>;
}
