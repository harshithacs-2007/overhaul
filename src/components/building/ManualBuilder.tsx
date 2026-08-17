"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import {
  collectUnknowns,
  createEmptyEngineeringModel,
  userProvided,
  validateEngineeringModel,
  type BuildingType,
  type EngineeringReadyModel,
  type HvacSystemType,
} from "@/lib/engineering";
import { toSquareMeters, toKilowatts, type AreaUnit, type CapacityUnit } from "@/lib/engineering/units";

type Step =
  | "location"
  | "building"
  | "envelope"
  | "hvac"
  | "operations"
  | "review";

const STEPS: Step[] = [
  "location",
  "building",
  "envelope",
  "hvac",
  "operations",
  "review",
];

/**
 * Progressive modeling workflow on existing workspace.
 * Unknowns valid — never invents engineering values.
 */
export function ManualBuilder({ onDone }: { onDone?: () => void }) {
  const { state, setBuilding, setEngineering, setCenterMode, setStatus } =
    useWorkspace();
  const reduce = useReducedMotion();
  const [step, setStep] = useState<Step>("location");
  const [model, setModel] = useState<EngineeringReadyModel>(
    () => state.engineering ?? createEmptyEngineeringModel()
  );
  const [locQuery, setLocQuery] = useState(model.location?.query ?? "");
  const [locBusy, setLocBusy] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [areaDisplay, setAreaDisplay] = useState(
    model.building.floorAreaM2.value?.toString() ?? ""
  );
  const [areaUnit, setAreaUnit] = useState<AreaUnit>("m2");
  const [capDisplay, setCapDisplay] = useState(
    model.hvac.systems[0]?.ratedCapacityKW.value?.toString() ?? ""
  );
  const [capUnit, setCapUnit] = useState<CapacityUnit>("kW");

  const idx = STEPS.indexOf(step);
  const hvac = model.hvac.systems[0];
  const wall = model.envelope.surfaces.find((s) => s.kind === "wall");
  const roof = model.envelope.surfaces.find((s) => s.kind === "roof");
  const win = model.envelope.surfaces.find((s) => s.kind === "window");

  const patchModel = (next: EngineeringReadyModel) => {
    const withUnknowns = {
      ...next,
      updatedAt: new Date().toISOString(),
      unknowns: collectUnknowns(next),
    };
    setModel(withUnknowns);
    setEngineering(withUnknowns);
  };

  const resolveLocation = async () => {
    setLocBusy(true);
    setLocError(null);
    try {
      const res = await fetch("/api/location/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: locQuery, includeClimate: true }),
      });
      const json = await res.json();
      if (!res.ok) {
        setLocError(json.message || json.error || "Location resolve failed");
        return;
      }
      patchModel({
        ...model,
        location: json.location,
        climate: json.climate,
      });
      setStatus(
        json.climate?.completeness?.engineeringUsable
          ? "Location + climate context loaded"
          : "Location loaded — climate incomplete (see warnings)"
      );
    } catch (err) {
      setLocError(err instanceof Error ? err.message : String(err));
    } finally {
      setLocBusy(false);
    }
  };

  const issues = validateEngineeringModel(model);

  return (
    <motion.div
      className="flex h-full flex-col"
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="border-b border-steel/20 px-4 py-3">
        <h2 className="font-display text-xl text-paper">Verified building model</h2>
        <p className="text-xs text-steel">
          Location → Building → Envelope → HVAC → Operations → Review · unknowns allowed
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
          <>
            <Field
              label="Address or place"
              hint="City names are approximate — not exact building parcels"
              value={locQuery}
              onChange={setLocQuery}
            />
            <button
              type="button"
              disabled={locBusy || locQuery.trim().length < 2}
              onClick={() => void resolveLocation()}
              className="border border-teal px-4 py-2 text-sm text-teal disabled:opacity-40"
            >
              {locBusy ? "Resolving…" : "Resolve location + climate"}
            </button>
            {locError ? <p className="text-xs text-clay">{locError}</p> : null}
            {model.location ? (
              <dl className="space-y-2 border border-steel/20 p-3 text-xs">
                <Row label="Resolved" value={model.location.displayName} />
                <Row label="Precision" value={model.location.precision} />
                <Row
                  label="Coordinates"
                  value={`${model.location.coordinates.latitude.toFixed(4)}, ${model.location.coordinates.longitude.toFixed(4)}`}
                />
                <Row label="Timezone" value={model.location.timezone ?? "—"} />
                <Row
                  label="Climate usable"
                  value={
                    model.climate?.completeness.engineeringUsable ? "yes" : "no"
                  }
                />
              </dl>
            ) : null}
            {model.climate?.warnings?.length ? (
              <ul className="space-y-1 text-[11px] text-steel">
                {model.climate.warnings.map((w) => (
                  <li key={w}>• {w}</li>
                ))}
              </ul>
            ) : null}
          </>
        )}

        {step === "building" && (
          <>
            <label className="block text-[11px] uppercase tracking-[0.14em] text-steel">
              Building type
              <select
                className="mt-2 w-full border border-steel/30 bg-navy px-3 py-2 text-sm text-paper"
                value={(model.building.type.value as string) ?? ""}
                onChange={(e) => {
                  const v = e.target.value as BuildingType | "";
                  patchModel({
                    ...model,
                    building: {
                      ...model.building,
                      type: v
                        ? userProvided(v as BuildingType)
                        : model.building.type,
                    },
                  });
                }}
              >
                <option value="">Unknown</option>
                <option value="home">Home</option>
                <option value="office">Office</option>
                <option value="mixed">Mixed</option>
                <option value="other">Other</option>
              </select>
            </label>
            <div className="flex gap-2">
              <Field
                label="Floor area"
                hint="Leave blank if unknown"
                value={areaDisplay}
                onChange={setAreaDisplay}
                inputMode="decimal"
              />
              <label className="mt-6 block text-[11px] text-steel">
                Unit
                <select
                  className="mt-2 block border border-steel/30 bg-navy px-2 py-2 text-sm text-paper"
                  value={areaUnit}
                  onChange={(e) => setAreaUnit(e.target.value as AreaUnit)}
                >
                  <option value="m2">m²</option>
                  <option value="ft2">ft²</option>
                </select>
              </label>
            </div>
            <button
              type="button"
              className="text-xs text-teal"
              onClick={() => {
                if (!areaDisplay.trim()) {
                  patchModel({
                    ...model,
                    building: { ...model.building, floorAreaM2: createEmptyEngineeringModel().building.floorAreaM2 },
                  });
                  return;
                }
                try {
                  const m2 = toSquareMeters(Number(areaDisplay), areaUnit);
                  patchModel({
                    ...model,
                    building: {
                      ...model.building,
                      floorAreaM2: userProvided(m2, {
                        displayUnit: areaUnit,
                        originalValue: Number(areaDisplay),
                      }),
                    },
                  });
                  // Mirror into Phase 2 viz model
                  setBuilding({
                    ...state.building,
                    manual: {
                      ...state.building.manual,
                      floorAreaM2: m2,
                      locationLabel: model.location?.displayName,
                      latitude: model.location?.coordinates.latitude,
                      longitude: model.location?.coordinates.longitude,
                    },
                  });
                } catch (err) {
                  setStatus(err instanceof Error ? err.message : "Invalid area");
                }
              }}
            >
              Apply area (normalized to m²)
            </button>
            <Field
              label="Floors"
              hint="Optional"
              value={model.building.floors.value?.toString() ?? ""}
              onChange={(v) =>
                patchModel({
                  ...model,
                  building: {
                    ...model.building,
                    floors: v
                      ? userProvided(Number(v))
                      : createEmptyEngineeringModel().building.floors,
                  },
                })
              }
              inputMode="numeric"
            />
            <Field
              label="Age (years)"
              value={model.building.ageYears.value?.toString() ?? ""}
              onChange={(v) =>
                patchModel({
                  ...model,
                  building: {
                    ...model.building,
                    ageYears: v
                      ? userProvided(Number(v))
                      : createEmptyEngineeringModel().building.ageYears,
                  },
                })
              }
              inputMode="numeric"
            />
            <Field
              label="Orientation (°)"
              hint="0–359, optional"
              value={model.building.orientationDeg.value?.toString() ?? ""}
              onChange={(v) =>
                patchModel({
                  ...model,
                  building: {
                    ...model.building,
                    orientationDeg: v
                      ? userProvided(Number(v))
                      : createEmptyEngineeringModel().building.orientationDeg,
                  },
                })
              }
              inputMode="decimal"
            />
          </>
        )}

        {step === "envelope" && wall && roof && win && (
          <>
            <Field
              label="Wall construction"
              value={wall.materialNotes.value ?? ""}
              onChange={(v) =>
                patchSurface(model, patchModel, wall.id, {
                  materialNotes: v ? userProvided(v) : wall.materialNotes,
                })
              }
            />
            <Field
              label="Wall insulation"
              value={wall.insulationNotes.value ?? ""}
              onChange={(v) =>
                patchSurface(model, patchModel, wall.id, {
                  insulationNotes: v ? userProvided(v) : wall.insulationNotes,
                })
              }
            />
            <Field
              label="Roof construction"
              value={roof.materialNotes.value ?? ""}
              onChange={(v) =>
                patchSurface(model, patchModel, roof.id, {
                  materialNotes: v ? userProvided(v) : roof.materialNotes,
                })
              }
            />
            <Field
              label="Glazing"
              hint="Shown because envelope includes windows"
              value={win.glazingType.value ?? ""}
              onChange={(v) =>
                patchSurface(model, patchModel, win.id, {
                  glazingType: v ? userProvided(v) : win.glazingType,
                })
              }
            />
            <Field
              label="Shading notes"
              value={win.shadingNotes.value ?? ""}
              onChange={(v) =>
                patchSurface(model, patchModel, win.id, {
                  shadingNotes: v ? userProvided(v) : win.shadingNotes,
                })
              }
            />
          </>
        )}

        {step === "hvac" && hvac && (
          <>
            <label className="block text-[11px] uppercase tracking-[0.14em] text-steel">
              System type
              <select
                className="mt-2 w-full border border-steel/30 bg-navy px-3 py-2 text-sm text-paper"
                value={(hvac.systemType.value as string) ?? ""}
                onChange={(e) => {
                  const v = e.target.value as HvacSystemType | "";
                  patchHvac(model, patchModel, hvac.id, {
                    systemType: v
                      ? userProvided(v as HvacSystemType)
                      : hvac.systemType,
                    providesCooling:
                      v && v !== "boiler" && v !== "furnace"
                        ? userProvided(true)
                        : hvac.providesCooling,
                    providesHeating:
                      v === "heat_pump" || v === "boiler" || v === "furnace"
                        ? userProvided(true)
                        : hvac.providesHeating,
                  });
                }}
              >
                <option value="">Unknown</option>
                <option value="split_ac">Split AC</option>
                <option value="heat_pump">Heat pump</option>
                <option value="packaged_rtu">Packaged RTU</option>
                <option value="vrf">VRF</option>
                <option value="central_chiller">Central chiller</option>
                <option value="boiler">Boiler</option>
                <option value="furnace">Furnace</option>
                <option value="other">Other</option>
              </select>
            </label>

            {hvac.systemType.value && hvac.systemType.value !== "unknown" ? (
              <>
                <div className="flex gap-2">
                  <Field
                    label="Rated capacity"
                    hint="Optional — no sizing calculated"
                    value={capDisplay}
                    onChange={setCapDisplay}
                    inputMode="decimal"
                  />
                  <label className="mt-6 block text-[11px] text-steel">
                    Unit
                    <select
                      className="mt-2 block border border-steel/30 bg-navy px-2 py-2 text-sm text-paper"
                      value={capUnit}
                      onChange={(e) => setCapUnit(e.target.value as CapacityUnit)}
                    >
                      <option value="kW">kW</option>
                      <option value="ton">ton</option>
                      <option value="BTU/h">BTU/h</option>
                    </select>
                  </label>
                </div>
                <button
                  type="button"
                  className="text-xs text-teal"
                  onClick={() => {
                    if (!capDisplay.trim()) return;
                    try {
                      const kW = toKilowatts(Number(capDisplay), capUnit);
                      patchHvac(model, patchModel, hvac.id, {
                        ratedCapacityKW: userProvided(kW, {
                          displayUnit: capUnit,
                          originalValue: Number(capDisplay),
                        }),
                      });
                    } catch (err) {
                      setStatus(
                        err instanceof Error ? err.message : "Invalid capacity"
                      );
                    }
                  }}
                >
                  Apply capacity (normalized to kW)
                </button>
                <Field
                  label="Efficiency metric"
                  hint="e.g. SEER, COP — value optional"
                  value={hvac.efficiencyMetric.value ?? ""}
                  onChange={(v) =>
                    patchHvac(model, patchModel, hvac.id, {
                      efficiencyMetric: v ? userProvided(v) : hvac.efficiencyMetric,
                    })
                  }
                />
                <label className="block text-[11px] uppercase tracking-[0.14em] text-steel">
                  Zoning
                  <select
                    className="mt-2 w-full border border-steel/30 bg-navy px-3 py-2 text-sm text-paper"
                    value={(hvac.zoning.value as string) ?? ""}
                    onChange={(e) => {
                      const v = e.target.value as "single" | "multi" | "";
                      patchHvac(model, patchModel, hvac.id, {
                        zoning: v ? userProvided(v) : hvac.zoning,
                      });
                    }}
                  >
                    <option value="">Unknown</option>
                    <option value="single">Single</option>
                    <option value="multi">Multi</option>
                  </select>
                </label>
                {hvac.zoning.value === "multi" ? (
                  <Field
                    label="Zone notes"
                    hint="Multi-zone selected — describe zones (optional)"
                    value={hvac.operatingScheduleNotes.value ?? ""}
                    onChange={(v) =>
                      patchHvac(model, patchModel, hvac.id, {
                        operatingScheduleNotes: v
                          ? userProvided(v)
                          : hvac.operatingScheduleNotes,
                      })
                    }
                  />
                ) : null}
                <label className="block text-[11px] uppercase tracking-[0.14em] text-steel">
                  Ventilation
                  <select
                    className="mt-2 w-full border border-steel/30 bg-navy px-3 py-2 text-sm text-paper"
                    value={(hvac.ventilation.value as string) ?? ""}
                    onChange={(e) => {
                      const v = e.target.value as
                        | "natural"
                        | "mechanical"
                        | "mixed"
                        | "";
                      patchHvac(model, patchModel, hvac.id, {
                        ventilation: v ? userProvided(v) : hvac.ventilation,
                      });
                    }}
                  >
                    <option value="">Unknown</option>
                    <option value="natural">Natural</option>
                    <option value="mechanical">Mechanical</option>
                    <option value="mixed">Mixed</option>
                  </select>
                </label>
                <Field
                  label="Comfort / inefficiency notes"
                  value={hvac.comfortProblems.value ?? ""}
                  onChange={(v) =>
                    patchHvac(model, patchModel, hvac.id, {
                      comfortProblems: v ? userProvided(v) : hvac.comfortProblems,
                    })
                  }
                />
              </>
            ) : (
              <p className="text-xs text-steel">
                Select a system type to reveal relevant fields — or leave unknown.
              </p>
            )}

            {state.evidence.length > 0 ? (
              <label className="block text-[11px] text-steel">
                Link evidence to this HVAC unit (manual — not CV)
                <select
                  className="mt-1 w-full border border-steel/30 bg-navy px-2 py-1.5 text-xs text-paper"
                  defaultValue=""
                  onChange={(e) => {
                    const evidenceId = e.target.value;
                    if (!evidenceId) return;
                    const refs = model.evidenceReferences.filter(
                      (r) =>
                        !(
                          r.evidenceId === evidenceId &&
                          r.supportsProperty === `hvac.${hvac.id}.systemType`
                        )
                    );
                    patchModel({
                      ...model,
                      evidenceReferences: [
                        ...refs,
                        {
                          evidenceId,
                          supportsProperty: `hvac.${hvac.id}.systemType`,
                          targetId: hvac.id,
                          verificationState: "needs_review",
                          note: "Manual link — not auto-detected",
                        },
                      ],
                      hvac: {
                        systems: model.hvac.systems.map((s) =>
                          s.id === hvac.id
                            ? {
                                ...s,
                                evidenceIds: s.evidenceIds.includes(evidenceId)
                                  ? s.evidenceIds
                                  : [...s.evidenceIds, evidenceId],
                              }
                            : s
                        ),
                      },
                    });
                    e.target.value = "";
                  }}
                >
                  <option value="" disabled>
                    Select evidence…
                  </option>
                  {state.evidence.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.category} · {ev.file.originalFilename}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </>
        )}

        {step === "operations" && (
          <>
            <Field
              label="Occupancy profile"
              hint="e.g. office weekday — not a load multiplier"
              value={model.operating.occupancyProfile.value ?? ""}
              onChange={(v) =>
                patchModel({
                  ...model,
                  operating: {
                    ...model.operating,
                    occupancyProfile: v
                      ? userProvided(v)
                      : model.operating.occupancyProfile,
                  },
                })
              }
            />
            <Field
              label="Operating hours notes"
              value={model.operating.operatingHoursNotes.value ?? ""}
              onChange={(v) =>
                patchModel({
                  ...model,
                  operating: {
                    ...model.operating,
                    operatingHoursNotes: v
                      ? userProvided(v)
                      : model.operating.operatingHoursNotes,
                  },
                })
              }
            />
            <Field
              label="Comfort setpoint (°C)"
              hint="Optional"
              value={model.operating.comfortTempC.value?.toString() ?? ""}
              onChange={(v) =>
                patchModel({
                  ...model,
                  operating: {
                    ...model.operating,
                    comfortTempC: v
                      ? userProvided(Number(v))
                      : createEmptyEngineeringModel().operating.comfortTempC,
                  },
                })
              }
              inputMode="decimal"
            />
            <Field
              label="Utility / tariff notes"
              hint="Currency stays separate from engineering units"
              value={model.operating.utilityTariffNotes.value ?? ""}
              onChange={(v) =>
                patchModel({
                  ...model,
                  operating: {
                    ...model.operating,
                    utilityTariffNotes: v
                      ? userProvided(v)
                      : model.operating.utilityTariffNotes,
                  },
                })
              }
            />
          </>
        )}

        {step === "review" && (
          <div className="space-y-4 text-sm">
            <p className="text-steel">
              Review unknowns and validation. No calculations run in Phase 3.
            </p>
            <div>
              <h3 className="text-[11px] uppercase tracking-[0.14em] text-steel">
                Unknowns
              </h3>
              <ul className="mt-2 space-y-1 text-xs text-paper">
                {collectUnknowns(model).map((u) => (
                  <li key={u.path}>
                    {u.label}{" "}
                    <span className="font-mono-num text-steel">({u.path})</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-[11px] uppercase tracking-[0.14em] text-steel">
                Validation
              </h3>
              {issues.length === 0 ? (
                <p className="mt-2 text-xs text-teal">No blocking issues</p>
              ) : (
                <ul className="mt-2 space-y-1 text-xs">
                  {issues.map((i) => (
                    <li
                      key={i.path + i.message}
                      className={
                        i.severity === "error" ? "text-clay" : "text-steel"
                      }
                    >
                      {i.severity}: {i.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="font-mono-num text-[10px] text-steel">
              model {model.id} · {model.version} · {model.updatedAt}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-steel/20 px-4 py-3">
        <button
          type="button"
          disabled={idx === 0}
          onClick={() => setStep(STEPS[idx - 1])}
          className="text-sm text-steel disabled:opacity-30"
        >
          Back
        </button>
        {idx < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={() => setStep(STEPS[idx + 1])}
            className="border border-teal px-4 py-2 text-sm text-teal"
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              const ready = {
                ...model,
                unknowns: collectUnknowns(model),
                updatedAt: new Date().toISOString(),
              };
              setEngineering(ready);
              setStatus("EngineeringReadyModel saved — Phase 4 intake ready");
              setCenterMode("building");
              onDone?.();
            }}
            className="border border-gold px-4 py-2 text-sm text-gold"
          >
            Save model
          </button>
        )}
      </div>
    </motion.div>
  );
}

function patchSurface(
  model: EngineeringReadyModel,
  patchModel: (m: EngineeringReadyModel) => void,
  id: string,
  partial: Partial<EngineeringReadyModel["envelope"]["surfaces"][0]>
) {
  patchModel({
    ...model,
    envelope: {
      surfaces: model.envelope.surfaces.map((s) =>
        s.id === id ? { ...s, ...partial } : s
      ),
    },
  });
}

function patchHvac(
  model: EngineeringReadyModel,
  patchModel: (m: EngineeringReadyModel) => void,
  id: string,
  partial: Partial<EngineeringReadyModel["hvac"]["systems"][0]>
) {
  patchModel({
    ...model,
    hvac: {
      systems: model.hvac.systems.map((s) =>
        s.id === id ? { ...s, ...partial } : s
      ),
    },
  });
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
      {hint ? (
        <span className="mt-0.5 block text-[11px] text-steel/70">{hint}</span>
      ) : null}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        className="mt-2 w-full border border-steel/30 bg-transparent px-3 py-2 text-sm text-paper outline-none focus:border-teal"
      />
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-steel">{label}</dt>
      <dd className="text-right text-paper">{value}</dd>
    </div>
  );
}
