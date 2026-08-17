"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";

type ManualStep =
  | "location"
  | "geometry"
  | "envelope"
  | "hvac"
  | "occupancy";

const STEPS: ManualStep[] = [
  "location",
  "geometry",
  "envelope",
  "hvac",
  "occupancy",
];

/**
 * Progressive disclosure manual input — unknown values remain valid.
 * Never invents engineering values.
 */
export function ManualBuilder({ onDone }: { onDone?: () => void }) {
  const { state, setBuilding, setCenterMode, setStatus } = useWorkspace();
  const reduce = useReducedMotion();
  const [step, setStep] = useState<ManualStep>("location");
  const manual = state.building.manual;

  const patch = (partial: typeof manual) => {
    setBuilding({
      ...state.building,
      manual: { ...manual, ...partial },
    });
  };

  const idx = STEPS.indexOf(step);

  return (
    <motion.div
      className="flex h-full flex-col"
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="border-b border-steel/20 px-4 py-3">
        <h2 className="font-display text-xl text-paper">Build manually</h2>
        <p className="text-xs text-steel">
          Progressive steps · unknowns allowed · nothing inferred
        </p>
        <ol className="mt-3 flex flex-wrap gap-2">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => setStep(s)}
                className={`border px-2 py-1 text-[10px] uppercase tracking-[0.12em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal ${
                  s === step
                    ? "border-teal text-teal"
                    : i < idx
                      ? "border-steel/40 text-paper/70"
                      : "border-steel/20 text-steel"
                }`}
              >
                {s}
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {step === "location" && (
          <Field
            label="Location label"
            hint="Optional — unknown is valid"
            value={manual.locationLabel ?? ""}
            onChange={(v) => patch({ locationLabel: v || undefined })}
          />
        )}
        {step === "geometry" && (
          <>
            <Field
              label="Floor area (m²)"
              hint="Leave blank if unknown"
              value={manual.floorAreaM2?.toString() ?? ""}
              onChange={(v) =>
                patch({
                  floorAreaM2: v ? Number(v) || undefined : undefined,
                })
              }
              inputMode="decimal"
            />
            <Field
              label="Storeys"
              hint="Leave blank if unknown"
              value={manual.storeys?.toString() ?? ""}
              onChange={(v) =>
                patch({ storeys: v ? Number(v) || undefined : undefined })
              }
              inputMode="numeric"
            />
          </>
        )}
        {step === "envelope" && (
          <>
            <Field
              label="Wall construction"
              hint="Describe or leave unknown"
              value={manual.wallMaterial ?? ""}
              onChange={(v) => patch({ wallMaterial: v || undefined })}
            />
            <Field
              label="Roof construction"
              value={manual.roofMaterial ?? ""}
              onChange={(v) => patch({ roofMaterial: v || undefined })}
            />
            <Field
              label="Window type"
              value={manual.windowType ?? ""}
              onChange={(v) => patch({ windowType: v || undefined })}
            />
          </>
        )}
        {step === "hvac" && (
          <Field
            label="HVAC type"
            hint="No capacity inferred"
            value={manual.hvacType ?? ""}
            onChange={(v) => patch({ hvacType: v || undefined })}
          />
        )}
        {step === "occupancy" && (
          <Field
            label="Occupancy"
            hint="e.g. home / office — optional"
            value={manual.occupancy ?? ""}
            onChange={(v) => patch({ occupancy: v || undefined })}
          />
        )}
      </div>

      <div className="flex items-center justify-between border-t border-steel/20 px-4 py-3">
        <button
          type="button"
          disabled={idx === 0}
          onClick={() => setStep(STEPS[idx - 1])}
          className="text-sm text-steel disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
        >
          Back
        </button>
        {idx < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={() => setStep(STEPS[idx + 1])}
            className="border border-teal px-4 py-2 text-sm text-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setStatus("Manual model notes saved — no engineering values invented");
              setCenterMode("building");
              onDone?.();
            }}
            className="border border-gold px-4 py-2 text-sm text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
          >
            Open building model
          </button>
        )}
      </div>
    </motion.div>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  inputMode,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  inputMode?: "text" | "decimal" | "numeric";
}) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-[0.14em] text-steel">
        {label}
      </span>
      {hint ? <span className="mt-0.5 block text-[11px] text-steel/70">{hint}</span> : null}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        className="mt-2 w-full border border-steel/30 bg-transparent px-3 py-2 text-sm text-paper outline-none focus:border-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
      />
    </label>
  );
}
