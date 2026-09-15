"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  buildEquipmentTwin,
  type EquipmentClass,
  type EquipmentObservation,
  type ExpectedEquipmentSignal,
  type EquipmentSignalKey,
} from "@/lib/engineering/equipmentTwin";

type RawObservation = {
  field: string;
  value: string;
  numericValue: number | null;
  unit: string | null;
  confidence: number;
  sourceText: string;
};

type Extraction = { evidenceId?: string; evidenceType?: string; observations?: RawObservation[] };

type Props = {
  assetClass?: string | null;
  extracts: Extraction[];
};

const CLASS_LABELS: Record<EquipmentClass, string> = {
  "air-conditioner": "Air conditioner",
  chiller: "Chiller",
  compressor: "Compressor",
  pump: "Pump",
  "fan-motor": "Fan / motor",
  boiler: "Boiler",
  refrigeration: "Refrigeration",
  other: "Equipment",
};

function canonical(field: string): EquipmentSignalKey | null {
  const x = field.toLowerCase().replaceAll(" ", "_");
  if (x.includes("power")) return "power_kw";
  if (x.includes("capacity")) return "capacity_kw";
  if (x.includes("flow")) return "flow_m3h";
  if (x.includes("pressure")) return "pressure_bar";
  if (x.includes("supply") && x.includes("temp")) return "supply_temp_c";
  if (x.includes("return") && x.includes("temp")) return "return_temp_c";
  if ((x.includes("ambient") || x.includes("outdoor")) && x.includes("temp")) return "ambient_temp_c";
  if (x.includes("speed") && x.includes("rpm")) return "speed_rpm";
  if (x.includes("runtime")) return "runtime_h";
  if (x.includes("efficiency")) return "efficiency";
  if (x === "cop" || x.includes("cop")) return "cop";
  return null;
}

function detectClass(assetClass: string | null | undefined, observations: RawObservation[]): EquipmentClass {
  const text = `${assetClass ?? ""} ${observations.map((o) => `${o.field} ${o.value}`).join(" ")}`.toLowerCase();
  if (text.includes("chiller")) return "chiller";
  if (text.includes("compressor")) return "compressor";
  if (text.includes("pump")) return "pump";
  if (text.includes("boiler")) return "boiler";
  if (text.includes("refrigerat")) return "refrigeration";
  if (text.includes("fan") || text.includes("motor")) return "fan-motor";
  if (text.includes("ac") || text.includes("air conditioner") || text.includes("hvac")) return "air-conditioner";
  return "other";
}

function num(observations: EquipmentObservation[], key: EquipmentSignalKey) {
  const hit = observations.find((o) => o.key === key && Number.isFinite(o.value));
  return hit?.value ?? null;
}

