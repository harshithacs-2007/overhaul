"use client";

import UniversalDecisionWorkspaceV2 from "./UniversalDecisionWorkspaceV2";
import AssetTwinViewport from "./AssetTwinViewport";
import LiveTwinStudio from "./LiveTwinStudio";
import TwinObjectInspector from "./TwinObjectInspector";
import TwinBuildSequence from "./TwinBuildSequence";
import RetrofitPathfinder from "./RetrofitPathfinder";
import RetrofitStressLab from "./RetrofitStressLab";
import DatasetIntelligencePanel from "./DatasetIntelligencePanel";
import DatasetPhysicsBridgePanel from "./DatasetPhysicsBridgePanel";
import RegionalConstraintPanel from "./RegionalConstraintPanel";
import ModelEvidencePanel from "./ModelEvidencePanel";
import DigitalTwinConsole from "./DigitalTwinConsole";
import DecisionProvenancePanel from "./DecisionProvenancePanel";
import RetrofitIntelligenceSuite from "./RetrofitIntelligenceSuite";
import MachineRetrofitMatrix from "./MachineRetrofitMatrix";
import { useEffect, useMemo, useState } from "react";

type Scope = "building" | "facility" | "equipment";
type Assessment = { assessmentSubject?: Scope; siteName?: string | null; assetClass?: string | null; industry?: string; assessmentGoal?: string; status?: string; evidence?: Array<{ id: string; kind: string; name: string; type: string; size: number }> };
type Extraction = { evidenceId?: string; observations?: Array<{ field: string; numericValue: number | null; value: string; unit: string | null; confidence: number; sourceText: string }>; warnings?: string[]; model?: string; sourceKind?: string; sourceName?: string; evidenceType?: string };
type Values = Record<string, number | string | null>;
type RoomScan = { scope?: Scope; coveragePercent?: number; completed?: boolean; sectors?: Array<{ id: string; sector: number; result?: { detections?: Array<{ label: string; confidence: number; condition?: string; evidence?: string }> } }> } | null;
type ClimateContext = { location?: string; temperature?: number; humidity?: number; min?: number; max?: number; rain?: number; source?: string; fetchedAt?: string } | null;

