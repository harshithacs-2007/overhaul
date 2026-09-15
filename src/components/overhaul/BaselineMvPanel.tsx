"use client";

import { useEffect, useMemo, useState } from "react";
import { fitCalibratedBaseline, verifyMeasuredSavings, type MVRecord } from "@/lib/engineering/baselineMv";

type StoredRecord = Partial<MVRecord>;

function validRecords(value: unknown): MVRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is StoredRecord => Boolean(item && typeof item === "object"))
    .map((item, index): MVRecord => ({
      timestamp: typeof item.timestamp === "string" ? item.timestamp : `record-${index + 1}`,
      phase: item.phase === "post" ? "post" : "baseline",
      energyKWh: typeof item.energyKWh === "number" ? item.energyKWh : Number(item.energyKWh),
      outdoorTempC: typeof item.outdoorTempC === "number" ? item.outdoorTempC : undefined,
      occupancy: typeof item.occupancy === "number" ? item.occupancy : undefined,
      productionUnits: typeof item.productionUnits === "number" ? item.productionUnits : undefined,
    }))
    .filter((item) => Number.isFinite(item.energyKWh) && item.energyKWh >= 0);
}

function storedMvRecords(): MVRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const primary = JSON.parse(sessionStorage.getItem("overhaul:mv-records") || "[]");
    const records = validRecords(primary);
    if (records.length) return records;
    const normalized = JSON.parse(sessionStorage.getItem("overhaul:normalized-records") || "[]");
    return validRecords(normalized);
  } catch {
    return [];
  }
}

export default function BaselineMvPanel() {
  const [records, setRecords] = useState<MVRecord[]>([]);

  useEffect(() => {
    setRecords(storedMvRecords());
  }, []);

  const baseline = useMemo(() => fitCalibratedBaseline(records), [records]);
  const verification = useMemo(() => verifyMeasuredSavings(records, baseline), [records, baseline]);
  const postCount = records.filter((record) => record.phase === "post").length;
  const baselineCount = records.filter((record) => record.phase === "baseline").length;

  return (
    <section className="mx-auto mt-4 max-w-[1500px] px-4 sm:px-6 lg:px-8">
      <div className="border border-steel/20 bg-black/15 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-teal">Baseline + measurement and verification</p>
            <h2 className="font-display mt-1 text-3xl sm:text-4xl">Prove the retrofit, not just predict it.</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-steel">OVERHAUL calibrates an energy baseline against independently supplied operating drivers, adjusts that baseline for post-retrofit conditions, then reports measured avoided energy with a model-error band.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 font-mono text-[9px] uppercase tracking-[0.1em]">
            <Metric label="Baseline" value={`${baselineCount}`} />
            <Metric label="Post" value={`${postCount}`} />
            <Metric label="Status" value={baseline.status} />
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-4">
          <Contract title="1 · Baseline" value={baseline.status === "calibrated" ? "Locked calibration" : "Needs more intervals"} note="energy + weather / occupancy / production" />
          <Contract title="2 · Adjust" value={verification.baselineAdjustedKWh != null ? `${verification.baselineAdjustedKWh.toFixed(1)} kWh` : "Awaiting baseline"} note="counterfactual under post conditions" />
          <Contract title="3 · Measure" value={verification.postMeasuredKWh != null ? `${verification.postMeasuredKWh.toFixed(1)} kWh` : "Awaiting post window"} note="metered post-retrofit energy" />
          <Contract title="4 · Verify" value={verification.avoidedPercent != null ? `${verification.avoidedPercent.toFixed(1)}%` : "Not verifiable"} note="measured avoided energy" />
        </div>

        {baseline.status === "calibrated" ? (
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Result label="R²" value={baseline.r2 == null ? "—" : baseline.r2.toFixed(3)} note="baseline explanatory fit" />
            <Result label="CV(RMSE)" value={baseline.cvRMSEPercent == null ? "—" : `${baseline.cvRMSEPercent.toFixed(1)}%`} note="model uncertainty proxy" />
            <Result label="NMBE" value={baseline.nMBEPercent == null ? "—" : `${baseline.nMBEPercent.toFixed(1)}%`} note="baseline bias" />
          </div>
        ) : null}

        {verification.status === "verified" ? (
          <div className="mt-4 border border-teal/25 bg-teal/5 p-4">
            <div className="grid gap-3 md:grid-cols-4">
              <Result label="Avoided energy" value={`${verification.avoidedKWh?.toFixed(1) ?? "—"} kWh`} note="adjusted baseline minus measured post" />
              <Result label="Savings range" value={`${verification.savingsRangeKWh?.low.toFixed(1) ?? "—"} to ${verification.savingsRangeKWh?.high.toFixed(1) ?? "—"} kWh`} note="includes model-error band" />
              <Result label="Uncertainty" value={`±${verification.modelUncertaintyKWh?.toFixed(1) ?? "—"} kWh`} note="calibration-derived" />
              <Result label="Verdict" value={(verification.avoidedKWh ?? -1) >= 0 ? "positive" : "negative"} note="investigate before declaring success" />
            </div>
          </div>
        ) : null}

        {baseline.warnings.length || verification.warnings.length ? (
          <div className="mt-4 border border-clay/25 bg-clay/5 p-4">
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-clay">Validation gates</p>
            <div className="mt-2 space-y-1 text-xs text-steel">
              {[...baseline.warnings, ...verification.warnings].map((warning) => <p key={warning}>· {warning}</p>)}
            </div>
          </div>
        ) : null}

        {!records.length ? (
          <div className="mt-4 border border-steel/15 p-4 text-xs text-steel">
            No time-series package is loaded yet. The panel consumes <span className="font-mono text-paper">overhaul:mv-records</span> when available and deliberately does not invent baseline or savings numbers.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="border border-steel/15 p-3"><p className="text-steel">{label}</p><p className="mt-1 text-paper">{value}</p></div>;
}

function Contract({ title, value, note }: { title: string; value: string; note: string }) {
  return <div className="border border-steel/15 p-4"><p className="font-mono text-[9px] uppercase text-teal">{title}</p><p className="mt-2 text-sm text-paper">{value}</p><p className="mt-1 text-[11px] leading-5 text-steel">{note}</p></div>;
}

function Result({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="border border-steel/15 p-4"><p className="font-mono text-[9px] uppercase text-steel">{label}</p><p className="mt-1 text-lg text-paper">{value}</p><p className="mt-1 text-[10px] leading-4 text-steel">{note}</p></div>;
}