export default function EquipmentPerformanceTwinPanel({ assetClass, extracts }: Props) {
  const [phase, setPhase] = useState<"capture" | "model" | "compare">("capture");
  const flat = useMemo(() => extracts.flatMap((x) => x.observations ?? []), [extracts]);
  const observations = useMemo<EquipmentObservation[]>(() => flat.flatMap((o) => {
    const key = canonical(o.field);
    if (!key || o.numericValue == null || !Number.isFinite(o.numericValue)) return [];
    return [{ key, value: o.numericValue, unit: o.unit ?? "", confidence: o.confidence }];
  }), [flat]);
  const equipmentClass = detectClass(assetClass, flat);

  const expected = useMemo<ExpectedEquipmentSignal[]>(() => {
    const ratedCapacity = num(observations, "capacity_kw");
    const expectedEfficiency = num(observations, "efficiency");
    const reference = { source: "manufacturer" as const, basis: "validated rated operating reference supplied with evidence" };
    if (ratedCapacity != null && expectedEfficiency != null && ratedCapacity > 0 && expectedEfficiency > 0) {
      return [{ key: "power_kw", expected: ratedCapacity / expectedEfficiency, unit: "kW", toleranceRelative: 0.1, reference }];
    }
    const explicitExpectedPower = num(observations, "power_kw_expected");
    if (explicitExpectedPower != null && explicitExpectedPower > 0) {
      return [{ key: "power_kw", expected: explicitExpectedPower, unit: "kW", toleranceRelative: 0.1, reference }];
    }
    return [];
  }, [observations]);

  const result = useMemo(() => buildEquipmentTwin({ equipmentClass, observations, expected }), [equipmentClass, observations, expected]);
  const currentPower = num(observations, "power_kw");
  const currentCapacity = num(observations, "capacity_kw");

  const exportSpec = () => {
    const payload = {
      schemaVersion: "overhaul-equipment-scene-1.0",
      equipmentClass,
      model: assetClass ?? "unknown",
      confidence: flat.length ? Math.round(flat.reduce((s, o) => s + o.confidence, 0) / flat.length * 100) : 0,
      signals: Object.fromEntries(observations.map((o) => [o.key, { value: o.value, unit: o.unit, confidence: o.confidence }])),
      performanceTwin: result.expected.map((x) => ({ key: x.key, expected: x.expected, unit: x.unit, toleranceRelative: x.toleranceRelative, reference: x.reference })),
      blender: { generator: "scripts/blender/generate_equipment_twin.py", editable: true },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `overhaul-${equipmentClass}-twin.json`;
    a.click();
    URL.revokeObjectURL(href);
  };

  return (
    <section className="mt-5 border border-steel/20 bg-black/10 p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-teal">Equipment intelligence</p>
          <h2 className="mt-1 font-display text-3xl">See what this machine should do — then test what it actually does.</h2>
          <p className="mt-2 max-w-4xl text-xs leading-5 text-steel">The visual model is a supporting representation for the retrofit diagnosis. The engineering twin is the healthy performance reference; the current asset is evaluated against that reference only when its basis is independently validated.</p>
        </div>
        <button type="button" onClick={exportSpec} className="shrink-0 border border-teal/40 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.12em] text-teal hover:bg-teal/5">Export Blender/CAD scene spec</button>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="border border-steel/15 p-4 sm:p-5">
          <div className="flex flex-wrap gap-2 font-mono text-[8px] uppercase tracking-[0.12em] text-steel">
            {["capture", "model", "compare"].map((p) => <button key={p} type="button" onClick={() => setPhase(p as typeof phase)} className={`border px-2 py-1 ${phase === p ? "border-teal text-teal" : "border-steel/15"}`}>{p}</button>)}
          </div>

          <div className="relative mt-5 min-h-[320px] overflow-hidden border border-steel/15 bg-[radial-gradient(circle_at_50%_50%,rgba(52,211,188,0.08),transparent_42%)]">
            <div className="absolute inset-0 grid grid-cols-8 grid-rows-6 opacity-20">
              {Array.from({ length: 48 }).map((_, i) => <div key={i} className="border-r border-b border-steel/15" />)}
            </div>
            <motion.div animate={{ rotateY: phase === "model" ? [0, 8, -8, 0] : 0, scale: phase === "compare" ? 1.04 : 1 }} transition={{ duration: 1.8, repeat: phase === "model" ? Infinity : 0 }} className="absolute left-1/2 top-1/2 h-40 w-64 -translate-x-1/2 -translate-y-1/2 [transform-style:preserve-3d]">
              <div className="absolute inset-0 border-2 border-paper/40 bg-paper/[0.025]" />
              <div className="absolute -left-5 top-7 h-24 w-5 border border-teal/40 bg-teal/[0.04]" />
              <div className="absolute -right-5 top-7 h-24 w-5 border border-teal/40 bg-teal/[0.04]" />
              {[0, 1, 2].map((i) => <motion.div key={i} animate={{ rotate: phase === "compare" ? 360 : 0 }} transition={{ duration: 2.5 - i * .25, repeat: phase === "compare" ? Infinity : 0, ease: "linear" }} className="absolute h-12 w-12 rounded-full border border-teal/50" style={{ left: `${18 + i * 30}%`, bottom: "-18px" }} />)}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center"><p className="font-mono text-[9px] uppercase text-teal">{CLASS_LABELS[equipmentClass]}</p><p className="mt-2 text-[10px] text-steel">{phase === "capture" ? "evidence anchors" : phase === "model" ? "semantic + parametric model" : "healthy ↔ current"}</p></div>
            </motion.div>
            <div className="absolute bottom-4 left-4 right-4 grid gap-2 sm:grid-cols-4">
              {["Identity", "Geometry", "Performance", "Condition"].map((x, i) => <div key={x} className="border border-steel/15 bg-navy/80 p-2"><p className="font-mono text-[7px] uppercase text-steel">0{i + 1} · {x}</p><p className="mt-1 text-[10px]">{i === 0 ? (assetClass || "unknown") : i === 1 ? `${observations.length} linked signals` : i === 2 ? (expected.length ? "reference ready" : "reference needed") : (result.healthScore != null ? `${result.healthScore.toFixed(0)} / 100` : "not evaluated")}</p></div>)}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <Stat label="Class" value={CLASS_LABELS[equipmentClass]} />
            <Stat label="Rated capacity" value={currentCapacity != null ? `${currentCapacity.toFixed(1)} kW` : "Evidence needed"} />
            <Stat label="Current power" value={currentPower != null ? `${currentPower.toFixed(1)} kW` : "Evidence needed"} />
            <Stat label="Healthy reference" value={expected.length ? `${expected.length} signals` : "Not established"} />
          </div>
          <div className="border border-clay/25 bg-clay/5 p-4">
            <p className="font-mono text-[8px] uppercase text-clay">Evidence gate</p>
            <p className="mt-2 text-xs leading-5">{expected.length ? "Independent reference available for comparison." : "Take a clear nameplate/performance-sheet photo or provide a validated operating reference before OVERHAUL claims degradation."}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {result.residuals.length ? result.residuals.map((r) => (
          <div key={r.key} className="border border-steel/15 p-4">
            <div className="flex items-center justify-between"><span className="font-mono text-[8px] uppercase text-steel">{r.key.replaceAll("_", " ")}</span><span className={`font-mono text-[8px] uppercase ${r.severity === "critical" ? "text-clay" : "text-teal"}`}>{r.severity}</span></div>
            <div className="mt-3 flex items-end justify-between"><div><p className="text-[8px] uppercase text-steel">actual</p><p className="text-xl">{r.observed.toFixed(1)} {r.unit}</p></div><div className="text-right"><p className="text-[8px] uppercase text-steel">healthy</p><p className="text-xl text-teal">{r.expected.toFixed(1)} {r.unit}</p></div></div>
            <p className="mt-2 font-mono text-[9px] text-steel">Δ {((r.relativeResidual) * 100).toFixed(1)}%</p>
          </div>
        )) : (
          <div className="border border-steel/15 p-4 md:col-span-3"><p className="font-mono text-[8px] uppercase text-steel">Comparison</p><p className="mt-2 text-sm">No valid independent reference is currently available. The model is intentionally not scoring the machine.</p></div>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-3 border border-steel/15 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div><p className="font-mono text-[8px] uppercase text-steel">Retrofit consequence</p><p className="mt-1 text-xs">A confirmed performance deviation can flow into <span className="text-paper">repair → controls → retrofit → replacement</span> ranking, alongside cost, energy, carbon and downtime constraints.</p></div>
        <div className="font-mono text-[8px] uppercase text-steel">Blender generator · parametric · editable</div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="border border-steel/15 p-3"><p className="font-mono text-[8px] uppercase text-steel">{label}</p><p className="mt-1 text-lg">{value}</p></div>;
}
