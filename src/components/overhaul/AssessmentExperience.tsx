"use client";

import UniversalDecisionWorkspaceV2 from "./UniversalDecisionWorkspaceV2";
import AssetTwinViewport from "./AssetTwinViewport";
import LiveTwinStudio from "./LiveTwinStudio";
import RetrofitPathfinder from "./RetrofitPathfinder";
import RetrofitStressLab from "./RetrofitStressLab";
import DigitalTwinConsole from "./DigitalTwinConsole";
import DecisionProvenancePanel from "./DecisionProvenancePanel";
import { useEffect, useMemo, useState } from "react";

type Scope = "building" | "facility" | "equipment";
type Assessment = {
  assessmentSubject?: Scope;
  siteName?: string | null;
  assetClass?: string | null;
  industry?: string;
  assessmentGoal?: string;
  evidence?: Array<{ id: string; kind: string; name: string; type: string; size: number }>;
};
type Extraction = {
  evidenceId?: string;
  observations?: Array<{ field: string; numericValue: number | null; value: string; unit: string | null; confidence: number; sourceText?: string }>;
  model?: string;
  sourceKind?: string;
  sourceName?: string;
  evidenceType?: string;
};
type Values = Record<string, number | string | null>;
type RoomScan = { scope?: Scope; coveragePercent?: number; completed?: boolean; sectors?: Array<{ id: string; sector: number; result?: unknown }> };

function readJson<T>(key: string, fallback: T): T {
  try { return JSON.parse(sessionStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; }
}

function canonical(field: string) {
  return field.toLowerCase().trim().replace(/[()\-\/]+/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_");
}

export default function AssessmentExperience() {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [extracts, setExtracts] = useState<Extraction[]>([]);
  const [supplemental, setSupplemental] = useState<Values>({});
  const [roomScan, setRoomScan] = useState<RoomScan | null>(null);

  useEffect(() => {
    const sync = () => {
      setAssessment(readJson<Assessment | null>("overhaul:assessment", null));
      setExtracts(readJson<Extraction[]>("overhaul:evidence-extractions", []));
      setSupplemental(readJson<Values>("overhaul:supplemental-values", {}));
      setRoomScan(readJson<RoomScan | null>("overhaul:room-scan", null));
    };
    sync();
    window.addEventListener("overhaul:supplemental-change", sync);
    window.addEventListener("overhaul:evidence-change", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("overhaul:supplemental-change", sync);
      window.removeEventListener("overhaul:evidence-change", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const values = useMemo<Values>(() => {
    const next: Values = {};
    for (const extraction of extracts) {
      for (const observation of extraction.observations || []) {
        if (observation.numericValue != null && Number.isFinite(observation.numericValue)) {
          next[canonical(observation.field)] = observation.numericValue;
        }
      }
    }
    for (const [key, value] of Object.entries(supplemental)) {
      if (next[key] == null && typeof value === "number" && Number.isFinite(value)) next[key] = value;
    }
    return next;
  }, [extracts, supplemental]);

  useEffect(() => {
    if (!assessment || !extracts.length || sessionStorage.getItem("overhaul:supabase-project-id")) return;
    let cancelled = false;
    const persist = async () => {
      try {
        const response = await fetch("/api/persistence/snapshot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assessment, extractions: extracts, supplemental, roomScan }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Persistence failed");
        if (!cancelled && payload.projectId) {
          sessionStorage.setItem("overhaul:supabase-project-id", payload.projectId);
          sessionStorage.setItem("overhaul:supabase-asset-id", payload.assetId || "");
        }
      } catch (error) {
        console.warn("Supabase persistence unavailable; continuing with local assessment state.", error);
      }
    };
    void persist();
    return () => { cancelled = true; };
  }, [assessment, extracts, supplemental, roomScan]);

  const scope = assessment?.assessmentSubject || "building";
  const title = assessment?.siteName || assessment?.assetClass || (scope === "equipment" ? "Asset model" : "Site model");
  const assetClass = assessment?.assetClass || (scope === "equipment" ? "Equipment" : scope === "facility" ? "Facility" : "Building");
  const evidenceIds = (assessment?.evidence || []).map((e) => e.id);

  return <>
    <div className="mx-auto max-w-[1600px] px-4 pt-4 sm:px-7 lg:px-10">
      <section className="relative overflow-hidden border border-gold/25 bg-[#080a09] shadow-[0_26px_110px_rgba(0,0,0,.28)]">
        <div className="absolute inset-y-0 right-0 w-[42%] bg-[radial-gradient(circle_at_center,rgba(228,184,96,.10),transparent_64%)]" />
        <div className="relative grid gap-5 p-5 sm:p-7 lg:grid-cols-[1.15fr_.85fr] lg:p-9">
          <div>
            <p className="font-mono text-[8px] uppercase tracking-[0.22em] text-gold">Retrofit command center</p>
            <h1 className="mt-2 max-w-3xl font-display text-4xl leading-[0.95] sm:text-5xl">Find the retrofit.<br/>Know the consequence.</h1>
            <p className="mt-4 max-w-2xl text-[10px] leading-5 text-steel">OVERHAUL uses the evidence you provide to establish a defensible baseline, expose retrofit pathways, and calculate the consequences of an intervention before you commit money, downtime, or equipment changes.</p>
            <div className="mt-5 flex flex-wrap gap-2 font-mono text-[7px] uppercase tracking-[0.12em]">
              <span className="border border-teal/25 bg-teal/[0.04] px-3 py-2 text-teal">Evidence-bound</span>
              <span className="border border-steel/15 px-3 py-2 text-steel">Physics-backed</span>
              <span className="border border-steel/15 px-3 py-2 text-steel">Counterfactual</span>
              <span className="border border-steel/15 px-3 py-2 text-steel">Verify after implementation</span>
            </div>
          </div>
          <div className="grid content-end gap-2 sm:grid-cols-3 lg:grid-cols-1">
            <Signal label="Scope" value={assetClass} />
            <Signal label="Evidence" value={extracts.length ? `${extracts.length} source${extracts.length === 1 ? "" : "s"} analyzed` : "Awaiting evidence"} />
            <Signal label="Engineering state" value={Object.keys(values).length ? `${Object.keys(values).length} values established` : "Not established"} />
          </div>
        </div>
      </section>
      <p className="px-1 py-3 font-mono text-[7px] uppercase tracking-[0.16em] text-steel">Decision order · retrofit first · engineering workspace retained below for diagnosis, simulation, provenance and verification</p>
    </div>

    <div className="mx-auto max-w-[1600px] space-y-5 px-4 pb-12 sm:px-7 lg:px-10">
      <RetrofitPathfinder scope={scope} values={values} />
      <RetrofitStressLab scope={scope} values={values} />
      <LiveTwinStudio scope={scope} title={title} values={values} />
      <UniversalDecisionWorkspaceV2 />
      <AssetTwinViewport scope={scope} title={title} assetClass={assetClass} evidenceIds={evidenceIds} values={values} />
      <DigitalTwinConsole scope={scope} values={values} />
      <DecisionProvenancePanel scope={scope} label={title} extracts={extracts} />
    </div>
  </>;
}

function Signal({ label, value }: { label: string; value: string }) {
  return <div className="border border-steel/15 bg-black/20 p-4 backdrop-blur"><p className="font-mono text-[7px] uppercase tracking-[0.12em] text-steel">{label}</p><p className="mt-2 text-sm text-paper">{value}</p></div>;
}
