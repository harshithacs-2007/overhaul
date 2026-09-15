"use client";

import { useEffect, useMemo, useState } from "react";
import { buildDigitalShadow, buildEquipmentExpectations, type ShadowObservation } from "@/lib/engineering/digitalShadow";

type Props = { scope: "building" | "facility" | "equipment"; values: Record<string, number | string | null | undefined> };
type StoredExtraction = { observations?: Array<{ field: string; numericValue: number | null; unit: string | null; confidence: number; sourceText?: string }> };

const canonical = (field: string) => field.toLowerCase().trim().replace(/[()\-\/]+/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_");

export default function DigitalTwinConsole({ scope, values }: Props) {
  const [extracts, setExtracts] = useState<StoredExtraction[]>([]);
  useEffect(() => {
    try { setExtracts(JSON.parse(sessionStorage.getItem("overhaul:evidence-extractions") || "[]")); } catch { setExtracts([]); }
    const sync = () => { try { setExtracts(JSON.parse(sessionStorage.getItem("overhaul:evidence-extractions") || "[]")); } catch {} };
    window.addEventListener("storage", sync); window.addEventListener("overhaul:supplemental-change", sync); window.addEventListener("overhaul:evidence-change", sync);
    return () => { window.removeEventListener("storage", sync); window.removeEventListener("overhaul:supplemental-change", sync); window.removeEventListener("overhaul:evidence-change", sync); };
  }, []);

  const observations = useMemo<ShadowObservation[]>(() => {
    const source: ShadowObservation[] = [];
    for (const extraction of extracts) for (const observation of extraction.observations || []) {
      if (observation.numericValue == null || !Number.isFinite(observation.numericValue)) continue;
      source.push({ key: canonical(observation.field), value: observation.numericValue, unit: observation.unit || "", source: "vision", confidence: observation.confidence });
    }
    for (const [key, raw] of Object.entries(values)) {
      if (typeof raw === "number" && Number.isFinite(raw) && source.every((item) => item.key !== canonical(key))) {
        source.push({ key: canonical(key), value: raw, unit: "", source: "measured", confidence: 1 });
      }
    }
    return source;
  }, [extracts, values]);

  const expected = useMemo(() => {
    if (scope === "equipment") {
      return buildEquipmentExpectations({
        ratedCapacityKW: Number(values.capacity_kw) > 0 ? Number(values.capacity_kw) : undefined,
        expectedEfficiency: Number(values.expected_efficiency) > 0 ? Number(values.expected_efficiency) : undefined,
        expectedPowerKW: Number(values.expected_power_kw) > 0 ? Number(values.expected_power_kw) : undefined,
      });
    }
    if (Number(values.expected_power_kw) > 0) {
      return [{ key: "power_kw", expected: Number(values.expected_power_kw), unit: "kW", toleranceRelative: 0.1, basis: "validated building/facility operating reference" }];
    }
    return [];
  }, [scope, values]);

  const shadow = useMemo(() => buildDigitalShadow(scope, observations, expected), [observations, scope, expected]);
  const stateLabel = shadow.state === "within-expected" ? "Within expected" : shadow.state === "critical-deviation" ? "Critical deviation" : shadow.state === "deviating" ? "Deviation detected" : "Needs evidence";
  const stateClass = shadow.state === "within-expected" ? "text-teal" : shadow.state === "critical-deviation" ? "text-red-300" : shadow.state === "deviating" ? "text-amber-200" : "text-steel";

  return <section className="mt-5 border border-steel/15 bg-[#070b0b]">
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-steel/10 px-5 py-4">
      <div><p className="font-mono text-[8px] uppercase tracking-[0.16em] text-teal">Digital shadow · live state</p><h2 className="mt-1 font-display text-2xl">Expected ↔ observed</h2><p className="mt-1 text-[9px] text-steel">The shadow only evaluates signals for which an independent expected reference exists.</p></div>
      <div className="text-right"><p className="font-mono text-[7px] uppercase text-steel">state</p><p className={`mt-1 font-mono text-sm uppercase ${stateClass}`}>{stateLabel}</p><p className="mt-1 font-mono text-[8px] text-steel">confidence-weighted score {Math.round(shadow.score)}%</p></div>
    </div>
    <div className="grid gap-4 p-5 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="space-y-2">{shadow.signals.length ? shadow.signals.map((signal) => <div key={`${signal.key}-${signal.expected}`} className="border border-steel/10 p-3"><div className="flex items-center justify-between gap-4"><div><p className="font-mono text-[8px] uppercase text-steel">{signal.key}</p><p className="mt-1 text-[11px]">{signal.observed.toFixed(2)} {signal.unit} <span className="text-steel">vs {signal.expected.toFixed(2)} {signal.unit}</span></p></div><span className={`font-mono text-[8px] uppercase ${signal.severity === "critical" ? "text-red-300" : signal.severity === "warning" ? "text-amber-200" : "text-teal"}`}>{signal.severity}</span></div><div className="mt-2 flex justify-between font-mono text-[7px] text-steel"><span>residual {(signal.relativeResidual * 100).toFixed(1)}%</span><span>{Math.round(signal.confidence * 100)}% source confidence</span></div></div>) : <div className="border border-dashed border-steel/20 p-6"><p className="font-display text-lg">No independently expected signal yet.</p><p className="mt-2 text-[9px] leading-5 text-steel">OVERHAUL will not call an asset inefficient from appearance alone. Add a validated reference, measured operating value, or approved engineering baseline.</p></div>}</div>
      <aside className="border border-steel/10 p-4"><p className="font-mono text-[8px] uppercase text-steel">Decision-critical unknowns</p><div className="mt-3 space-y-2">{shadow.nextEvidence.length ? shadow.nextEvidence.map((item, i) => <div key={i} className="flex gap-2 text-[9px] leading-4 text-steel"><span className="text-teal">0{i + 1}</span><span>{item}</span></div>) : <p className="text-[9px] text-steel">No additional measurement requested from the current reference set.</p>}</div><div className="mt-5 grid grid-cols-2 gap-2"><Data label="Observations" value={String(shadow.observationsUsed)} /><Data label="Matched" value={String(shadow.expectedSignalsMatched)} /><Data label="Unknowns" value={String(shadow.unknowns.length)} /><Data label="Mode" value={scope} /></div></aside>
    </div>
  </section>;
}

function Data({ label, value }: { label: string; value: string }) { return <div className="border border-steel/10 p-3"><p className="font-mono text-[7px] uppercase text-steel">{label}</p><p className="mt-1 text-sm">{value}</p></div>; }
