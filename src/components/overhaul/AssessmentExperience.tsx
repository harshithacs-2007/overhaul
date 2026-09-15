"use client";

import UniversalDecisionWorkspaceV2 from "./UniversalDecisionWorkspaceV2";
import AssetTwinViewport from "./AssetTwinViewport";
import LiveTwinStudio from "./LiveTwinStudio";
import RetrofitPathfinder from "./RetrofitPathfinder";
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
    <UniversalDecisionWorkspaceV2 />
    <div className="mx-auto max-w-[1600px] space-y-5 px-4 pb-12 sm:px-7 lg:px-10">
      <RetrofitPathfinder scope={scope} values={values} />
      <LiveTwinStudio scope={scope} title={title} values={values} />
      <AssetTwinViewport scope={scope} title={title} assetClass={assetClass} evidenceIds={evidenceIds} values={values} />
      <DigitalTwinConsole scope={scope} values={values} />
      <DecisionProvenancePanel scope={scope} label={title} extracts={extracts} />
    </div>
  </>;
}
