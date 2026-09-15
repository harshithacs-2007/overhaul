"use client";

import { useMemo } from "react";
import { buildEconomicsSensitivity, defaultEconomicsSensitivity } from "@/lib/engineering/economicsSensitivity";

type Props = { context: { capexINR: number; annualSavingINR: number; annualEnergySavingKWh?: number; escalationRate?: number; discountRate?: number; analysisYears?: number; downtimeHours?: number; downtimeCostINRPerHour?: number } };

const money = (v: number | null) => v == null ? "—" : `₹${Math.round(v).toLocaleString("en-IN")}`;

export default function EconomicsSensitivityPanel({ context }: Props) {
  const rows = useMemo(() => buildEconomicsSensitivity(context, defaultEconomicsSensitivity(context)), [context]);
  if (!rows.length) return null;

  return (
    <section className="mx-auto mt-4 max-w-[1500px] px-4 sm:px-6 lg:px-8">
      <div className="border border-steel/15 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-teal">Decision robustness</p>
            <h3 className="mt-1 font-display text-2xl">Which assumptions could change the investment decision?</h3>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-steel">One-at-a-time ±20% tests expose the economic drivers without inventing missing values. A wide NPV swing identifies the measurement or commercial assumption worth validating first.</p>
          </div>
          <span className="font-mono text-[8px] uppercase text-steel">deterministic OAT</span>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse font-mono text-[9px]">
            <thead>
              <tr className="border-b border-steel/20 text-left uppercase tracking-[0.08em] text-steel">
                <th className="px-2 py-2">Driver</th>
                <th className="px-2 py-2">Low case</th>
                <th className="px-2 py-2">Base NPV</th>
                <th className="px-2 py-2">High case</th>
                <th className="px-2 py-2">NPV span</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const [lowNpv, highNpv] = row.npvRangeINR;
                return (
                  <tr key={row.parameter.key} className="border-b border-steel/10">
                    <td className="px-2 py-3 text-paper">{row.parameter.label}</td>
                    <td className="px-2 py-3">{money(row.low.npvINR)}</td>
                    <td className="px-2 py-3 text-teal">{money(row.base.npvINR)}</td>
                    <td className="px-2 py-3">{money(row.high.npvINR)}</td>
                    <td className="px-2 py-3">{money(lowNpv)} → {money(highNpv)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
