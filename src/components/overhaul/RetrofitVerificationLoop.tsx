"use client";

import { useEffect, useMemo, useState } from "react";

type Verification = {
  baselineEnergyKWh: number | null;
  predictedSavingKWh: number | null;
  actualPostEnergyKWh: number | null;
  actualSavingKWh: number | null;
  varianceKWh: number | null;
  variancePercent: number | null;
  status: "not-run" | "matched" | "drift" | "mismatch";
  verifiedAt: string;
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function numberValue(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export default function RetrofitVerificationLoop() {
  const [baseline, setBaseline] = useState("");
  const [predicted, setPredicted] = useState("");
  const [actual, setActual] = useState("");
  const [verification, setVerification] = useState<Verification | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem("overhaul:verification") || "null") as Verification | null;
      if (saved) {
        setVerification(saved);
        setBaseline(saved.baselineEnergyKWh == null ? "" : String(saved.baselineEnergyKWh));
        setPredicted(saved.predictedSavingKWh == null ? "" : String(saved.predictedSavingKWh));
        setActual(saved.actualPostEnergyKWh == null ? "" : String(saved.actualPostEnergyKWh));
      }
    } catch {
      setVerification(null);
    }
  }, []);

  const preview = useMemo(() => {
    const baselineKWh = numberValue(baseline);
    const predictedSavingKWh = numberValue(predicted);
    const actualPostKWh = numberValue(actual);
    if (baselineKWh == null || predictedSavingKWh == null || actualPostKWh == null || baselineKWh === 0) return null;
    const predictedPostKWh = Math.max(baselineKWh - predictedSavingKWh, 0);
    const actualSavingKWh = baselineKWh - actualPostKWh;
    const varianceKWh = actualSavingKWh - predictedSavingKWh;
    const variancePercent = Math.abs(varianceKWh) / Math.max(Math.abs(predictedSavingKWh), 1) * 100;
    const status: Verification["status"] = variancePercent <= 10 ? "matched" : variancePercent <= 25 ? "drift" : "mismatch";
    return { baselineKWh, predictedSavingKWh, predictedPostKWh, actualPostKWh, actualSavingKWh, varianceKWh, variancePercent, status };
  }, [actual, baseline, predicted]);

  const verify = () => {
    if (!preview) return;
    const result: Verification = {
      baselineEnergyKWh: preview.baselineKWh,
      predictedSavingKWh: preview.predictedSavingKWh,
      actualPostEnergyKWh: preview.actualPostKWh,
      actualSavingKWh: preview.actualSavingKWh,
      varianceKWh: preview.varianceKWh,
      variancePercent: preview.variancePercent,
      status: preview.status,
      verifiedAt: new Date().toISOString(),
    };
    setVerification(result);
    try {
      sessionStorage.setItem("overhaul:verification", JSON.stringify(result));
      window.dispatchEvent(new CustomEvent("overhaul:verification-change"));
    } catch {}
  };

  const clear = () => {
    setVerification(null);
    setActual("");
    try { sessionStorage.removeItem("overhaul:verification"); } catch {}
  };

  const exportRecord = () => {
    const payload = verification ?? (preview ? {
      baselineEnergyKWh: preview.baselineKWh,
      predictedSavingKWh: preview.predictedSavingKWh,
      actualPostEnergyKWh: preview.actualPostKWh,
      actualSavingKWh: preview.actualSavingKWh,
      varianceKWh: preview.varianceKWh,
      variancePercent: preview.variancePercent,
      status: preview.status,
      verifiedAt: new Date().toISOString(),
    } : null);
    if (!payload) return;
    const blob = new Blob([JSON.stringify({ schema: "overhaul.verification.v1", ...payload }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "overhaul-verification.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const statusLabel = verification?.status || preview?.status || "not-run";
  const statusClass = statusLabel === "matched" ? "border-teal/30 text-teal" : statusLabel === "drift" ? "border-gold/30 text-gold" : statusLabel === "mismatch" ? "border-clay/30 text-clay" : "border-steel/20 text-steel";

  return <section className="border border-steel/20 bg-black/15 p-5">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-gold">Verification loop</p>
        <h3 className="mt-1 font-display text-2xl sm:text-3xl">Did reality match the retrofit model?</h3>
        <p className="mt-2 max-w-3xl text-[10px] leading-5 text-steel">Enter the measured post-retrofit annual energy. OVERHAUL compares it with the predicted saving instead of treating the simulation as proof.</p>
      </div>
      <span className={`border px-2.5 py-1.5 font-mono text-[7px] uppercase ${statusClass}`}>{statusLabel.replace("-", " ")}</span>
    </div>

    <div className="mt-5 grid gap-3 md:grid-cols-3">
      <Field label="Baseline energy" unit="kWh/yr" value={baseline} onChange={setBaseline} placeholder="e.g. 42000" />
      <Field label="Predicted saving" unit="kWh/yr" value={predicted} onChange={setPredicted} placeholder="from approved simulation" />
      <Field label="Measured post-retrofit" unit="kWh/yr" value={actual} onChange={setActual} placeholder="enter measured value" />
    </div>

    {preview ? <div className="mt-4 grid gap-2 sm:grid-cols-4">
      <Metric label="Predicted post" value={`${preview.predictedPostKWh.toFixed(0)} kWh`} />
      <Metric label="Actual saving" value={`${preview.actualSavingKWh.toFixed(0)} kWh`} />
      <Metric label="Variance" value={`${preview.varianceKWh >= 0 ? "+" : ""}${preview.varianceKWh.toFixed(0)} kWh`} />
      <Metric label="Deviation" value={`${preview.variancePercent.toFixed(1)}%`} />
    </div> : <p className="mt-4 border border-steel/10 bg-white/[.015] p-3 text-[9px] text-steel">Verification unlocks when all three energy values are supplied.</p>}

    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" onClick={verify} disabled={!preview} className="border border-teal/30 bg-teal/[.06] px-4 py-2 font-mono text-[7px] uppercase tracking-[.12em] text-teal disabled:cursor-not-allowed disabled:opacity-40">Record verification</button>
      <button type="button" onClick={exportRecord} disabled={!verification && !preview} className="border border-steel/20 px-4 py-2 font-mono text-[7px] uppercase tracking-[.12em] text-steel disabled:cursor-not-allowed disabled:opacity-40">Export record</button>
      <button type="button" onClick={clear} className="px-3 py-2 font-mono text-[7px] uppercase tracking-[.12em] text-steel/70">Clear measured result</button>
    </div>

    <div className="mt-4 border-l border-gold/25 pl-3 text-[8px] leading-4 text-steel">
      <p><span className="text-paper">≤10%</span> deviation = matched · <span className="text-paper">10–25%</span> = drift · <span className="text-paper">&gt;25%</span> = mismatch.</p>
      <p className="mt-1">These thresholds are verification heuristics, not proof of causality. A mismatch should trigger investigation of weather, occupancy, runtime, commissioning, metering and other confounders.</p>
    </div>
  </section>;
}

function Field({ label, unit, value, onChange, placeholder }: { label: string; unit: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="block border border-steel/15 bg-black/15 p-3"><span className="font-mono text-[7px] uppercase tracking-[.12em] text-steel">{label}</span><span className="mt-1 flex items-center gap-2"><input inputMode="decimal" type="number" min="0" step="any" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-sm text-paper outline-none placeholder:text-steel/35"/><span className="font-mono text-[7px] uppercase text-steel">{unit}</span></span></label>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="border border-steel/10 p-3"><p className="font-mono text-[7px] uppercase text-steel">{label}</p><p className="mt-2 text-sm text-paper">{value}</p></div>;
}
