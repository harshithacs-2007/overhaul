"use client";

import UniversalDecisionWorkspaceV2 from "./UniversalDecisionWorkspaceV2";
import AssetTwinViewport from "./AssetTwinViewport";
import { useEffect, useState } from "react";

type Scope = "building" | "facility" | "equipment";
type Assessment = { assessmentSubject?: Scope; siteName?: string | null; assetClass?: string | null; evidence?: Array<{ id: string; kind: string; name: string; type: string; size: number }> };
type Extraction = { evidenceId?: string; observations?: Array<{ field: string; numericValue: number | null; value: string; unit: string | null; confidence: number }> };

export default function AssessmentExperience() {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [extracts, setExtracts] = useState<Extraction[]>([]);
  useEffect(() => {
    try {
      setAssessment(JSON.parse(sessionStorage.getItem("overhaul:assessment") || "null"));
      setExtracts(JSON.parse(sessionStorage.getItem("overhaul:evidence-extractions") || "[]"));
    } catch { setAssessment(null); setExtracts([]); }
  }, []);

  const observations = extracts.flatMap((x) => (x.observations || []).map((o) => ({ key: o.field.toLowerCase().trim().replace(/[()\-\/]+/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_"), value: o.numericValue ?? o.value }))); 
  const values: Record<string, number | string | null> = {};
  for (const item of observations) if (typeof item.value === "number" && Number.isFinite(item.value)) values[item.key] = item.value;
  const supplemental = (() => { try { return JSON.parse(sessionStorage.getItem("overhaul:supplemental-values") || "{}"); } catch { return {}; } })();
  for (const [key, value] of Object.entries(supplemental)) if (values[key] == null && typeof value === "number" && Number.isFinite(value)) values[key] = value;

  const scope = assessment?.assessmentSubject || "building";
  const title = assessment?.siteName || assessment?.assetClass || (scope === "equipment" ? "Asset model" : "Site model");
  const assetClass = assessment?.assetClass || (scope === "equipment" ? "Equipment" : scope === "facility" ? "Facility" : "Building");
  const evidenceIds = (assessment?.evidence || []).map((e) => e.id);

  return <>
    <UniversalDecisionWorkspaceV2 />
    <div className="mx-auto max-w-[1600px] px-4 pb-10 sm:px-7 lg:px-10">
      <AssetTwinViewport scope={scope} title={title} assetClass={assetClass} evidenceIds={evidenceIds} values={values} />
    </div>
  </>;
}