function readJson<T>(key: string, fallback: T): T { try { return JSON.parse(sessionStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; } }
function canonical(field: string) { return field.toLowerCase().trim().replace(/[()\-\/]+/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_"); }

export default function AssessmentExperience() {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [extracts, setExtracts] = useState<Extraction[]>([]);
  const [supplemental, setSupplemental] = useState<Values>({});
  const [roomScan, setRoomScan] = useState<RoomScan>(null);
  const [climate, setClimate] = useState<ClimateContext>(null);

  useEffect(() => {
    const sync = () => {
      setAssessment(readJson<Assessment | null>("overhaul:assessment", null));
      setExtracts(readJson<Extraction[]>("overhaul:evidence-extractions", []));
      setSupplemental(readJson<Values>("overhaul:supplemental-values", {}));
      setRoomScan(readJson<RoomScan>("overhaul:room-scan", null));
      setClimate(readJson<ClimateContext>("overhaul:climate-context", null));
    };
    sync();
    window.addEventListener("overhaul:supplemental-change", sync);
    window.addEventListener("overhaul:evidence-change", sync);
    window.addEventListener("overhaul:climate-change", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("overhaul:supplemental-change", sync);
      window.removeEventListener("overhaul:evidence-change", sync);
      window.removeEventListener("overhaul:climate-change", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const values = useMemo<Values>(() => {
    const next: Values = {};
    for (const extraction of extracts) for (const observation of extraction.observations || []) if (observation.numericValue != null && Number.isFinite(observation.numericValue)) next[canonical(observation.field)] = observation.numericValue;
    for (const [key, value] of Object.entries(supplemental)) if (next[key] == null && typeof value === "number" && Number.isFinite(value)) next[canonical(key)] = value;
    return next;
  }, [extracts, supplemental]);

  useEffect(() => {
    if (!assessment || (!extracts.length && !roomScan)) return;
    let cancelled = false;
    const persist = async () => {
      try {
        const projectId = sessionStorage.getItem("overhaul:supabase-project-id") || undefined;
        const assetId = sessionStorage.getItem("overhaul:supabase-asset-id") || undefined;
        const response = await fetch("/api/persistence/snapshot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, assetId, assessment, extractions: extracts, supplemental, roomScan, climate }) });
        const payload = await response.json() as { projectId?: string; assetId?: string; error?: string };
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
  }, [assessment, extracts, supplemental, roomScan, climate]);

  const scope = assessment?.assessmentSubject || "building";
  const title = assessment?.siteName || assessment?.assetClass || (scope === "equipment" ? "Asset model" : "Site model");
  const assetClass = assessment?.assetClass || (scope === "equipment" ? "Equipment" : scope === "facility" ? "Facility" : "Building");
  const evidenceIds = (assessment?.evidence || []).map((e) => e.id);
  const modelReady = assessment?.status === "model-ready";
  const confidence = useMemo(() => {
    const list = extracts.flatMap((item) => item.observations || []).map((item) => item.confidence).filter((item) => Number.isFinite(item));
    return list.length ? Math.round((list.reduce((sum, item) => sum + item, 0) / list.length) * 100) : roomScan?.completed ? 72 : 0;
  }, [extracts, roomScan]);

  return <>
    <div className="mx-auto max-w-[1600px] px-4 pt-4 sm:px-7 lg:px-10">
      <section className="relative overflow-hidden border border-gold/25 bg-[#080a09] shadow-[0_26px_110px_rgba(0,0,0,.28)]">
        <div className="absolute inset-y-0 right-0 w-[42%] bg-[radial-gradient(circle_at_center,rgba(228,184,96,.10),transparent_64%)]" />
        <div className="relative grid gap-5 p-5 sm:p-7 lg:grid-cols-[1.15fr_.85fr] lg:p-9"><div><p className="font-mono text-[8px] uppercase tracking-[0.22em] text-gold">Retrofit command center</p><h1 className="mt-2 max-w-3xl font-display text-4xl leading-[0.95] sm:text-5xl">Understand it.<br/>Model it.<br/><span className="text-teal">Then change it.</span></h1><p className="mt-4 max-w-2xl text-[10px] leading-5 text-steel">The twin is not the finish line. OVERHAUL first establishes what the asset is and how it currently behaves, then creates a reference state, tests retrofit interventions, and carries the consequences into the final decision.</p></div><div className="grid content-end gap-2 sm:grid-cols-3 lg:grid-cols-1"><Signal label="Asset" value={assetClass}/><Signal label="Evidence" value={`${extracts.length + (roomScan?.sectors?.length ? 1 : 0)} source set${extracts.length + (roomScan?.sectors?.length ? 1 : 0) === 1 ? "" : "s"}`}/><Signal label="Model" value={modelReady ? "Details established" : "Details required"}/></div></div>
      </section>
      <p className="px-1 py-3 font-mono text-[7px] uppercase tracking-[0.16em] text-steel">Decision order · evidence → details → twin → expected vs observed → retrofit what-if → decide → verify</p>
    </div>

    <div className="mx-auto max-w-[1600px] space-y-5 px-4 pb-12 sm:px-7 lg:px-10">
      {!modelReady ? <section className="border border-amber-200/25 bg-amber-200/[0.025] p-6"><p className="font-mono text-[8px] uppercase tracking-[0.16em] text-amber-200">Twin locked</p><h2 className="mt-2 font-display text-3xl">Finish asset details before the model is created.</h2><p className="mt-2 max-w-3xl text-[10px] leading-5 text-steel">The assessment can hold evidence first, but the CAD / digital twin is intentionally gated. Once the physical and operating details are submitted, the same evidence set becomes the basis for the 3D scene and the expected-vs-observed comparison.</p></section> : null}
      {modelReady ? <TwinBuildSequence scope={scope} evidenceCount={extracts.length + (roomScan?.sectors?.length ? 1 : 0)} signalCount={Object.keys(values).length} confidence={confidence} /> : null}
      {modelReady ? <LiveTwinStudio scope={scope} title={title} values={values} /> : null}
      {modelReady ? <DigitalTwinConsole scope={scope} values={values} /> : null}
      <DatasetIntelligencePanel extracts={extracts}/>
      <DatasetPhysicsBridgePanel extracts={extracts} values={values}/>
      <RegionalConstraintPanel climate={climate} values={values}/>
      <ModelEvidencePanel />
      {modelReady ? <TwinObjectInspector scan={roomScan} values={values}/> : null}
      <RetrofitPathfinder scope={scope} values={values}/>
      {scope === "equipment" ? <MachineRetrofitMatrix assetClass={assessment?.assetClass} values={values}/> : null}
      <RetrofitStressLab scope={scope} values={values} climate={climate}/>
      <RetrofitIntelligenceSuite scope={scope} values={values} extracts={extracts} climate={climate}/>
      <UniversalDecisionWorkspaceV2 />
      {modelReady ? <AssetTwinViewport scope={scope} title={title} assetClass={assetClass} evidenceIds={evidenceIds} values={values}/> : null}
      <DecisionProvenancePanel scope={scope} label={title} extracts={extracts}/>
    </div>
  </>;
}

function Signal({ label, value }: { label: string; value: string }) { return <div className="border border-steel/15 bg-black/20 p-4 backdrop-blur"><p className="font-mono text-[7px] uppercase tracking-[0.12em] text-steel">{label}</p><p className="mt-2 text-sm text-paper">{value}</p></div>; }
