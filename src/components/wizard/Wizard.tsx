"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { IsometricBuilding } from "@/components/IsometricBuilding";
import { ThermalRibbon } from "@/components/ThermalRibbon";
import {
  Chip,
  EfficiencyDot,
  ProgressBar,
  TapCard,
} from "@/components/ui/TapCard";
import {
  MATERIAL_PRESETS,
  ROOF_OPTIONS,
  WALL_OPTIONS,
  WINDOW_OPTIONS,
} from "@/lib/calculations/materials";
import {
  calculateAssemblyU,
  efficiencyIndicatorFromU,
} from "@/lib/calculations/thermal";
import { HVAC_SYSTEM_LABELS, KW_PER_TON } from "@/lib/calculations/hvac";
import {
  DEMO_NOTES,
  WIZARD_STEPS,
  emptyWizard,
  loadDemo,
  type WizardInput,
} from "./types";

const stepVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -40 : 40, opacity: 0 }),
};

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function Wizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [data, setData] = useState<WizardInput>(emptyWizard);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [locQuery, setLocQuery] = useState("");
  const [locResults, setLocResults] = useState<
    Array<{ id: number; label: string; latitude: number; longitude: number }>
  >([]);
  const [locLoading, setLocLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debouncedQuery = useDebounced(locQuery, 350);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (debouncedQuery.trim().length < 2) {
        setLocResults([]);
        return;
      }
      setLocLoading(true);
      try {
        const res = await fetch(
          `/api/geocode?q=${encodeURIComponent(debouncedQuery.trim())}`
        );
        const json = await res.json();
        if (!cancelled) setLocResults(json.results ?? []);
      } catch {
        if (!cancelled) setLocResults([]);
      } finally {
        if (!cancelled) setLocLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  const wallEff = useMemo(() => {
    const u = calculateAssemblyU([
      {
        materialId: data.wallMaterialId,
        thicknessM: MATERIAL_PRESETS[data.wallMaterialId].defaultThicknessM,
      },
    ]).uValue;
    return efficiencyIndicatorFromU(u);
  }, [data.wallMaterialId]);

  const roofEff = useMemo(() => {
    const u = calculateAssemblyU([
      {
        materialId: data.roofMaterialId,
        thicknessM: MATERIAL_PRESETS[data.roofMaterialId].defaultThicknessM,
      },
    ]).uValue;
    return efficiencyIndicatorFromU(u);
  }, [data.roofMaterialId]);

  const windowEff = useMemo(() => {
    const u = calculateAssemblyU([
      {
        materialId: data.windowMaterialId,
        thicknessM: MATERIAL_PRESETS[data.windowMaterialId].defaultThicknessM,
      },
    ]).uValue;
    return efficiencyIndicatorFromU(u);
  }, [data.windowMaterialId]);

  const ribbonPos = useMemo(() => {
    // Live preview: worse envelope → higher stress position
    const avg = (100 - (wallEff + roofEff + windowEff) / 3) / 100;
    return avg;
  }, [wallEff, roofEff, windowEff]);

  const go = useCallback((next: number) => {
    setDir(next > step ? 1 : -1);
    setStep(next);
  }, [step]);

  const patch = useCallback((partial: Partial<WizardInput>) => {
    setData((d) => ({ ...d, ...partial }));
  }, []);

  const onDemo = () => {
    setData(loadDemo());
    setLocQuery(DEMO_INPUT_LABEL);
    setError(null);
    go(0);
  };

  const canNext = (): boolean => {
    if (step === 0) {
      return Boolean(data.locationLabel && data.latitude && data.longitude);
    }
    return true;
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const payload: WizardInput = {
        ...data,
        hvacUnknown: data.hvacSystemType === "dont_know",
        capacityTons:
          data.capacityUnit === "tons"
            ? data.capacityValue
            : data.capacityValue / KW_PER_TON,
      };
      const res = await fetch("/api/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Calculation failed");
      }
      sessionStorage.setItem("overhaul:result", JSON.stringify(json));
      router.push("/results");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 pb-16 pt-8 sm:px-6">
      <ProgressBar step={step} total={WIZARD_STEPS.length} />

      <header className="mt-8 flex items-start justify-between gap-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-steel">
            Deterministic retrofit engine
          </p>
          <h1 className="font-display mt-2 text-4xl tracking-tight text-paper sm:text-5xl">
            Overhaul
          </h1>
          <p className="mt-3 max-w-md text-sm text-steel">
            Rank envelope and HVAC actions together with real thermal formulas —
            no ML, every number traced.
          </p>
        </div>
        <IsometricBuilding className="hidden h-28 w-36 text-steel/70 sm:block" />
      </header>

      <motion.div
        className="mt-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.85, duration: 0.4 }}
      >
        <ThermalRibbon
          position={ribbonPos}
          label={`envelope preview · step ${step + 1}/${WIZARD_STEPS.length}`}
        />
      </motion.div>

      {step === 0 ? (
        <div className="mt-6">
          <button
            type="button"
            onClick={onDemo}
            className="border border-gold/60 px-4 py-2 text-xs uppercase tracking-[0.16em] text-gold hover:bg-gold/10"
          >
            Load Demo Example
          </button>
          <p className="mt-2 text-xs text-steel/80">{DEMO_NOTES}</p>
        </div>
      ) : null}

      <div className="mt-8 flex-1 overflow-hidden">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={step}
            custom={dir}
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            {step === 0 && (
              <StepLocation
                data={data}
                patch={patch}
                locQuery={locQuery}
                setLocQuery={setLocQuery}
                locResults={locResults}
                locLoading={locLoading}
                showAdvanced={showAdvanced}
                setShowAdvanced={setShowAdvanced}
              />
            )}
            {step === 1 && (
              <StepEnvelope
                data={data}
                patch={patch}
                wallEff={wallEff}
                roofEff={roofEff}
                windowEff={windowEff}
              />
            )}
            {step === 2 && <StepHvac data={data} patch={patch} />}
            {step === 3 && <StepIssues data={data} patch={patch} />}
            {step === 4 && (
              <StepReview data={data} onJump={(s) => go(s)} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {error ? (
        <p className="mt-4 border border-clay/40 px-3 py-2 text-sm text-clay">
          {error}
        </p>
      ) : null}

      <div className="mt-10 flex items-center justify-between border-t border-steel/20 pt-6">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => go(step - 1)}
          className="text-sm text-steel disabled:opacity-30"
        >
          Back
        </button>
        {step < WIZARD_STEPS.length - 1 ? (
          <button
            type="button"
            disabled={!canNext()}
            onClick={() => go(step + 1)}
            className="border border-teal bg-teal/10 px-5 py-2.5 text-sm text-teal disabled:opacity-40"
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            disabled={submitting || !canNext()}
            onClick={() => void submit()}
            className="border border-gold bg-gold/10 px-5 py-2.5 text-sm text-gold disabled:opacity-40"
          >
            {submitting ? "Calculating…" : "Calculate My Retrofit Plan"}
          </button>
        )}
      </div>
    </div>
  );
}

const DEMO_INPUT_LABEL = "Bengaluru, India";

function StepLocation({
  data,
  patch,
  locQuery,
  setLocQuery,
  locResults,
  locLoading,
  showAdvanced,
  setShowAdvanced,
}: {
  data: WizardInput;
  patch: (p: Partial<WizardInput>) => void;
  locQuery: string;
  setLocQuery: (v: string) => void;
  locResults: Array<{
    id: number;
    label: string;
    latitude: number;
    longitude: number;
  }>;
  locLoading: boolean;
  showAdvanced: boolean;
  setShowAdvanced: (v: boolean) => void;
}) {
  return (
    <section className="space-y-8">
      <div>
        <h2 className="font-display text-2xl text-paper">Location & size</h2>
        <p className="mt-1 text-sm text-steel">
          Climate drives outdoor temperature for the load calculation.
        </p>
      </div>

      <label className="block">
        <span className="text-[11px] uppercase tracking-[0.14em] text-steel">
          Location
        </span>
        <input
          value={locQuery || data.locationLabel}
          onChange={(e) => {
            setLocQuery(e.target.value);
            if (data.locationLabel) {
              patch({ locationLabel: "", latitude: 0, longitude: 0 });
            }
          }}
          placeholder="Start typing a city…"
          className="mt-2 w-full border border-steel/30 bg-transparent px-3 py-2.5 text-sm text-paper outline-none focus:border-teal"
        />
        {locLoading ? (
          <p className="mt-1 text-xs text-steel">Searching…</p>
        ) : null}
        {locResults.length > 0 && !data.locationLabel ? (
          <ul className="mt-2 border border-steel/20">
            {locResults.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="w-full border-b border-steel/15 px-3 py-2 text-left text-sm hover:bg-paper/5"
                  onClick={() => {
                    patch({
                      locationLabel: r.label,
                      latitude: r.latitude,
                      longitude: r.longitude,
                    });
                    setLocQuery(r.label);
                  }}
                >
                  {r.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {data.locationLabel ? (
          <p className="mt-2 font-mono-num text-xs text-teal">
            {data.locationLabel} · {data.latitude.toFixed(2)},{" "}
            {data.longitude.toFixed(2)}
          </p>
        ) : null}
      </label>

      <div>
        <div className="flex justify-between text-[11px] uppercase tracking-[0.14em] text-steel">
          <span>Building area</span>
          <span className="font-mono-num text-paper">
            {data.floorAreaM2} m²
          </span>
        </div>
        <input
          type="range"
          min={40}
          max={2000}
          step={10}
          value={data.floorAreaM2}
          onChange={(e) => patch({ floorAreaM2: Number(e.target.value) })}
          className="mt-3 w-full accent-teal"
        />
      </div>

      <div>
        <p className="mb-3 text-[11px] uppercase tracking-[0.14em] text-steel">
          Building type
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ["home", "Home"],
              ["office", "Office"],
              ["mixed", "Mixed"],
            ] as const
          ).map(([id, label]) => (
            <TapCard
              key={id}
              selected={data.buildingType === id}
              onClick={() => patch({ buildingType: id })}
              title={label}
              subtitle={
                id === "home"
                  ? "Residential occupancy hours"
                  : id === "office"
                    ? "Business-day profile"
                    : "Extended mixed use"
              }
            />
          ))}
        </div>
      </div>

      <div>
        <button
          type="button"
          className="text-xs text-steel underline-offset-2 hover:underline"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {showAdvanced ? "Hide" : "Show"} advanced — energy rate
        </button>
        {showAdvanced ? (
          <label className="mt-3 block">
            <span className="text-[11px] text-steel">
              Energy rate (₹/kWh) — default ₹8 placeholder
            </span>
            <input
              type="number"
              min={1}
              max={50}
              step={0.5}
              value={data.energyRateINR}
              onChange={(e) =>
                patch({ energyRateINR: Number(e.target.value) || 8 })
              }
              className="mt-2 w-40 border border-steel/30 bg-transparent px-3 py-2 font-mono-num text-sm outline-none focus:border-teal"
            />
          </label>
        ) : null}
      </div>
    </section>
  );
}

function StepEnvelope({
  data,
  patch,
  wallEff,
  roofEff,
  windowEff,
}: {
  data: WizardInput;
  patch: (p: Partial<WizardInput>) => void;
  wallEff: number;
  roofEff: number;
  windowEff: number;
}) {
  return (
    <section className="space-y-8">
      <div>
        <h2 className="font-display text-2xl text-paper">Envelope</h2>
        <p className="mt-1 text-sm text-steel">
          Tap materials — live efficiency indicator uses U-value from λ presets.
        </p>
      </div>

      <MaterialGroup
        label="Walls"
        options={WALL_OPTIONS}
        selected={data.wallMaterialId}
        onSelect={(id) =>
          patch({ wallMaterialId: id as WizardInput["wallMaterialId"] })
        }
        eff={wallEff}
      />
      <MaterialGroup
        label="Roof"
        options={ROOF_OPTIONS}
        selected={data.roofMaterialId}
        onSelect={(id) =>
          patch({ roofMaterialId: id as WizardInput["roofMaterialId"] })
        }
        eff={roofEff}
      />
      <MaterialGroup
        label="Windows"
        options={WINDOW_OPTIONS}
        selected={data.windowMaterialId}
        onSelect={(id) =>
          patch({ windowMaterialId: id as WizardInput["windowMaterialId"] })
        }
        eff={windowEff}
      />
    </section>
  );
}

function MaterialGroup({
  label,
  options,
  selected,
  onSelect,
  eff,
}: {
  label: string;
  options: readonly string[];
  selected: string;
  onSelect: (id: string) => void;
  eff: number;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.14em] text-steel">
          {label}
        </p>
        <EfficiencyDot value={eff} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((id) => {
          const m = MATERIAL_PRESETS[id as keyof typeof MATERIAL_PRESETS];
          return (
            <TapCard
              key={id}
              selected={selected === id}
              onClick={() => onSelect(id)}
              title={m.label}
              subtitle={`λ ${m.lambda} W/m·K · ${m.defaultThicknessM * 1000} mm`}
            />
          );
        })}
      </div>
    </div>
  );
}

