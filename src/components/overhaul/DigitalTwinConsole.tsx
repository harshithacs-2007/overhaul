"use client";

import { useEffect, useMemo, useState } from "react";
import { buildDigitalShadow, buildEquipmentExpectations, type ExpectedSignal, type ShadowObservation } from "@/lib/engineering/digitalShadow";

type Props = { scope: "building" | "facility" | "equipment"; values: Record<string, number | string | null | undefined> };
type StoredExtraction = { observations?: Array<{ field: string; numericValue: number | null; unit: string | null; confidence: number }> };

const canonical = (field: string) => field.toLowerCase().trim().replace(/[()\-\/]+/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_");
const n = (values: Props["values"], ...keys: string[]) => { for (const key of keys) { const value = Number(values[key]); if (Number.isFinite(value) && value > 0) return value; } return undefined; };

export default function DigitalTwinConsole({ scope, values }: Props) {
  const [extracts, setExtracts] = useState<StoredExtraction[]>([]);

  useEffect(() => {
    const sync = () => { try { setExtracts(JSON.parse(sessionStorage.getItem("overhaul:evidence-extractions") || "[]")); } catch { setExtracts([]); } };
    queueMicrotask(sync);
    window.addEventListener("storage", sync);
    window.addEventListener("overhaul:supplemental-change", sync);
    window.addEventListener("overhaul:evidence-change", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("overhaul:supplemental-change", sync);
      window.removeEventListener("overhaul:evidence-change", sync);
    };
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

  const reference = useMemo<{ signals: ExpectedSignal[]; basis: string }>(() => {
    if (scope === "equipment") {
      const ratedCapacity = n(values, "capacity_kw", "rated_capacity_kw");
      const referenceEfficiency = n(values, "reference_efficiency", "rated_efficiency", "expected_efficiency");
      const operatingLoad = n(values, "load_kw", "operating_load_kw");
      if (operatingLoad && referenceEfficiency) {
        return {
          signals: [{ key: "power_kw", expected: operatingLoad / referenceEfficiency, unit: "kW", toleranceRelative: 0.1, basis: "explicit operating load divided by reference efficiency/COP" }],
          basis: "explicit operating load + reference efficiency/COP",
        };
      }
      return {
        signals: buildEquipmentExpectations({ ratedCapacityKW: ratedCapacity, expectedEfficiency: referenceEfficiency }),
        basis: referenceEfficiency ? "rated capacity + reference efficiency/COP" : "no independent equipment performance reference",
      };
    }

    const expectedPower = n(values, "expected_power_kw", "reference_power_kw");
    if (expectedPower) {
      return {
        signals: [{ key: "power_kw", expected: expectedPower, unit: "kW", toleranceRelative: 0.1, basis: "explicit validated building/facility operating reference" }],
        basis: "explicit validated operating reference",
      };
    }
    return { signals: [], basis: "no independent building/facility performance reference" };
  }, [scope, values]);

  const shadow = useMemo(() => buildDigitalShadow(scope, observations, reference.signals), [observations, reference.signals, scope]);
  const stateLabel = shadow.state === "within-expected" ? "Within expected" : shadow.state === "critical-deviation" ? "Critical deviation" : shadow.state === "deviating" ? "Deviation detected" : "Needs evidence";
  const stateClass = shadow.state === "within-expected" ? "text-teal" : shadow.state === "critical-deviation" ? "text-red-300" : shadow.state === "deviating" ? "text-amber-200" : "text-steel";

  return <section className="mt-5 border border-steel/15 bg-[#070b0b]">
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-steel/10 px-5 py-4">
      <div><p className="font-mono text-[8px] uppercase tracking-[0.16em] text-teal">Digital shadow · live state</p><h2 className="mt-1 font-display text-2xl">Expected ↔ observed</h2><p className="mt-1 max-w-2xl text-[9px] text-steel">The expected side must come from an explicit reference. OVERHAUL never creates a “healthy” value from appearance or from the same observed signal.</p></div>
      <div className="text-right"><p className="font-mono text-[7px] uppercase text-steel">state</p><p className={`mt-1 font-mono text-sm uppercase ${stateClass}`}>{stateLabel}</p><p className="mt-1 font-mono text-[8px] text-steel">confidence-weighted score {Math.round(shadow.score)}%</p></div>
    </div>
    <div className="grid gap-4 p-5 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="space-y-2">{shadow.signals.length ? shadow.signals.map((signal) => <div key={`${signal.key}-${signal.expected}`} className="border border-steel/10 p-3"><div className="flex items-center justify-between gap-4"><div><p className="font-mono text-[8px] uppercase text-steel">{signal.key}</p><p className="mt-1 text-[11px]">Observed <span className="text-paper">{signal.observed.toFixed(2)} {signal.unit}</span> <span className="text-steel">vs expected {signal.expected.toFixed(2)} {signal.unit}</span></p></div><span className={`font-mono text-[8px] uppercase ${signal.severity === "critical" ? "text-red-300" : signal.severity === "warning" ? "text-amber-200" : "text-teal"}`}>{signal.severity}</span></div><div className="mt-2 flex justify-between font-mono text-[7px] text-steel"><span>residual {(signal.relativeResidual * 100).toFixed(1)}%</span><span>{Math.round(signal.confidence * 100)}% source confidence</span></div></div>) : <div className="border border-dashed border-steel/20 p-6"><p className="font-display text-lg">Reference side not established yet.</p><p className="mt-2 text-[9px] leading-5 text-steel">{reference.basis}. Add a manufacturer/nameplate reference or a measured/validated operating baseline before treating the gap as a performance deviation.</p></div>}</div>
      <aside className="border border-steel/10 p-4"><p className="font-mono text-[8px] uppercase text-steel">Why this matters for retrofit</p><p className="mt-3 text-[10px] leading-5 text-paper">A retrofit is justified by a defined performance gap or constraint. Once that gap is established, the retrofit what-if layer can change the relevant physical parameter and propagate the consequence.</p><div className="mt-5 grid grid-cols-2 gap-2"><Data label="Observations" value={String(shadow.observationsUsed)} /><Data label="Matched" value={String(shadow.expectedSignalsMatched)} /><Data label="Unknowns" value={String(shadow.unknowns.length)} /><Data label="Reference" value={reference.basis} /></div><div className="mt-5 border-t border-steel/10 pt-4"><p className="font-mono text-[8px] uppercase text-teal">Next measurement</p><div className="mt-2 space-y-2">{shadow.nextEvidence.length ? shadow.nextEvidence.map((item, i) => <p key={i} className="text-[9px] leading-4 text-steel">{item}</p>) : <p className="text-[9px] text-steel">No additional measurement requested from the current reference set.</p>}</div></div></aside>
    </div>
  </section>;
}

function Data({ label, value }: { label: string; value: string }) { return <div className="border border-steel/10 p-3"><p className="font-mono text-[7px] uppercase text-steel">{label}</p><p className="mt-1 break-words text-[10px] text-paper">{value}</p></div>; }
