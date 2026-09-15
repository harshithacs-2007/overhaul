"use client";

import { useMemo } from "react";
import { intervalCrossesThreshold, propagatePowerLaw, type UncertainInput } from "@/lib/engineering/uncertaintyEngine";

type Extraction = { observations?: Array<{ field: string; numericValue: number | null; unit: string | null; confidence: number }> };

type Props = { extracts: Extraction[] };

function findValue(observations: Extraction["observations"], terms: string[]): number | null {
  for (const o of observations ?? []) {
    const text = o.field.toLowerCase();
    if (terms.some((term) => text.includes(term)) && o.numericValue != null && Number.isFinite(o.numericValue)) {
      return o.numericValue;
    }
  }
  return null;
}

export default function UncertaintyPanel({ extracts }: Props) {
  const observations = useMemo(() => extracts.flatMap((x) => x.observations ?? []), [extracts]);

  const model = useMemo(() => {
    const capacity = findValue(observations, ["capacity"]);
    const efficiency = findValue(observations, ["efficiency", "cop", "eer", "seer"]);
    const power = findValue(observations, ["power"]);
    if (capacity == null || efficiency == null || capacity <= 0 || efficiency <= 0) return null;

    const capacityInput: UncertainInput = {
      id: "capacity",
      value: capacity,
      absoluteUncertainty: Math.max(Math.abs(capacity) * 0.05, 0.01),
      unit: "kW",
    };
    const efficiencyInput: UncertainInput = {
      id: "efficiency",
      value: efficiency,
      absoluteUncertainty: Math.max(Math.abs(efficiency) * 0.05, 0.001),
      unit: "ratio",
    };

    const expectedPower = propagatePowerLaw([capacityInput, efficiencyInput], { capacity: 1, efficiency: -1 });
    if (!expectedPower) return null;
    const crossing = power != null ? intervalCrossesThreshold(expectedPower, power) : false;
    return { capacity, efficiency, power, expectedPower, crossing };
  }, [observations]);

  return (
    <section className="mx-auto mt-5 max-w-[1500px] px-4 sm:px-6 lg:px-8">
      <div className="border border-steel/20 bg-black/10 p-5 sm:p-6">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-teal">Decision uncertainty</p>
            <h2 className="mt-1 font-display text-2xl">Do the measurement errors change the decision?</h2>
          </div>
          <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-steel">first-order propagation · RSS · 95% interval</p>
        </div>

        {model ? (
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <Metric label="Capacity" value={`${model.capacity.toFixed(1)} kW`} />
            <Metric label="Efficiency" value={model.efficiency.toFixed(3)} />
            <Metric label="Expected power" value={`${model.expectedPower.value.toFixed(1)} ± ${model.expectedPower.standardUncertainty.toFixed(1)} kW`} />
            <Metric label="95% interval" value={`${model.expectedPower.lower95.toFixed(1)}–${model.expectedPower.upper95.toFixed(1)} kW`} />
          </div>
        ) : (
          <div className="mt-4 border border-clay/20 bg-clay/5 p-4 text-xs text-steel">
            Uncertainty propagation is blocked until capacity and efficiency evidence are available with numeric values.
          </div>
        )}

        {model ? (
          <div className={`mt-4 border p-4 ${model.crossing ? "border-clay/40 bg-clay/5" : "border-teal/20 bg-teal/5"}`}>
            <p className="font-mono text-[8px] uppercase tracking-[0.12em]">Decision gate</p>
            <p className="mt-1 text-xs leading-5">
              {model.crossing
                ? "The measured-power threshold falls inside the 95% expected interval. This decision is measurement-sensitive; acquire a better power/capacity/efficiency measurement before declaring degradation."
                : "The current interval does not cross the measured value. The decision is less sensitive to the stated input uncertainty, subject to the independence and normal-approximation assumptions."}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="border border-steel/15 p-3"><p className="font-mono text-[8px] uppercase text-steel">{label}</p><p className="mt-1 text-sm">{value}</p></div>;
}