function StepHvac({
  data,
  patch,
}: {
  data: WizardInput;
  patch: (p: Partial<WizardInput>) => void;
}) {
  const displayCapacity =
    data.capacityUnit === "tons"
      ? data.capacityValue
      : data.capacityValue;

  return (
    <section className="space-y-8">
      <div>
        <h2 className="font-display text-2xl text-paper">HVAC</h2>
        <p className="mt-1 text-sm text-steel">
          Capacity toggles tons ↔ kW. &quot;Don&apos;t Know&quot; uses a mid-range
          split AC default (lower confidence).
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {(
          Object.keys(HVAC_SYSTEM_LABELS) as Array<
            keyof typeof HVAC_SYSTEM_LABELS
          >
        ).map((id) => (
          <TapCard
            key={id}
            selected={data.hvacSystemType === id}
            onClick={() =>
              patch({
                hvacSystemType: id,
                hvacUnknown: id === "dont_know",
              })
            }
            title={HVAC_SYSTEM_LABELS[id]}
          />
        ))}
      </div>

      {data.hvacSystemType !== "dont_know" ? (
        <>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-[0.14em] text-steel">
                Capacity
              </p>
              <div className="flex gap-2">
                <Chip
                  selected={data.capacityUnit === "tons"}
                  onClick={() => {
                    if (data.capacityUnit === "kW") {
                      patch({
                        capacityUnit: "tons",
                        capacityValue: data.capacityValue / KW_PER_TON,
                      });
                    }
                  }}
                >
                  tons
                </Chip>
                <Chip
                  selected={data.capacityUnit === "kW"}
                  onClick={() => {
                    if (data.capacityUnit === "tons") {
                      patch({
                        capacityUnit: "kW",
                        capacityValue: data.capacityValue * KW_PER_TON,
                      });
                    }
                  }}
                >
                  kW
                </Chip>
              </div>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-steel">Rated capacity</span>
              <span className="font-mono-num text-paper">
                {displayCapacity.toFixed(1)} {data.capacityUnit}
              </span>
            </div>
            <input
              type="range"
              min={data.capacityUnit === "tons" ? 0.5 : 1.5}
              max={data.capacityUnit === "tons" ? 30 : 100}
              step={data.capacityUnit === "tons" ? 0.5 : 0.5}
              value={data.capacityValue}
              onChange={(e) =>
                patch({ capacityValue: Number(e.target.value) })
              }
              className="mt-3 w-full accent-teal"
            />
          </div>

          <div>
            <p className="mb-3 text-[11px] uppercase tracking-[0.14em] text-steel">
              Equipment age
            </p>
            <div className="flex flex-wrap gap-2">
              {(["<5", "5-10", "10-15", "15+"] as const).map((r) => (
                <Chip
                  key={r}
                  selected={data.ageRange === r}
                  onClick={() => patch({ ageRange: r })}
                >
                  {r === "<5"
                    ? "< 5 years"
                    : r === "15+"
                      ? "15+ years"
                      : `${r} years`}
                </Chip>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-[11px] uppercase tracking-[0.14em] text-steel">
                Zoning
              </p>
              <div className="flex gap-2">
                <Chip
                  selected={data.zoning === "single"}
                  onClick={() => patch({ zoning: "single" })}
                >
                  Single zone
                </Chip>
                <Chip
                  selected={data.zoning === "multi"}
                  onClick={() => patch({ zoning: "multi" })}
                >
                  Multi zone
                </Chip>
              </div>
            </div>
            <div>
              <p className="mb-2 text-[11px] uppercase tracking-[0.14em] text-steel">
                Ventilation
              </p>
              <div className="flex gap-2">
                <Chip
                  selected={data.ventilation === "natural"}
                  onClick={() => patch({ ventilation: "natural" })}
                >
                  Natural
                </Chip>
                <Chip
                  selected={data.ventilation === "mechanical"}
                  onClick={() => patch({ ventilation: "mechanical" })}
                >
                  Mechanical
                </Chip>
              </div>
            </div>
          </div>
        </>
      ) : (
        <p className="border border-clay/30 px-3 py-2 text-sm text-clay">
          Using mid-range 3-ton split AC default — results will show a low
          confidence badge.
        </p>
      )}
    </section>
  );
}

function StepIssues({
  data,
  patch,
}: {
  data: WizardInput;
  patch: (p: Partial<WizardInput>) => void;
}) {
  const toggle = (issue: WizardInput["reportedIssues"][number]) => {
    const set = new Set(data.reportedIssues);
    if (set.has(issue)) set.delete(issue);
    else set.add(issue);
    patch({ reportedIssues: [...set] });
  };

  return (
    <section className="space-y-6">
      <div>
        <h2 className="font-display text-2xl text-paper">Reported issues</h2>
        <p className="mt-1 text-sm text-steel">
          Optional — weights ranking. You can skip this step.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["uneven_temp", "Uneven temperature"],
            ["high_bills", "High energy bills"],
            ["frequent_cycling", "Frequent cycling"],
            ["poor_airflow", "Poor airflow"],
          ] as const
        ).map(([id, label]) => (
          <Chip
            key={id}
            selected={data.reportedIssues.includes(id)}
            onClick={() => toggle(id)}
          >
            {label}
          </Chip>
        ))}
      </div>
    </section>
  );
}

