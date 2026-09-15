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
  emptyWizard,
  loadDemo,
  type WizardInput,
} from "./types";

type AssessmentSubject = "building" | "facility" | "equipment";
type AssessmentGoal =
  | "energy"
  | "performance"
  | "comfort"
  | "reliability"
  | "retrofit"
  | "unknown";

const FLOW_STEPS = [
  "Assessment",
  "Location",
  "Envelope",
  "HVAC",
  "Issues",
  "Review",
] as const;

const stepVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 40 : -40,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (dir: number) => ({
    x: dir > 0 ? -40 : 40,
    opacity: 0,
  }),
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
  const [subject, setSubject] = useState<AssessmentSubject | null>(null);
  const [goal, setGoal] = useState<AssessmentGoal | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [locQuery, setLocQuery] = useState("");
  const [locResults, setLocResults] = useState<
    Array<{
      id: number;
      label: string;
      latitude: number;
      longitude: number;
    }>
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

        if (!cancelled) {
          setLocResults(json.results ?? []);
        }
      } catch {
        if (!cancelled) {
          setLocResults([]);
        }
      } finally {
        if (!cancelled) {
          setLocLoading(false);
        }
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
        thicknessM:
          MATERIAL_PRESETS[data.wallMaterialId].defaultThicknessM,
      },
    ]).uValue;

    return efficiencyIndicatorFromU(u);
  }, [data.wallMaterialId]);

  const roofEff = useMemo(() => {
    const u = calculateAssemblyU([
      {
        materialId: data.roofMaterialId,
        thicknessM:
          MATERIAL_PRESETS[data.roofMaterialId].defaultThicknessM,
      },
    ]).uValue;

    return efficiencyIndicatorFromU(u);
  }, [data.roofMaterialId]);

  const windowEff = useMemo(() => {
    const u = calculateAssemblyU([
      {
        materialId: data.windowMaterialId,
        thicknessM:
          MATERIAL_PRESETS[data.windowMaterialId].defaultThicknessM,
      },
    ]).uValue;

    return efficiencyIndicatorFromU(u);
  }, [data.windowMaterialId]);

  const ribbonPos = useMemo(() => {
    const avg =
      (100 - (wallEff + roofEff + windowEff) / 3) / 100;

    return avg;
  }, [wallEff, roofEff, windowEff]);

  const go = useCallback(
    (next: number) => {
      setDir(next > step ? 1 : -1);
      setStep(next);
    },
    [step]
  );

  const patch = useCallback(
    (partial: Partial<WizardInput>) => {
      setData((d) => ({
        ...d,
        ...partial,
      }));
    },
    []
  );

  const onDemo = () => {
    setData(loadDemo());
    setLocQuery(DEMO_INPUT_LABEL);
    setSubject("building");
    setGoal("energy");
    setError(null);
    go(1);
  };

  const canNext = (): boolean => {
    if (step === 0) {
      return Boolean(subject && goal);
    }

    if (step === 1) {
      return Boolean(
        data.locationLabel &&
          data.latitude &&
          data.longitude
      );
    }

    return true;
  };

  const submit = async () => {
    if (subject !== "building") {
      setError(
        "The universal assessment path is selected. Equipment and facility analysis will use the evidence-driven workflow before engineering calculations are run."
      );
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload: WizardInput = {
        ...data,
        hvacUnknown:
          data.hvacSystemType === "dont_know",
        capacityTons:
          data.capacityUnit === "tons"
            ? data.capacityValue
            : data.capacityValue / KW_PER_TON,
      };

      const res = await fetch("/api/calculate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(
          json.error || "Calculation failed"
        );
      }

      sessionStorage.setItem(
        "overhaul:result",
        JSON.stringify({
          ...json,
          assessmentSubject: subject,
          assessmentGoal: goal,
        })
      );

      router.push("/results");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : String(err)
      );
    } finally {
      setSubmitting(false);
    }
  };

  const assessmentMode =
    subject === "equipment"
      ? "Equipment assessment"
      : subject === "facility"
        ? "Facility assessment"
        : "Building assessment";

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 pb-16 pt-8 sm:px-6">
      <ProgressBar
        step={step}
        total={FLOW_STEPS.length}
      />

      <header className="mt-8 flex items-start justify-between gap-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-steel">
            Evidence-first engineering intelligence
          </p>

          <h1 className="font-display mt-2 text-4xl tracking-tight text-paper sm:text-5xl">
            Overhaul
          </h1>

          <p className="mt-3 max-w-lg text-sm leading-relaxed text-steel">
            Assess buildings, facilities, or equipment with
            the least manual input needed to build a
            defensible engineering model.
          </p>

          {subject ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Chip selected>
                {assessmentMode}
              </Chip>

              {goal ? (
                <Chip selected>
                  {formatGoal(goal)}
                </Chip>
              ) : null}
            </div>
          ) : null}
        </div>

        <IsometricBuilding className="hidden h-28 w-36 text-steel/70 sm:block" />
      </header>

      <motion.div
        className="mt-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{
          delay: 0.2,
          duration: 0.4,
        }}
      >
        <ThermalRibbon
          position={ribbonPos}
          label={`${FLOW_STEPS[step]} · ${step + 1}/${FLOW_STEPS.length}`}
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

          <p className="mt-2 text-xs text-steel/80">
            {DEMO_NOTES}
          </p>
        </div>
      ) : null}

      <div className="mt-8 flex-1 overflow-hidden">
        <AnimatePresence
          mode="wait"
          custom={dir}
        >
          <motion.div
            key={step}
            custom={dir}
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              duration: 0.35,
              ease: "easeOut",
            }}
          >
            {step === 0 ? (
              <StepAssessment
                subject={subject}
                goal={goal}
                onSubject={(value) => {
                  setSubject(value);
                  setGoal(null);
                  setError(null);
                }}
                onGoal={(value) => {
                  setGoal(value);
                  setError(null);
                }}
              />
            ) : null}

            {step === 1 ? (
              <StepLocation
                data={data}
                patch={patch}
                locQuery={locQuery}
                setLocQuery={setLocQuery}
                locResults={locResults}
                locLoading={locLoading}
                showAdvanced={showAdvanced}
                setShowAdvanced={setShowAdvanced}
                subject={subject}
              />
            ) : null}

            {step === 2 ? (
              <StepEnvelope
                data={data}
                patch={patch}
                wallEff={wallEff}
                roofEff={roofEff}
                windowEff={windowEff}
              />
            ) : null}

            {step === 3 ? (
              <StepHvac
                data={data}
                patch={patch}
                subject={subject}
              />
            ) : null}

            {step === 4 ? (
              <StepIssues
                data={data}
                patch={patch}
                subject={subject}
              />
            ) : null}

            {step === 5 ? (
              <StepReview
                data={data}
                subject={subject}
                goal={goal}
                onJump={(next) => go(next)}
              />
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>

      {error ? (
        <p className="mt-4 border border-clay/40 px-3 py-2 text-sm leading-relaxed text-clay">
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

        {step < FLOW_STEPS.length - 1 ? (
          <button
            type="button"
            disabled={!canNext()}
            onClick={() => go(step + 1)}
            className="border border-teal bg-teal/10 px-5 py-2.5 text-sm text-teal disabled:opacity-40"
          >
            Continue
          </button>
        ) : subject === "building" ? (
          <button
            type="button"
            disabled={submitting || !canNext()}
            onClick={() => void submit()}
            className="border border-gold bg-gold/10 px-5 py-2.5 text-sm text-gold disabled:opacity-40"
          >
            {submitting
              ? "Calculating…"
              : "Calculate My Retrofit Plan"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() =>
              setError(
                "Evidence-driven facility and equipment analysis is the next assessment layer. No unsupported engineering calculation has been run."
              )
            }
            className="border border-teal bg-teal/10 px-5 py-2.5 text-sm text-teal"
          >
            Continue to Evidence Analysis
          </button>
        )}
      </div>
    </div>
  );
}

function StepAssessment({
  subject,
  goal,
  onSubject,
  onGoal,
}: {
  subject: AssessmentSubject | null;
  goal: AssessmentGoal | null;
  onSubject: (value: AssessmentSubject) => void;
  onGoal: (value: AssessmentGoal) => void;
}) {
  const subjects: Array<{
    value: AssessmentSubject;
    label: string;
    subtitle: string;
  }> = [
    {
      value: "building",
      label: "Building",
      subtitle:
        "Home, apartment, office, hospital, retail, or other structure",
    },
    {
      value: "facility",
      label: "Facility",
      subtitle:
        "Factory, plant, campus, warehouse, or multi-system site",
    },
    {
      value: "equipment",
      label: "Equipment",
      subtitle:
        "Chiller, compressor, pump, boiler, motor, or machinery",
    },
  ];

  const goals: Array<{
    value: AssessmentGoal;
    label: string;
  }> = [
    {
      value: "energy",
      label: "Energy",
    },
    {
      value: "performance",
      label: "Performance",
    },
    {
      value: "comfort",
      label: "Comfort",
    },
    {
      value: "reliability",
      label: "Reliability",
    },
    {
      value: "retrofit",
      label: "Retrofit planning",
    },
    {
      value: "unknown",
      label: "Not sure",
    },
  ];

  return (
    <section className="space-y-10">
      <div>
        <p className="text-[10px] uppercase tracking-[0.18em] text-steel">
          Step 01
        </p>

        <h2 className="font-display mt-1 text-2xl text-paper">
          What are you assessing?
        </h2>

        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-steel">
          Start broad. Overhaul chooses the appropriate engineering
          pathway after this.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {subjects.map((item) => (
          <TapCard
            key={item.value}
            selected={subject === item.value}
            onClick={() => onSubject(item.value)}
            title={item.label}
            subtitle={item.subtitle}
          />
        ))}
      </div>

      {subject ? (
        <motion.div
          initial={{
            opacity: 0,
            y: 8,
          }}
          animate={{
            opacity: 1,
            y: 0,
          }}
          transition={{
            duration: 0.25,
          }}
        >
          <p className="text-[10px] uppercase tracking-[0.18em] text-steel">
            Step 01B
          </p>

          <h3 className="font-display mt-1 text-2xl text-paper">
            What are you trying to improve?
          </h3>

          <div className="mt-4 flex flex-wrap gap-2">
            {goals.map((item) => (
              <Chip
                key={item.value}
                selected={goal === item.value}
                onClick={() => onGoal(item.value)}
              >
                {item.label}
              </Chip>
            ))}
          </div>
        </motion.div>
      ) : null}
    </section>
  );
}

function StepLocation({
  data,
  patch,
  locQuery,
  setLocQuery,
  locResults,
  locLoading,
  showAdvanced,
  setShowAdvanced,
  subject,
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
  subject: AssessmentSubject | null;
}) {
  return (
    <section className="space-y-8">
      <div>
        <h2 className="font-display text-2xl text-paper">
          Location & context
        </h2>

        <p className="mt-1 text-sm text-steel">
          Location establishes climate context. Exact technical
          conditions can be added from evidence later.
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
              patch({
                locationLabel: "",
                latitude: 0,
                longitude: 0,
              });
            }
          }}
          placeholder="Start typing a city, region, or address…"
          className="mt-2 w-full border border-steel/30 bg-transparent px-3 py-2.5 text-sm text-paper outline-none focus:border-teal"
        />

        {locLoading ? (
          <p className="mt-1 text-xs text-steel">
            Searching…
          </p>
        ) : null}

        {locResults.length > 0 &&
        !data.locationLabel ? (
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
            {data.locationLabel} ·{" "}
            {data.latitude.toFixed(2)},
            {" "}
            {data.longitude.toFixed(2)}
          </p>
        ) : null}
      </label>

      {subject === "equipment" ? (
        <div className="border border-teal/20 bg-teal/[0.02] p-4">
          <p className="text-[10px] uppercase tracking-[0.16em] text-teal">
            Equipment assessment
          </p>

          <p className="mt-2 text-sm leading-relaxed text-steel">
            Exact equipment behaviour will be established from
            evidence such as nameplates, technical documents,
            operating data, and observed conditions rather than
            inferred from age alone.
          </p>
        </div>
      ) : (
        <>
          <div>
            <div className="flex justify-between text-[11px] uppercase tracking-[0.14em] text-steel">
              <span>
                {subject === "facility"
                  ? "Approximate conditioned area"
                  : "Building area"}
              </span>

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
              onChange={(e) =>
                patch({
                  floorAreaM2: Number(
                    e.target.value
                  ),
                })
              }
              className="mt-3 w-full accent-teal"
            />
          </div>

          <div>
            <p className="mb-3 text-[11px] uppercase tracking-[0.14em] text-steel">
              Usage context
            </p>

            <div className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  [
                    "home",
                    "Home / residential",
                    "Residential occupancy",
                  ],
                  [
                    "office",
                    "Commercial",
                    "Office / service profile",
                  ],
                  [
                    "mixed",
                    "Mixed / other",
                    "Mixed or extended operation",
                  ],
                ] as const
              ).map(([id, label, subtitle]) => (
                <TapCard
                  key={id}
                  selected={
                    data.buildingType === id
                  }
                  onClick={() =>
                    patch({
                      buildingType: id,
                    })
                  }
                  title={label}
                  subtitle={subtitle}
                />
              ))}
            </div>
          </div>
        </>
      )}

      <div>
        <button
          type="button"
          className="text-xs text-steel underline-offset-2 hover:underline"
          onClick={() =>
            setShowAdvanced(!showAdvanced)
          }
        >
          {showAdvanced ? "Hide" : "Show"} advanced
        </button>

        {showAdvanced ? (
          <label className="mt-3 block">
            <span className="text-[11px] text-steel">
              Energy cost input — kept for current calculation
              compatibility
            </span>

            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={data.energyRateINR}
              onChange={(e) =>
                patch({
                  energyRateINR:
                    Number(e.target.value) || 0,
                })
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
        <h2 className="font-display text-2xl text-paper">
          Envelope
        </h2>

        <p className="mt-1 text-sm text-steel">
          Choose known materials where available. Unknown details
          will be handled through evidence rather than invented.
        </p>
      </div>

      <MaterialGroup
        label="Walls"
        options={WALL_OPTIONS}
        selected={data.wallMaterialId}
        onSelect={(id) =>
          patch({
            wallMaterialId:
              id as WizardInput["wallMaterialId"],
          })
        }
        eff={wallEff}
      />

      <MaterialGroup
        label="Roof"
        options={ROOF_OPTIONS}
        selected={data.roofMaterialId}
        onSelect={(id) =>
          patch({
            roofMaterialId:
              id as WizardInput["roofMaterialId"],
          })
        }
        eff={roofEff}
      />

      <MaterialGroup
        label="Windows"
        options={WINDOW_OPTIONS}
        selected={data.windowMaterialId}
        onSelect={(id) =>
          patch({
            windowMaterialId:
              id as WizardInput["windowMaterialId"],
          })
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
          const m =
            MATERIAL_PRESETS[
              id as keyof typeof MATERIAL_PRESETS
            ];

          return (
            <TapCard
              key={id}
              selected={selected === id}
              onClick={() => onSelect(id)}
              title={m.label}
              subtitle={`λ ${m.lambda} W/m·K · ${
                m.defaultThicknessM * 1000
              } mm`}
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
  subject,
}: {
  data: WizardInput;
  patch: (p: Partial<WizardInput>) => void;
  subject: AssessmentSubject | null;
}) {
  const displayCapacity = data.capacityValue;

  return (
    <section className="space-y-8">
      <div>
        <h2 className="font-display text-2xl text-paper">
          {subject === "equipment"
            ? "System context"
            : "HVAC"}
        </h2>

        <p className="mt-1 text-sm text-steel">
          Provide only what you know. Equipment-specific behaviour
          will ultimately come from evidence and validated models.
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
                hvacUnknown:
                  id === "dont_know",
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
                  selected={
                    data.capacityUnit === "tons"
                  }
                  onClick={() => {
                    if (
                      data.capacityUnit === "kW"
                    ) {
                      patch({
                        capacityUnit: "tons",
                        capacityValue:
                          data.capacityValue /
                          KW_PER_TON,
                      });
                    }
                  }}
                >
                  tons
                </Chip>

                <Chip
                  selected={
                    data.capacityUnit === "kW"
                  }
                  onClick={() => {
                    if (
                      data.capacityUnit ===
                      "tons"
                    ) {
                      patch({
                        capacityUnit: "kW",
                        capacityValue:
                          data.capacityValue *
                          KW_PER_TON,
                      });
                    }
                  }}
                >
                  kW
                </Chip>
              </div>
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-steel">
                Rated capacity
              </span>

              <span className="font-mono-num text-paper">
                {displayCapacity.toFixed(1)}{" "}
                {data.capacityUnit}
              </span>
            </div>

            <input
              type="range"
              min={
                data.capacityUnit === "tons"
                  ? 0.5
                  : 1.5
              }
              max={
                data.capacityUnit === "tons"
                  ? 30
                  : 100
              }
              step={0.5}
              value={data.capacityValue}
              onChange={(e) =>
                patch({
                  capacityValue:
                    Number(e.target.value),
                })
              }
              className="mt-3 w-full accent-teal"
            />
          </div>

          <div>
            <p className="mb-3 text-[11px] uppercase tracking-[0.14em] text-steel">
              Equipment age
            </p>

            <div className="flex flex-wrap gap-2">
              {(
                [
                  "<5",
                  "5-10",
                  "10-15",
                  "15+",
                ] as const
              ).map((r) => (
                <Chip
                  key={r}
                  selected={
                    data.ageRange === r
                  }
                  onClick={() =>
                    patch({
                      ageRange: r,
                    })
                  }
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
                  selected={
                    data.zoning ===
                    "single"
                  }
                  onClick={() =>
                    patch({
                      zoning: "single",
                    })
                  }
                >
                  Single zone
                </Chip>

                <Chip
                  selected={
                    data.zoning === "multi"
                  }
                  onClick={() =>
                    patch({
                      zoning: "multi",
                    })
                  }
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
                  selected={
                    data.ventilation ===
                    "natural"
                  }
                  onClick={() =>
                    patch({
                      ventilation: "natural",
                    })
                  }
                >
                  Natural
                </Chip>

                <Chip
                  selected={
                    data.ventilation ===
                    "mechanical"
                  }
                  onClick={() =>
                    patch({
                      ventilation:
                        "mechanical",
                    })
                  }
                >
                  Mechanical
                </Chip>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="border border-teal/20 bg-teal/[0.02] p-4">
          <p className="text-sm leading-relaxed text-steel">
            System details are unknown. Overhaul should use
            evidence such as a nameplate, technical document, or
            operating data before making equipment-specific
            engineering claims.
          </p>
        </div>
      )}
    </section>
  );
}

function StepIssues({
  data,
  patch,
  subject,
}: {
  data: WizardInput;
  patch: (p: Partial<WizardInput>) => void;
  subject: AssessmentSubject | null;
}) {
  const toggle = (
    issue: WizardInput["reportedIssues"][number]
  ) => {
    const set = new Set(data.reportedIssues);

    if (set.has(issue)) {
      set.delete(issue);
    } else {
      set.add(issue);
    }

    patch({
      reportedIssues: [...set],
    });
  };

  const issues =
    subject === "equipment"
      ? ([
          ["uneven_temp", "Temperature instability"],
          ["high_bills", "High energy use"],
          ["frequent_cycling", "Frequent starts / cycling"],
          ["poor_airflow", "Poor flow / output"],
        ] as const)
      : ([
          ["uneven_temp", "Uneven temperature"],
          ["high_bills", "High energy bills"],
          ["frequent_cycling", "Frequent cycling"],
          ["poor_airflow", "Poor airflow"],
        ] as const);

  return (
    <section className="space-y-6">
      <div>
        <h2 className="font-display text-2xl text-paper">
          Reported symptoms
        </h2>

        <p className="mt-1 text-sm text-steel">
          Optional. This describes what the user/operator sees;
          it does not replace engineering evidence.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {issues.map(([id, label]) => (
          <Chip
            key={id}
            selected={data.reportedIssues.includes(
              id
            )}
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
  subject,
  goal,
  onJump,
}: {
  data: WizardInput;
  subject: AssessmentSubject | null;
  goal: AssessmentGoal | null;
  onJump: (step: number) => void;
}) {
  const rows: Array<{
    step: number;
    label: string;
    value: string;
  }> = [
    {
      step: 0,
      label: "Assessment",
      value: `${formatSubject(
        subject
      )} · ${formatGoal(goal)}`,
    },
    {
      step: 1,
      label: "Location",
      value: `${data.locationLabel || "—"}${
        data.locationLabel
          ? ` · ${data.latitude.toFixed(
              2
            )}, ${data.longitude.toFixed(2)}`
          : ""
      }`,
    },
    {
      step: 1,
      label:
        subject === "facility"
          ? "Area"
          : subject === "equipment"
            ? "Asset context"
            : "Area",
      value:
        subject === "equipment"
          ? "Evidence-driven equipment assessment"
          : `${data.floorAreaM2} m² · ${data.buildingType}`,
    },
    {
      step: 2,
      label: "Envelope",
      value: `${MATERIAL_PRESETS[
        data.wallMaterialId
      ].label} / ${
        MATERIAL_PRESETS[data.roofMaterialId]
          .label
      } / ${
        MATERIAL_PRESETS[
          data.windowMaterialId
        ].label
      }`,
    },
    {
      step: 3,
      label: "HVAC",
      value:
        data.hvacSystemType === "dont_know"
          ? "Unknown"
          : `${HVAC_SYSTEM_LABELS[
              data.hvacSystemType
            ]} · ${data.capacityValue.toFixed(
              1
            )} ${data.capacityUnit}`,
    },
    {
      step: 4,
      label: "Reported symptoms",
      value:
        data.reportedIssues.length > 0
          ? data.reportedIssues.join(", ")
          : "None reported",
    },
  ];

  return (
    <section className="space-y-6">
      <div>
        <h2 className="font-display text-2xl text-paper">
          Review assessment
        </h2>

        <p className="mt-1 text-sm text-steel">
          Confirm the available context before the next engineering
          layer.
        </p>
      </div>

      <ul className="divide-y divide-steel/20 border border-steel/20">
        {rows.map((row) => (
          <li key={`${row.step}-${row.label}`}>
            <button
              type="button"
              onClick={() => onJump(row.step)}
              className="flex w-full items-start justify-between gap-4 px-4 py-3 text-left hover:bg-paper/5"
            >
              <span className="text-[11px] uppercase tracking-[0.14em] text-steel">
                {row.label}
              </span>

              <span className="max-w-[70%] text-right text-sm text-paper">
                {row.value}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {subject !== "building" ? (
        <div className="border border-gold/25 bg-gold/[0.03] p-4">
          <p className="text-[10px] uppercase tracking-[0.16em] text-gold">
            Evidence-first path
          </p>

          <p className="mt-2 text-sm leading-relaxed text-steel">
            This assessment will not invent engineering values
            just to produce a result. Facility and equipment analysis
            will use evidence, digital-shadow models, observed-versus-
            expected behaviour, and validated calculations before a
            retrofit decision is issued.
          </p>
        </div>
      ) : null}
    </section>
  );
}

const DEMO_INPUT_LABEL = "Bengaluru, India";

function formatSubject(
  subject: AssessmentSubject | null
): string {
  if (!subject) {
    return "Not selected";
  }

  if (subject === "building") {
    return "Building";
  }

  if (subject === "facility") {
    return "Facility";
  }

  return "Equipment";
}

function formatGoal(
  goal: AssessmentGoal | null
): string {
  if (!goal) {
    return "Not selected";
  }

  const labels: Record<
    AssessmentGoal,
    string
  > = {
    energy: "Energy",
    performance: "Performance",
    comfort: "Comfort",
    reliability: "Reliability",
    retrofit: "Retrofit planning",
    unknown: "Not sure",
  };

  return labels[goal];
}
