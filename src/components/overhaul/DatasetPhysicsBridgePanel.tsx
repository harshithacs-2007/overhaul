"use client";

import { useMemo, useState } from "react";

type Observation = { field: string; numericValue: number | null; unit: string | null; confidence?: number; sourceText?: string; notes?: string };
type Extraction = { sourceName?: string; evidenceId?: string; sourceKind?: string; observations?: Observation[] };
type Values = Record<string, number | string | null>;

function fmt(v: number) { return v.toLocaleString("en-IN", { maximumFractionDigits: 3 }); }
function canonical(v: string) { return v.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }

const CANDIDATES = [
  { match: /(?:^|_)load_kw_(?:mean|p95)$/, target: "load_kw", label: "Operating load", guard: "sample statistic" },
  { match: /(?:^|_)power_kw_(?:mean|p95)$/, target: "power_kw", label: "Observed electrical power", guard: "sample statistic" },
  { match: /(?:^|_)capacity_kw_(?:mean|p95)$/, target: "capacity_kw", label: "Rated capacity", guard: "dataset field summary" },
  { match: /(?:^|_)(?:cop|efficiency)_(?:mean|p95)$/, target: "efficiency", label: "Efficiency / COP", guard: "dataset field summary" },
  { match: /(?:^|_)runtime_hours_(?:mean|p95)$/, target: "annual_hours", label: "Runtime", guard: "sample statistic" },
  { match: /(?:^|_)tariff_inr_per_kwh_(?:mean|p95)$/, target: "electricity_rate_inr_per_kwh", label: "Electricity tariff", guard: "dataset field summary" },
];

export default function DatasetPhysicsBridgePanel({ extracts, values }: { extracts: Extraction[]; values: Values }) {
  const [promoted, setPromoted] = useState<string | null>(null);
  const candidates = useMemo(() => {
    const rows: Array<{ source: string; field: string; value: number; unit: string | null; target: string; label: string; guard: string }> = [];
    for (const extraction of extracts) for (const observation of extraction.observations || []) {
      if (observation.numericValue == null || !Number.isFinite(observation.numericValue)) continue;
      const field = canonical(observation.field);
      if (!field.startsWith("dataset_")) continue;
      const match = CANDIDATES.find((x) => x.match.test(field.slice("dataset_".length)));
      if (!match) continue;
      rows.push({ source: extraction.sourceName || extraction.evidenceId || "Dataset", field, value: observation.numericValue, unit: observation.unit, target: match.target, label: match.label, guard: match.guard });
    }
    const unique = new Map<string, typeof rows[number]>();
    for (const row of rows) if (!unique.has(row.target)) unique.set(row.target, row);
    return [...unique.values()];
  }, [extracts]);

  const promote = (row: typeof candidates[number]) => {
    const next = { ...values, [row.target]: row.value };
    sessionStorage.setItem("overhaul:supplemental-values", JSON.stringify(next));
    sessionStorage.setItem("overhaul:dataset-promotions", JSON.stringify([...(JSON.parse(sessionStorage.getItem("overhaul:dataset-promotions") || "[]") as unknown[]), { source: row.source, datasetField: row.field, targetField: row.target, value: row.value, basis: row.guard, promotedAt: new Date().toISOString() }]));
    window.dispatchEvent(new CustomEvent("overhaul:supplemental-change"));
    setPromoted(row.target);
  };

  return <section className="overflow-hidden border border-violet-200/15 bg-[#09090d]"><div className="border-b border-steel/10 px-5 py-5"><p className="font-mono text-[8px] uppercase tracking-[0.18em] text-violet-200">Dataset → physics bridge</p><h2 className="mt-1 font-display text-2xl">Promote measured series into the engineering model.</h2><p className="mt-2 max-w-3xl text-[10px] leading-5 text-steel">Dataset statistics never become physics inputs silently. A reviewer explicitly promotes a bounded dataset statistic, and OVERHAUL records the dataset field and basis alongside the value.</p></div><div className="p-5">{candidates.length ? <div className="grid gap-2 lg:grid-cols-2">{candidates.map((row) => <div key={row.target} className="border border-steel/10 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm text-paper">{row.label}</p><p className="mt-1 font-mono text-[8px] text-steel">{row.field} · {row.source}</p></div><span className="font-mono text-[8px] text-violet-200">{fmt(row.value)} {row.unit || ""}</span></div><p className="mt-3 text-[8px] leading-4 text-steel">Basis: {row.guard}. This is promoted as observed dataset evidence, not as a design condition or annual forecast.</p><button type="button" onClick={() => promote(row)} className="mt-3 border border-violet-200/25 px-3 py-2 font-mono text-[7px] uppercase tracking-[0.1em] text-violet-100 hover:bg-violet-200/[0.05]">{promoted === row.target ? "Promoted to model" : "Use in physics model"}</button></div>)}</div> : <div className="border border-steel/10 p-4 text-[9px] leading-5 text-steel">No unambiguous physics candidates were found in the current dataset summaries. Upload a measured operating dataset containing columns such as load_kw, power_kw, capacity_kw, COP/efficiency or runtime_hours to create promotable evidence.</div>}</div></section>;
}