function StepReview({
  data,
  onJump,
}: {
  data: WizardInput;
  onJump: (step: number) => void;
}) {
  const rows: Array<{ step: number; label: string; value: string }> = [
    {
      step: 0,
      label: "Location",
      value: `${data.locationLabel || "—"} · ${data.floorAreaM2} m² · ${data.buildingType}`,
    },
    {
      step: 1,
      label: "Envelope",
      value: `${MATERIAL_PRESETS[data.wallMaterialId].label} / ${MATERIAL_PRESETS[data.roofMaterialId].label} / ${MATERIAL_PRESETS[data.windowMaterialId].label}`,
    },
    {
      step: 2,
      label: "HVAC",
      value:
        data.hvacSystemType === "dont_know"
          ? "Don't Know → default mid-range split AC"
          : `${HVAC_SYSTEM_LABELS[data.hvacSystemType]} · ${data.capacityValue.toFixed(1)} ${data.capacityUnit} · age ${data.ageRange} · ${data.zoning} zone · ${data.ventilation} vent`,
    },
    {
      step: 3,
      label: "Issues",
      value:
        data.reportedIssues.length > 0
          ? data.reportedIssues.join(", ")
          : "None reported",
    },
    {
      step: 0,
      label: "Energy rate",
      value: `₹${data.energyRateINR}/kWh`,
    },
  ];

  return (
    <section className="space-y-6">
      <div>
        <h2 className="font-display text-2xl text-paper">Review</h2>
        <p className="mt-1 text-sm text-steel">
          Tap any row to jump back and edit.
        </p>
      </div>
      <ul className="divide-y divide-steel/20 border border-steel/20">
        {rows.map((r) => (
          <li key={r.label}>
            <button
              type="button"
              onClick={() => onJump(r.step)}
              className="flex w-full items-start justify-between gap-4 px-4 py-3 text-left hover:bg-paper/5"
            >
              <span className="text-[11px] uppercase tracking-[0.14em] text-steel">
                {r.label}
              </span>
              <span className="text-right text-sm text-paper">{r.value}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
