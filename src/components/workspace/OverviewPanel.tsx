"use client";

import { useMemo } from "react";
import { useWorkspace } from "./WorkspaceProvider";
import { collectUnknowns } from "@/lib/engineering/model";

function valueOrUnknown(value: { value?: string | number | null; provenance?: { kind: string } } | null | undefined, suffix = "") {
  if (!value || value.provenance?.kind === "UNKNOWN" || value.value == null) return "Unknown";
  return `${String(value.value)}${suffix}`;
}

export function OverviewPanel() {
  const { state, setSection, setCenterMode, setStatus } = useWorkspace();
  const model = state.engineering;
  const unknowns = useMemo(() => collectUnknowns(model), [model]);
  const hvac = model.hvac.systems[0];

  const openEvidence = () => {
    setSection("evidence");
    setStatus("Evidence workspace ready");
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-navy">
      <header className="border-b border-steel/20 px-5 py-5 lg:px-7">
        <p className="text-[10px] uppercase tracking-[0.2em] text-steel">OVERHAUL / BUILDING INTELLIGENCE</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl text-paper sm:text-4xl">Building overview</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-steel">
              One model feeds evidence, climate, HVAC, physics and retrofit decisions. Unknowns stay explicit until supported.
            </p>
          </div>
          <span className="border border-steel/25 px-3 py-1.5 font-mono-num text-[10px] uppercase tracking-wider text-steel">
            model {model.id} · v{model.version}
          </span>
        </div>
      </header>

      <div className="grid gap-px border-b border-steel/20 bg-steel/15 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Location" value={model.location?.displayName ?? "Not resolved"} detail={model.location?.precision ?? "no location"} />
        <Metric label="Floor area" value={valueOrUnknown(model.building.floorAreaM2, " m²")} detail="building identity" />
        <Metric label="HVAC capacity" value={valueOrUnknown(hvac?.ratedCapacityKW, " kW")} detail={hvac?.systemType.value ?? "type unknown"} />
        <Metric label="Evidence" value={String(state.evidence.length)} detail="uploaded / captured" />
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-[1.2fr_0.8fr] lg:p-7">
        <section className="border border-steel/20 bg-navy/60 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-steel">Pipeline</p>
              <h2 className="font-display mt-1 text-xl text-paper">Evidence → decision</h2>
            </div>
            <span className="font-mono-num text-[10px] text-steel">{unknowns.length} unknown fields</span>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {[
              ["Evidence", state.evidence.length ? "COLLECTED" : "EMPTY", "evidence"],
              ["Building model", model.location || model.geometry.floorAreaM2.value != null ? "IN PROGRESS" : "START", "building"],
              ["Climate", model.climate?.completeness.engineeringUsable ? "USABLE" : "INCOMPLETE", "climate"],
              ["HVAC", hvac?.ratedCapacityKW.value != null ? "SPECIFIED" : "INCOMPLETE", "hvac"],
              ["Physics", "READY TO RUN", "physics"],
              ["Retrofit", "WHAT-IF", "simulate"],
            ].map(([label, stateLabel, target]) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setSection(target as Parameters["target"]);
                  setStatus(`${label} workspace opened`);
                }}
                className="border border-steel/15 px-3 py-3 text-left hover:border-teal/60 hover:bg-paper/[0.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
              >
                <p className="text-[10px] uppercase tracking-wider text-steel">{label}</p>
                <p className="mt-1 text-sm text-paper">{stateLabel}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="border border-gold/25 bg-gold/[0.03] p-5">
          <p className="text-[10px] uppercase tracking-[0.18em] text-gold">Next action</p>
          <h2 className="font-display mt-1 text-2xl text-paper">
            {state.evidence.length === 0 ? "Bring in evidence" : unknowns.length ? "Resolve the highest-impact unknowns" : "Run the engineering pipeline"}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-steel">
            OVERHAUL should only promote a field to engineering calculations once its source and value are explicit.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={openEvidence} className="border border-teal/70 bg-teal/10 px-4 py-2 text-sm text-teal">
              Open evidence
            </button>
            <button type="button" onClick={() => setCenterMode("manual")} className="border border-steel/35 px-4 py-2 text-sm text-paper">
              Edit model
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

type Parameters = { target: "evidence" | "building" | "climate" | "hvac" | "physics" | "simulate" };

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="bg-navy p-4">
      <p className="text-[10px] uppercase tracking-wider text-steel">{label}</p>
      <p className="mt-2 truncate text-sm text-paper">{value}</p>
      <p className="mt-1 truncate font-mono-num text-[10px] text-steel/80">{detail}</p>
    </div>
  );
}
