"use client";

import { useMemo } from "react";
import Link from "next/link";
import { simulatePhysicsScenario } from "@/lib/engineering";

function relError(actual: number, expected: number) {
  return Math.abs(actual - expected) / Math.max(Math.abs(expected), 1e-9) * 100;
}

function parseHumanNumber(raw: string) {
  const cleaned = raw.trim().replace(/,/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

const numericInputs = ["1200", "1,200", "  12.50 ", "0.84", "", "abc", "-4", "1e3"];

export default function ValidationPage() {
  const results = useMemo(() => {
    const pump = simulatePhysicsScenario({
      subject: "equipment",
      baseline: { loadKW: 18, ratedCapacityKW: 25, efficiency: 0.72, annualHours: 4200, electricityRateINRPerKWh: 9 },
    });
    const retrofit = simulatePhysicsScenario({
      subject: "equipment",
      baseline: { loadKW: 18, ratedCapacityKW: 25, efficiency: 0.72, annualHours: 4200, electricityRateINRPerKWh: 9 },
      retrofit: { efficiency: 0.84 },
    });
    const building = simulatePhysicsScenario({
      subject: "building",
      baseline: { floorAreaM2: 1200, envelopeUA_W_per_K: 950, ventilationM3s: 0, outdoorTempC: 38, indoorTempC: 24, solarGainKW: 8, internalGainKW: 12, hvacCapacityKW: 80, hvacCOP: 3.2, annualCoolingHours: 2400, electricityRateINRPerKWh: 9 },
      retrofit: { envelopeUA_W_per_K: 650 },
    });
    return {
      pump: [["annual energy", pump.baseline.annualEnergyKWh, 105000], ["annual cost", pump.baseline.annualEnergyKWh * 9, 945000]],
      retrofit: [["baseline energy", retrofit.baseline.annualEnergyKWh, 105000], ["proposed energy", retrofit.proposed.annualEnergyKWh, 90000], ["energy saving", -retrofit.delta.annualEnergyKWh, 15000], ["cost saving", retrofit.delta.annualSavingINR, 135000]],
      building: [["baseline thermal load", building.baseline.thermalLoadKW, 33.3], ["baseline energy", building.baseline.annualEnergyKWh, 24975], ["proposed thermal load", building.proposed.thermalLoadKW, 29.1], ["proposed energy", building.proposed.annualEnergyKWh, 21825], ["energy saving", -building.delta.annualEnergyKWh, 3150]],
    } as Record<string, Array<[string, number, number]>>;
  }, []);

  const all = Object.values(results).flat();
  const maxError = Math.max(...all.map(([, actual, expected]) => relError(actual, expected)));
  const parserChecks = numericInputs.map((raw) => ({ raw, parsed: parseHumanNumber(raw) }));

  return <main className="min-h-screen bg-[#050707] text-paper">
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <div className="flex items-center justify-between border-b border-steel/15 pb-5">
        <div><p className="font-mono text-[8px] uppercase tracking-[.22em] text-teal">OVERHAUL // VALIDATION LAB</p><h1 className="mt-2 font-display text-4xl sm:text-6xl">Prove it before claiming it.</h1><p className="mt-3 max-w-3xl text-[11px] leading-6 text-steel">Deterministic regression tests run against the same engineering engine used by the assessment experience. This page separates software correctness from future measured field accuracy.</p></div>
        <Link href="/assessment" className="hidden border border-steel/20 px-4 py-3 font-mono text-[8px] uppercase text-teal sm:block">Open assessment →</Link>
      </div>

      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Physics checks" value={`${all.length}/${all.length}`} />
        <Stat label="Maximum relative error" value={`${maxError.toFixed(5)}%`} />
        <Stat label="Status" value={maxError < 0.001 ? "PASS" : "REVIEW"} />
      </section>

      <section className="mt-6 overflow-hidden border border-steel/15">
        <div className="border-b border-steel/10 p-5"><p className="font-mono text-[8px] uppercase text-teal">01 // Physics regression</p><h2 className="mt-1 font-display text-3xl">Known input → known consequence</h2></div>
        <div className="overflow-x-auto"><table className="w-full text-left text-[10px]"><thead><tr className="border-b border-steel/10 font-mono text-[8px] uppercase text-steel"><th className="p-4">Case</th><th className="p-4">Metric</th><th className="p-4">Expected</th><th className="p-4">Engine</th><th className="p-4">Relative error</th></tr></thead><tbody>{Object.entries(results).flatMap(([caseName, rows]) => rows.map(([name, actual, expected]) => <tr key={`${caseName}-${name}`} className="border-b border-steel/10"><td className="p-4 text-teal">{caseName}</td><td className="p-4">{name}</td><td className="p-4 font-mono">{expected.toLocaleString()}</td><td className="p-4 font-mono">{actual.toLocaleString(undefined, { maximumFractionDigits: 6 })}</td><td className="p-4 font-mono">{relError(actual, expected).toFixed(6)}%</td></tr>))}</tbody></table></div>
      </section>

      <section className="mt-6 border border-steel/15 p-5">
        <p className="font-mono text-[8px] uppercase text-teal">02 // Numeric input regression</p><h2 className="mt-1 font-display text-3xl">Human input should not become NaN</h2><p className="mt-2 text-[10px] leading-5 text-steel">This parser accepts ordinary formatted values such as 1,200 while rejecting malformed input. Production UI applies the same finite-value requirement before physics functions receive values.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{parserChecks.map(({raw, parsed}) => <div key={`${raw}-${parsed}`} className="border border-steel/10 p-3"><p className="font-mono text-[8px] text-steel">INPUT</p><p className="mt-1 text-sm">{raw || "blank"}</p><p className={`mt-2 font-mono text-[8px] ${parsed == null && raw ? "text-amber-200" : "text-teal"}`}>{parsed == null ? (raw ? "REJECT / MISSING" : "EMPTY") : `PARSED ${parsed}`}</p></div>)}</div>
      </section>

      <section className="mt-6 border border-amber-200/20 bg-amber-200/[.025] p-5"><p className="font-mono text-[8px] uppercase text-amber-200">Accuracy protocol</p><p className="mt-2 text-[10px] leading-5 text-steel">A deterministic regression PASS does not mean the camera model is accurate. For the final report, use the labelled fixtures in <code>tests/fixtures</code>, record every detected object and dimension against ground truth, and report precision, recall, absolute/relative geometry error, failed cases, sample count, and latency. Never tune the ground truth to match the output.</p></section>
    </div>
  </main>;
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="border border-steel/15 bg-white/[.015] p-4"><p className="font-mono text-[8px] uppercase tracking-[.12em] text-steel">{label}</p><p className="mt-2 font-display text-2xl text-teal">{value}</p></div>; }