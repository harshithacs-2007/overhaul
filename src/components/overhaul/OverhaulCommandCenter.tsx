"use client";

import { useEffect, useState } from "react";
import RetrofitCommandCenter from "./RetrofitCommandCenter";
import EquipmentPerformanceTwinPanel from "./EquipmentPerformanceTwinPanel";
import EquipmentReferencePanel from "./EquipmentReferencePanel";
import BaselineMvPanel from "./BaselineMvPanel";
import InterventionLibraryPanel from "./InterventionLibraryPanel";

type Scope = "building" | "facility" | "equipment";
type Extraction = { evidenceId?: string; evidenceType?: string; observations?: Array<{ field: string; value: string; numericValue: number | null; unit: string | null; confidence: number; sourceText: string }> };
type Assessment = { assessmentSubject?: Scope; assetClass?: string | null };

export default function OverhaulCommandCenter() {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [extracts, setExtracts] = useState<Extraction[]>([]);

  useEffect(() => {
    try {
      setAssessment(JSON.parse(sessionStorage.getItem("overhaul:assessment") || "null"));
      setExtracts(JSON.parse(sessionStorage.getItem("overhaul:evidence-extractions") || "[]"));
    } catch {
      setAssessment(null);
      setExtracts([]);
    }
  }, []);

  const scope = assessment?.assessmentSubject ?? "building";
  const isEquipment = scope === "equipment";

  return (
    <>
      {isEquipment ? (
        <>
          <EquipmentReferencePanel extracts={extracts} />
          <EquipmentPerformanceTwinPanel assetClass={assessment?.assetClass} extracts={extracts} />
        </>
      ) : null}
      <RetrofitCommandCenter />
      <InterventionLibraryPanel scope={scope} extracts={extracts} />
      <BaselineMvPanel />
      {isEquipment ? (
        <div className="mx-auto mt-4 max-w-[1500px] px-4 pb-8 text-[10px] font-mono uppercase tracking-[0.12em] text-steel sm:px-6 lg:px-8">
          Equipment twin is the primary diagnostic surface; retrofit actions and measurement & verification consume confirmed residuals and reference provenance.
        </div>
      ) : null}
    </>
  );
}
