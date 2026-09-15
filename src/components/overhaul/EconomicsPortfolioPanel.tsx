"use client";

import { useMemo } from "react";
import { calculateRetrofitEconomics } from "@/lib/engineering/economicsEngine";
import { optimizeRetrofitPortfolio, type PortfolioOption } from "@/lib/engineering/portfolioOptimizer";

export default function EconomicsPortfolioPanel() {
  const demoOptions: PortfolioOption[] = useMemo(() => [
    { id: "envelope", name: "Envelope heat-flow reduction", capexINR: 180000, annualSavingINR: 52000, annualEnergySavingKWh: 4100, carbonSavingKgPerYear: 3200, downtimeHours: 4 },
    { id: "hvac", name: "HVAC efficiency upgrade", capexINR: 260000, annualSavingINR: 88000, annualEnergySavingKWh: 6900, carbonSavingKgPerYear: 5400, downtimeHours: 8 },
    { id: "controls", name: "Controls + runtime optimisation", capexINR: 75000, annualSavingINR: 36000, annualEnergySavingKWh: 2800, carbonSavingKgPerYear: 2200, downtimeHours: 1, priorityWeight: 1.1 },
  ], []);
  const portfolio = useMemo(() => optimizeRetrofitPortfolio(demoOptions, { budgetINR: 350000, maxDowntimeHours: 8, maxActions: 3 }), [demoOptions]);
  const economics = useMemo(() => calculateRetrofitEconomics({ capexINR: portfolio.totalCapexINR, annualSavingINR: portfolio.totalAnnualSavingINR, annualEnergySavingKWh: portfolio.totalAnnualEnergySavingKWh, analysisYears: 10, discountRate: 0.08, escalationRate: 0.03 }), [portfolio]);

  return (
    <section className="mx-auto mt-4 max-w-[1500px] px-4 sm:px-6 lg:px-8">
      <div className="border border-steel/20 bg-black/15 p-5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-teal">Decision economics + constrained portfolio</p>
            <h2 className="font-display mt-1 text-3xl sm:text-4xl">Choose what should happen first.</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-steel">The decision layer combines engineering outputs with explicit budget and downtime constraints. Example values are isolated to this demonstration surface; real deployments should substitute evidence-backed intervention outputs.</p>
          </div>
          <div className="font-mono text-[9px] uppercase text-steel">budget ₹3.5L · downtime 8h</div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-4">
          <Metric label="Selected capex" value={`₹${portfolio.totalCapexINR.toLocaleString("en-IN")}`} />
          <Metric label="Annual saving" value={`₹${portfolio.totalAnnualSavingINR.toLocaleString("en-IN")}`} />
          <Metric label="Energy saving" value={`${portfolio.totalAnnualEnergySavingKWh.toLocaleString("en-IN")} kWh/yr`} />
          <Metric label="Payback" value={economics.simplePaybackYears == null ? "Not viable" : `${economics.simplePaybackYears.toFixed(1)} yr`} />
        </div>

        <div className="mt-4 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="font-mono text-[9px] uppercase text-teal">Recommended portfolio</p>
            <div className="mt-3 space-y-2">
              {portfolio.selected.map((option, index) => (
                <div key={option.id} className="flex items-center justify-between gap-4 border border-steel/15 p-3">
                  <div><span className="font-mono text-[8px] text-teal">0{index + 1}</span><span className="ml-3 text-sm">{option.name}</span></div>
                  <span className="font-mono text-[9px] text-steel">₹{option.annualSavingINR.toLocaleString("en-IN")}/yr</span>
                </div>
              ))}
            </div>
          </div>
          <div className="border border-steel/15 p-4">
            <p className="font-mono text-[9px] uppercase text-steel">Financial view</p>
            <div className="mt-3 space-y-2 text-xs text-steel">
              <p>NPV: <span className="text-paper">₹{(economics.npvINR ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span></p>
              <p>IRR: <span className="text-paper">{economics.irrPercent == null ? "—" : `${economics.irrPercent.toFixed(1)}%`}</span></p>
              <p>Implementation cost incl. downtime: <span className="text-paper">₹{(economics.implementationCostINR ?? 0).toLocaleString("en-IN")}</span></p>
              <p>Lifecycle cost delta: <span className="text-paper">₹{(economics.lifecycleCostDeltaINR ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span></p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="border border-steel/15 p-4"><p className="font-mono text-[8px] uppercase text-steel">{label}</p><p className="mt-1 text-lg text-paper">{value}</p></div>;
}
