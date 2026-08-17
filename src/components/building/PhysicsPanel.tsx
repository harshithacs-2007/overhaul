"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import { userProvided, unknownValue } from "@/lib/engineering/provenance";
import { engineeringModelToPhysicsInput } from "@/lib/physics/fromModel";
import type { PhysicsRunResult, TraceRecord } from "@/lib/physics/types";

/**
 * Phase 4: feed structured engineering model → physics API → inspectable results.
 */
export function PhysicsPanel() {
  const { state, setEngineering, setStatus, setCenterMode } = useWorkspace();
  const reduce = useReducedMotion();
  const model = state.engineering;
  const [mode, setMode] = useState<"cooling" | "heating">("cooling");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PhysicsRunResult | null>(null);
  const [inspectId, setInspectId] = useState<string | null>(null);

  const mapped = useMemo(
    () => engineeringModelToPhysicsInput(model, mode),
    [model, mode]
  );

  const patchSurface = (
    id: string,
    field: "areaM2" | "uValueWm2K",
    raw: string
  ) => {
    const surfaces = model.envelope.surfaces.map((s) => {
      if (s.id !== id) return s;
      if (!raw.trim()) {
        return { ...s, [field]: unknownValue<number>() };
      }
      const n = Number(raw);
      if (!Number.isFinite(n)) return s;
      return { ...s, [field]: userProvided(n) };
    });
    setEngineering({
      ...model,
      envelope: { surfaces },
      updatedAt: new Date().toISOString(),
    });
  };

  const patchOperating = (
    field: "comfortTempC" | "ach" | "shgc",
    raw: string
  ) => {
    const operating = {
      ...model.operating,
      ach: model.operating.ach ?? unknownValue<number>(),
      shgc: model.operating.shgc ?? unknownValue<number>(),
    };
    if (!raw.trim()) {
      setEngineering({
        ...model,
        operating: { ...operating, [field]: unknownValue<number>() },
        updatedAt: new Date().toISOString(),
      });
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    setEngineering({
      ...model,
      operating: { ...operating, [field]: userProvided(n) },
      updatedAt: new Date().toISOString(),
    });
  };

  const patchHeight = (raw: string) => {
    if (!raw.trim()) {
      setEngineering({
        ...model,
        geometry: { ...model.geometry, heightM: unknownValue() },
        updatedAt: new Date().toISOString(),
      });
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return;
    setEngineering({
      ...model,
      geometry: { ...model.geometry, heightM: userProvided(n) },
      updatedAt: new Date().toISOString(),
    });
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const prep = engineeringModelToPhysicsInput(model, mode);
      if (!prep.ok || !prep.input) {
        setError(
          `Cannot run: missing ${prep.blockingMissing.join(", ") || "inputs"}`
        );
        setStatus("Physics blocked — missing required inputs");
        return;
      }
      const res = await fetch("/api/physics/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prep.input),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || json.error || "Calculation failed");
      }
      const r = json.result as PhysicsRunResult;
      setResult(r);
      setStatus(`Physics ${r.load.status} · ${r.mode}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const inspectTrace: TraceRecord | null =
    result?.load.traces.find((t) => t.id === inspectId) ??
    (result?.hvac.trace.id === inspectId ? result.hvac.trace : null) ??
    null;

  return (
    <motion.div
      className="flex h-full flex-col"
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="border-b border-steel/20 px-4 py-3">
        <h2 className="font-display text-xl text-paper">Physics engine</h2>
        <p className="text-xs text-steel">
          Structured model → climate → SI calculations · early-stage estimate
        </p>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode("cooling")}
            className={`border px-3 py-1.5 text-xs ${mode === "cooling" ? "border-teal text-teal" : "border-steel/30 text-steel"}`}
          >
            Cooling design
          </button>
          <button
            type="button"
            onClick={() => setMode("heating")}
            className={`border px-3 py-1.5 text-xs ${mode === "heating" ? "border-teal text-teal" : "border-steel/30 text-steel"}`}
          >
            Heating design
          </button>
          <button
            type="button"
            onClick={() => setCenterMode("manual")}
            className="border border-steel/30 px-3 py-1.5 text-xs text-steel"
          >
            Edit building model
          </button>
        </div>

        {!model.location || !model.climate ? (
          <p className="border border-clay/40 px-3 py-2 text-xs text-clay">
            Resolve location + climate in Build manually first. Climate data is
            never invented.
          </p>
        ) : (
          <dl className="grid gap-2 border border-steel/20 p-3 text-xs sm:grid-cols-2">
            <Row label="Location" value={model.location.displayName} />
            <Row
              label="Climate usable"
              value={model.climate.completeness.engineeringUsable ? "yes" : "partial/no"}
            />
          </dl>
        )}

        <section className="space-y-3">
          <h3 className="text-[11px] uppercase tracking-[0.14em] text-steel">
            Required numeric inputs (feed the engine)
          </h3>
          <Num
            label="Indoor setpoint (°C)"
            value={model.operating.comfortTempC.value}
            onChange={(v) => patchOperating("comfortTempC", v)}
          />
          <Num
            label="Ceiling height (m)"
            value={model.geometry.heightM.value}
            onChange={patchHeight}
            hint="Needed for ACH volume"
          />
          {model.envelope.surfaces
            .filter((s) => s.kind !== "floor")
            .map((s) => (
              <div key={s.id} className="border border-steel/15 p-2">
                <p className="text-[10px] uppercase tracking-wide text-steel">
                  {s.kind} · {s.id}
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Num
                    label="Area (m²)"
                    value={s.areaM2.value}
                    onChange={(v) => patchSurface(s.id, "areaM2", v)}
                  />
                  <Num
                    label="U (W/m²K)"
                    value={s.uValueWm2K.value}
                    onChange={(v) => patchSurface(s.id, "uValueWm2K", v)}
                  />
                </div>
              </div>
            ))}
          <Num
            label="ACH (optional)"
            value={model.operating.ach?.value}
            onChange={(v) => patchOperating("ach", v)}
            hint="Leave blank → ventilation marked incomplete"
          />
          <Num
            label="Window SHGC 0–1 (optional)"
            value={model.operating.shgc?.value}
            onChange={(v) => patchOperating("shgc", v)}
            hint="Leave blank → solar gain incomplete"
          />
        </section>

        {mapped.blockingMissing.length > 0 ? (
          <ul className="text-xs text-clay">
            {mapped.blockingMissing.map((m) => (
              <li key={m}>○ Missing: {m}</li>
            ))}
          </ul>
        ) : null}

        <button
          type="button"
          disabled={busy}
          onClick={() => void run()}
          className="border border-gold bg-gold/10 px-4 py-2.5 text-sm text-gold disabled:opacity-40"
        >
          {busy ? "Calculating…" : "Run physics estimate"}
        </button>
        {error ? <p className="text-xs text-clay">{error}</p> : null}

        {result ? (
          <section className="space-y-3 border border-steel/20 p-3">
            <h3 className="font-display text-lg text-paper">
              {result.load.label}
            </h3>
            <p className="font-mono-num text-xs text-steel">
              status {result.load.status} · outdoor {result.outdoorTempC.toFixed(1)}°C (
              {result.outdoorTempSource.slice(0, 80)})
            </p>
            <ul className="space-y-1 text-sm">
              <Check ok={result.load.conductionW != null} label="Conduction" value={fmtW(result.load.conductionW)} />
              <Check ok={result.load.solarW != null} label="Solar" value={fmtW(result.load.solarW)} />
              <Check ok={result.load.ventilationW != null} label="Ventilation" value={fmtW(result.load.ventilationW)} />
            </ul>
            <p className="text-sm text-paper">
              Aggregate:{" "}
              <span className="font-mono-num">
                {result.load.totalKW != null
                  ? `${result.load.totalKW.toFixed(3)} kW`
                  : "—"}
              </span>
            </p>
            {result.load.missingInputs.length > 0 ? (
              <div className="text-xs text-steel">
                Incomplete:{" "}
                {result.load.missingInputs.slice(0, 6).join("; ")}
              </div>
            ) : null}

            <div className="border-t border-steel/15 pt-3">
              <h4 className="text-[11px] uppercase tracking-[0.14em] text-steel">
                HVAC capacity check
              </h4>
              <p className="mt-1 text-sm text-paper">
                {result.hvac.state.replaceAll("_", " ")} · margin{" "}
                <span className="font-mono-num">
                  {result.hvac.marginKW != null
                    ? `${result.hvac.marginKW.toFixed(2)} kW`
                    : "—"}
                </span>
              </p>
              <p className="mt-1 text-[11px] text-steel">{result.hvac.ageNote}</p>
              <button
                type="button"
                className="mt-2 text-xs text-teal"
                onClick={() => setInspectId(result.hvac.trace.id)}
              >
                Inspect HVAC calculation
              </button>
            </div>

            <div>
              <h4 className="text-[11px] uppercase tracking-[0.14em] text-steel">
                Inspect calculation
              </h4>
              <div className="mt-2 flex flex-wrap gap-2">
                {result.load.traces.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setInspectId(t.id)}
                    className={`border px-2 py-1 text-[10px] ${
                      inspectId === t.id
                        ? "border-teal text-teal"
                        : "border-steel/30 text-steel"
                    }`}
                  >
                    {t.title}
                  </button>
                ))}
              </div>
            </div>

            {inspectTrace ? (
              <article className="border border-teal/40 bg-teal/5 p-3 text-xs">
                <h5 className="font-display text-base text-paper">
                  {inspectTrace.title}
                </h5>
                <p className="mt-2 font-mono-num text-steel">
                  {inspectTrace.formula}
                </p>
                <dl className="mt-3 space-y-1">
                  {Object.entries(inspectTrace.inputs).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-2">
                      <dt className="text-steel">{k}</dt>
                      <dd className="font-mono-num text-paper">
                        {v == null ? "—" : String(v)}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-paper">
                  Result:{" "}
                  <span className="font-mono-num">
                    {inspectTrace.result == null
                      ? "unavailable"
                      : `${inspectTrace.result.toFixed(3)} ${inspectTrace.resultUnit}`}
                  </span>{" "}
                  · {inspectTrace.status}
                </p>
                {inspectTrace.missingInputs.length > 0 ? (
                  <p className="mt-2 text-clay">
                    Missing: {inspectTrace.missingInputs.join(", ")}
                  </p>
                ) : null}
                {inspectTrace.assumptions.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-steel">
                    {inspectTrace.assumptions.map((a) => (
                      <li key={a}>• {a}</li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ) : null}
          </section>
        ) : null}
      </div>
    </motion.div>
  );
}

function fmtW(w: number | null): string {
  if (w == null) return "incomplete";
  return `${(w / 1000).toFixed(3)} kW`;
}

function Check({
  ok,
  label,
  value,
}: {
  ok: boolean;
  label: string;
  value: string;
}) {
  return (
    <li className="flex justify-between gap-3 text-xs">
      <span className={ok ? "text-teal" : "text-steel"}>
        {ok ? "✓" : "○"} {label}
      </span>
      <span className="font-mono-num text-paper">{value}</span>
    </li>
  );
}

function Num({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: number | null | undefined;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <label className="block text-[11px] text-steel">
      {label}
      {hint ? <span className="block text-[10px] text-steel/70">{hint}</span> : null}
      <input
        className="mt-1 w-full border border-steel/30 bg-transparent px-2 py-1.5 font-mono-num text-sm text-paper"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        placeholder="unknown"
      />
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-steel">{label}</dt>
      <dd className="text-right text-paper">{value}</dd>
    </div>
  );
}
