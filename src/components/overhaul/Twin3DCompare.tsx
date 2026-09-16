"use client";

import type { TwinModel } from "@/lib/engineering/twinModel";
import Twin3DCanvas from "./Twin3DCanvas";

type Scope = "building" | "facility" | "equipment";
type Values = Record<string, number | string | null | undefined>;

type Props = {
  scope: Scope;
  title: string;
  observed: TwinModel;
  proposed: TwinModel;
  values: Values;
  observedMetrics?: { load: number | null; power: number | null; energy: number | null; utilization: number | null; cost: number | null } | null;
  proposedMetrics?: { load: number | null; power: number | null; energy: number | null; utilization: number | null; cost: number | null } | null;
  savingPercent?: number | null;
};

function fmt(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "—" : value.toLocaleString("en-IN", { maximumFractionDigits: 1 });
}

export default function Twin3DCompare({ scope, title, observed, proposed, observedMetrics, proposedMetrics, savingPercent }: Props) {
  const geometrySame = JSON.stringify({ rooms: observed.rooms, walls: observed.walls, openings: observed.openings }) === JSON.stringify({ rooms: proposed.rooms, walls: proposed.walls, openings: proposed.openings });
  const changedAssets = proposed.assets.filter((asset) => /RETROFIT TARGET|CONTROL \/ RUNTIME TARGET|performance upgrade explicitly selected/i.test(asset.observedState || "")).length;

  return <section className="overflow-hidden border border-violet-200/20 bg-[#07080b]">
    <div className="border-b border-steel/10 px-5 py-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[8px] uppercase tracking-[.18em] text-violet-200">Twin comparison · observed vs retrofit</p>
          <h2 className="mt-1 font-display text-3xl">See exactly what the intervention changes.</h2>
          <p className="mt-2 max-w-4xl text-[10px] leading-5 text-steel">Both views use the same reconstructed asset. The proposed view only changes what the selected, explicit retrofit parameters justify; geometry is never silently redrawn to make the retrofit look larger.</p>
        </div>
        <div className="border border-violet-200/20 px-3 py-2 text-right font-mono text-[7px] uppercase text-steel">
          <div>{geometrySame ? "Geometry held constant" : "Geometry changed"}</div>
          <div className="mt-1 text-violet-200">{changedAssets} retrofit-marked assets</div>
        </div>
      </div>
    </div>

    <div className="grid xl:grid-cols-2">
      <div className="border-b border-steel/10 xl:border-b-0 xl:border-r">
        <Header label="Observed / baseline" model={observed} />
        <Twin3DCanvas scope={scope} mode="observed" model={observed} widthM={observed.overall.widthM} depthM={observed.overall.depthM} heightM={observed.overall.heightM} capacityKW={null} loadKW={observedMetrics?.load ?? null} powerKW={observedMetrics?.power ?? null} currentLoadKW={observedMetrics?.load ?? null} proposedLoadKW={proposedMetrics?.load ?? null} currentPowerKW={observedMetrics?.power ?? null} proposedPowerKW={proposedMetrics?.power ?? null} currentUtilization={observedMetrics?.utilization ?? null} proposedUtilization={proposedMetrics?.utilization ?? null} savingPercent={savingPercent ?? null} title={title} />
        <MetricStrip metrics={observedMetrics} label="Baseline" />
      </div>
      <div>
        <Header label="Retrofit / counterfactual" model={proposed} accent />
        <Twin3DCanvas scope={scope} mode="retrofit" model={proposed} widthM={proposed.overall.widthM} depthM={proposed.overall.depthM} heightM={proposed.overall.heightM} capacityKW={null} loadKW={proposedMetrics?.load ?? null} powerKW={proposedMetrics?.power ?? null} currentLoadKW={observedMetrics?.load ?? null} proposedLoadKW={proposedMetrics?.load ?? null} currentPowerKW={observedMetrics?.power ?? null} proposedPowerKW={proposedMetrics?.power ?? null} currentUtilization={observedMetrics?.utilization ?? null} proposedUtilization={proposedMetrics?.utilization ?? null} savingPercent={savingPercent ?? null} title={title} />
        <MetricStrip metrics={proposedMetrics} label="Counterfactual" accent />
      </div>
    </div>

    <div className="grid gap-px border-t border-steel/10 bg-steel/10 md:grid-cols-4">
      <Delta label="Peak load" before={observedMetrics?.load} after={proposedMetrics?.load} unit="kW" />
      <Delta label="Peak power" before={observedMetrics?.power} after={proposedMetrics?.power} unit="kW" />
      <Delta label="Annual energy" before={observedMetrics?.energy} after={proposedMetrics?.energy} unit="kWh" />
      <Delta label="Annual cost" before={observedMetrics?.cost} after={proposedMetrics?.cost} unit="₹" />
    </div>
  </section>;
}

function Header({ label, model, accent = false }: { label: string; model: TwinModel; accent?: boolean }) {
  return <div className="flex items-center justify-between gap-3 border-b border-steel/10 px-5 py-3">
    <div><p className={`font-mono text-[8px] uppercase tracking-[.14em] ${accent ? "text-violet-200" : "text-teal"}`}>{label}</p><p className="mt-1 text-[8px] text-steel">{model.geometryStatus === "verified-metric" ? `Verified metric · ${model.overall.widthM.toFixed(2)} × ${model.overall.depthM.toFixed(2)} × ${model.overall.heightM.toFixed(2)} m` : `Relative geometry · ${model.geometryBasis}`}</p></div>
    <span className="font-mono text-[7px] uppercase text-steel">{model.assets.length} assets</span>
  </div>;
}

function MetricStrip({ metrics, label, accent = false }: { metrics?: Twin3DComparePropsMetrics | null; label: string; accent?: boolean }) {
  return <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-5">
    <Small label={`${label} load`} value={`${fmt(metrics?.load)} kW`} />
    <Small label="Power" value={`${fmt(metrics?.power)} kW`} />
    <Small label="Energy" value={`${fmt(metrics?.energy)} kWh`} />
    <Small label="Utilization" value={`${fmt(metrics?.utilization != null ? metrics.utilization * 100 : null)}%`} />
    <Small label="Cost" value={`₹${fmt(metrics?.cost)}`} accent={accent} />
  </div>;
}

type Twin3DComparePropsMetrics = { load: number | null; power: number | null; energy: number | null; utilization: number | null; cost: number | null };

function Small({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className="border border-steel/10 bg-black/20 p-2"><p className="font-mono text-[6px] uppercase text-steel">{label}</p><p className={`mt-1 font-mono text-[9px] ${accent ? "text-violet-200" : "text-paper"}`}>{value}</p></div>;
}

function Delta({ label, before, after, unit }: { label: string; before?: number | null; after?: number | null; unit: string }) {
  const delta = before != null && after != null && Number.isFinite(before) && Number.isFinite(after) ? after - before : null;
  const sign = delta == null ? "" : delta > 0 ? "+" : "";
  return <div className="bg-[#07080b] p-4"><p className="font-mono text-[7px] uppercase text-steel">{label}</p><p className="mt-1 font-mono text-[10px] text-paper">{delta == null ? "—" : `${sign}${fmt(delta)} ${unit}`}</p><p className="mt-1 text-[7px] text-steel">Counterfactual − baseline</p></div>;
}
