"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { IsometricBuilding } from "@/components/IsometricBuilding";
import { ThermalRibbon } from "@/components/ThermalRibbon";
import type { PipelineResult } from "@/lib/calculations/pipeline";
import type { RetrofitAction } from "@/lib/calculations/ranking";

type SortView = "cost" | "carbon" | "comfort" | "hvac";
type ClimateView = "today" | "2035";

interface ApiPayload {
  today: PipelineResult;
  future: PipelineResult;
  comparison: {
    orderChanged: boolean;
    todayOrder: string[];
    futureOrder: string[];
    changes: string[];
  };
  meta: { noML: boolean; engine: string };
}

function formatINR(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function formatNum(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(digits);
}

function CountUp({ value, digits = 0 }: { value: number; digits?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let frame: number;
    const start = performance.now();
    const dur = 700;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      setV(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <span className="font-mono-num">{v.toFixed(digits)}</span>;
}

function sortActions(actions: RetrofitAction[], view: SortView): RetrofitAction[] {
  const copy = [...actions];
  switch (view) {
    case "cost":
      return copy.sort(
        (a, b) => (a.paybackYears ?? 999) - (b.paybackYears ?? 999)
      );
    case "carbon":
      return copy.sort((a, b) => b.carbonSavedKgCO2e - a.carbonSavedKgCO2e);
    case "comfort":
      return copy.sort((a, b) => {
        const score = (x: RetrofitAction) =>
          (x.category === "zoning" ? 3 : 0) +
          (x.category === "ventilation" ? 2 : 0) +
          (x.category.startsWith("envelope") ? 1 : 0);
        return score(b) - score(a);
      });
    case "hvac":
      return copy.sort((a, b) => {
        const h = (x: RetrofitAction) =>
          x.category.startsWith("hvac") || x.category === "zoning" ? 1 : 0;
        return h(b) - h(a) || b.finalScore - a.finalScore;
      });
    default:
      return copy;
  }
}

export function ResultsView() {
  const [payload, setPayload] = useState<ApiPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [climateView, setClimateView] = useState<ClimateView>("today");
  const [sortView, setSortView] = useState<SortView>("cost");
  const [methodOpen, setMethodOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("overhaul:result");
      if (!raw) {
        setError("No results found. Run the wizard first.");
        return;
      }
      setPayload(JSON.parse(raw) as ApiPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load results");
    }
  }, []);

  const active = climateView === "today" ? payload?.today : payload?.future;
  const actions = useMemo(() => {
    if (!active) return [];
    return sortView === "cost" && climateView
      ? sortActions(active.actions, sortView)
      : sortActions(active.actions, sortView);
  }, [active, sortView, climateView]);

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <p className="text-clay">{error}</p>
        <Link href="/" className="mt-6 inline-block text-teal underline">
          Back to wizard
        </Link>
      </div>
    );
  }

  if (!payload || !active) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center text-steel">
        Loading results…
      </div>
    );
  }

  const ribbonPos = active.ranked.hvacVerdict.thermalRibbonPosition;
  const topId = actions[0]?.id;

  return (
    <div className="mx-auto max-w-4xl px-4 pb-24 pt-8 sm:px-6">
      <div className="flex items-start justify-between gap-6">
        <div>
          <Link
            href="/"
            className="text-[11px] uppercase tracking-[0.16em] text-steel hover:text-paper"
          >
            ← New assessment
          </Link>
          <h1 className="font-display mt-3 text-4xl text-paper">
            Retrofit plan
          </h1>
          <p className="mt-2 text-sm text-steel">
            {active.input.locationLabel} ·{" "}
            <span className="font-mono-num">{active.input.floorAreaM2}</span> m² ·{" "}
            {active.climate.yearLabel}
          </p>
        </div>
        <IsometricBuilding className="hidden h-24 w-32 text-steel/60 sm:block" />
      </div>

      <div className="mt-8">
        <ThermalRibbon
          position={ribbonPos}
          label={`load/capacity ${formatNum(active.ranked.hvacVerdict.loadFactor, 2)}`}
        />
      </div>

      {/* Summary strip */}
      <div className="mt-8 grid gap-4 border border-steel/25 p-4 sm:grid-cols-4">
        <Stat
          label="Thermal load"
          value={<><CountUp value={active.thermal.totalLoadKW} digits={2} /> kW</>}
        />
        <Stat
          label="Rated capacity"
          value={
            <span className="font-mono-num">
              {(
                active.ranked.hvacVerdict.capacityRatio *
                active.thermal.totalLoadKW
              ).toFixed(1)}{" "}
              kW
            </span>
          }
        />
        <Stat
          label="Outdoor temp"
          value={
            <span className="font-mono-num">
              {active.climate.outdoorTempC.toFixed(1)}°C
            </span>
          }
        />
        <Stat
          label="Extreme heat +5°C"
          value={
            <span className="font-mono-num">
              {active.extremeHeatLoadKW.toFixed(2)} kW
            </span>
          }
        />
      </div>

      {/* HVAC verdict */}
      <div className="mt-6 border border-steel/25 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-xl text-paper">HVAC verdict</h2>
          <span className="border border-steel/40 px-2 py-0.5 font-mono-num text-[11px] uppercase text-steel">
            {active.ranked.hvacVerdict.verdict}
          </span>
          {active.confidence !== "high" ? (
            <span className="border border-clay/50 px-2 py-0.5 text-[11px] uppercase tracking-wide text-clay">
              Confidence: {active.confidence}
            </span>
          ) : null}
        </div>
        <p className="mt-3 text-sm leading-relaxed text-paper/90">
          {active.ranked.hvacVerdict.recommendation}
        </p>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-steel">
          <span>
            Efficiency loss:{" "}
            <span className="font-mono-num text-paper">
              {active.ranked.hvacVerdict.efficiencyLossPct}%
            </span>
          </span>
          <span>
            Maintenance risk:{" "}
            <span className="text-paper">
              {active.ranked.hvacVerdict.maintenanceRisk}
            </span>
          </span>
          <span>
            Priority:{" "}
            <span className="text-paper">{active.ranked.hvacVerdict.priority}</span>
          </span>
        </div>
        {active.confidenceNotes.length > 0 ? (
          <ul className="mt-3 space-y-1 text-xs text-clay/90">
            {active.confidenceNotes.map((n) => (
              <li key={n}>• {n}</li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* Toggles */}
      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["today", "Today"],
              ["2035", "2035 projected"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setClimateView(id)}
              className={`border px-3 py-1.5 text-xs ${
                climateView === id
                  ? "border-teal text-teal"
                  : "border-steel/30 text-steel"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["cost", "Cost"],
              ["carbon", "Carbon"],
              ["comfort", "Comfort"],
              ["hvac", "HVAC sizing"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSortView(id)}
              className={`border px-3 py-1.5 text-xs ${
                sortView === id
                  ? "border-paper text-paper"
                  : "border-steel/30 text-steel"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {payload.comparison.orderChanged ? (
        <div className="mt-4 border border-gold/40 bg-gold/5 px-4 py-3 text-sm text-gold">
          Ranking order changes between Today and 2035 projected climate.
          <ul className="mt-2 space-y-1 text-xs text-gold/80">
            {payload.comparison.changes.slice(0, 5).map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-4 text-xs text-steel">
          Ranking order is stable between Today and 2035 for this building.
        </p>
      )}

      {/* Extreme heat panel */}
      <div className="mt-6 border border-clay/30 p-4">
        <h3 className="text-[11px] uppercase tracking-[0.14em] text-clay">
          Extreme-heat stress test
        </h3>
        <p className="mt-2 text-sm text-paper/90">
          At outdoor +5°C vs current climate snapshot, envelope load rises to{" "}
          <span className="font-mono-num text-clay">
            {active.extremeHeatLoadKW.toFixed(2)} kW
          </span>{" "}
          (
          <span className="font-mono-num">
            {(
              ((active.extremeHeatLoadKW - active.thermal.totalLoadKW) /
                active.thermal.totalLoadKW) *
              100
            ).toFixed(0)}
            %
          </span>{" "}
          higher). Capacity ratio under stress:{" "}
          <span className="font-mono-num">
            {(
              (active.ranked.hvacVerdict.capacityRatio *
                active.thermal.totalLoadKW) /
              active.extremeHeatLoadKW
            ).toFixed(2)}
          </span>
          .
        </p>
      </div>

      {/* Ranked actions */}
      <div className="mt-10 space-y-4">
        <h2 className="font-display text-2xl text-paper">Ranked actions</h2>
        {actions.map((action, i) => (
          <motion.article
            key={`${climateView}-${action.id}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.35, ease: "easeOut" }}
            className={`border p-5 ${
              action.id === topId
                ? "border-gold/70 bg-gold/5"
                : "border-steel/25"
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="font-mono-num text-steel">
                  #{String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="text-lg text-paper">{action.title}</h3>
              </div>
              {action.id === topId ? (
                <span className="text-[11px] uppercase tracking-[0.14em] text-gold">
                  Top recommendation
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-sm text-steel">{action.description}</p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <Metric label="Cost" value={formatINR(action.costINR)} />
              <Metric
                label="Carbon saved / yr"
                value={`${formatNum(action.carbonSavedKgCO2e, 0)} kg CO₂e`}
              />
              <Metric
                label="Energy saved / yr"
                value={`${formatNum(action.annualKWhSaved, 0)} kWh`}
              />
              <Metric
                label="Payback"
                value={
                  action.paybackYears != null
                    ? `${formatNum(action.paybackYears, 1)} yr`
                    : "—"
                }
              />
              <Metric
                label="Carbon payback"
                value={
                  action.carbonPaybackYears != null
                    ? `${formatNum(action.carbonPaybackYears, 1)} yr`
                    : "—"
                }
              />
              <Metric
                label="Eff. loss context"
                value={
                  action.efficiencyLossPct != null
                    ? `${action.efficiencyLossPct}%`
                    : "—"
                }
              />
              <Metric
                label="Maintenance"
                value={action.maintenanceRisk ?? action.maintenanceImpact}
              />
              <Metric label="Comfort" value={action.comfortImpact} />
            </dl>
            {action.carbonFlag ? (
              <p className="mt-3 text-xs text-clay">{action.carbonFlag}</p>
            ) : null}
            <p className="mt-4 border-t border-steel/15 pt-3 text-xs leading-relaxed text-steel">
              <span className="text-paper/80">Why ranked here: </span>
              {action.whyRankedHere}
            </p>
          </motion.article>
        ))}
      </div>

      {/* Methodology */}
      <div className="mt-12 border border-steel/25">
        <button
          type="button"
          className="flex w-full items-center justify-between px-5 py-4 text-left"
          onClick={() => setMethodOpen(!methodOpen)}
        >
          <span className="font-display text-xl text-paper">
            How we calculated this
          </span>
          <span className="text-steel">{methodOpen ? "−" : "+"}</span>
        </button>
        {methodOpen ? (
          <div className="space-y-6 border-t border-steel/20 px-5 py-5 text-sm text-steel">
            <section>
              <h4 className="text-[11px] uppercase tracking-[0.14em] text-paper">
                Real formulas
              </h4>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>R_layer = thickness_m / λ; Total R = Σ layers + air films; U = 1/Total_R</li>
                <li>Heat Flux (kW) = U × Area × (T_out − T_in) / 1000</li>
                <li>annualKWh = loadReductionKW × hours/day × 365; payback = cost / annualCostSaved</li>
                <li>carbonPayback = embodied / annualOperationalCarbonSaved</li>
                <li>efficiencyLossPct from loadFactor short-cycling band (15–30%)</li>
              </ul>
            </section>
            <section>
              <h4 className="text-[11px] uppercase tracking-[0.14em] text-paper">
                Sourced data
              </h4>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  Material λ presets — standard building science tables (CIBSE Guide A / ASHRAE Fundamentals mid-range)
                </li>
                <li>
                  Embodied carbon coefficients — ICE / published EPD mid-range values as listed in material presets
                </li>
                <li>
                  HVAC short-cycling waste — documented HVAC sizing studies (&quot;10-minute rule&quot;); humidity note cites ASHRAE RP-1340
                </li>
                <li>
                  Climate — Open-Meteo Weather API (current) and Open-Meteo Climate API CMIP6 (2035)
                </li>
                <li>Air films — ISO 6946 / CIBSE conventional R_si, R_se</li>
              </ul>
            </section>
            <section>
              <h4 className="text-[11px] uppercase tracking-[0.14em] text-paper">
                Stated assumptions
              </h4>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Default energy rate ₹8/kWh (editable placeholder)</li>
                <li>Mechanical ventilation +15% load factor (documented assumption, not cited)</li>
                <li>Material lifespans: concrete ~50–60 yr, insulation ~25–30 yr</li>
                <li>15-year HVAC service life threshold; age degradation not modeled year-by-year</li>
                <li>Envelope area geometry from floor area (square plan, 3 m storey, 20% window-to-wall)</li>
                <li>India grid ~0.82 kg CO₂e/kWh (documented placeholder)</li>
                <li>Retrofit unit costs are India-market mid-range placeholders</li>
                <li>Indoor setpoint 24°C for cooling-season analysis</li>
                <li>No ML / AI model anywhere in this engine</li>
              </ul>
            </section>
            <p className="text-xs">
              Climate source: {active.climate.source}. Fetched{" "}
              <span className="font-mono-num">{active.climate.fetchedAt}</span>.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.14em] text-steel">
        {label}
      </div>
      <div className="mt-1 text-sm text-paper">{value}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.12em] text-steel">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-paper">{value}</dd>
    </div>
  );
}
