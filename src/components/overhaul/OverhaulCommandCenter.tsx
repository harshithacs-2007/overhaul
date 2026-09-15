"use client";

import { useEffect, useState } from "react";
import RetrofitCommandCenter from "./RetrofitCommandCenter";
import EquipmentPerformanceTwinPanel from "./EquipmentPerformanceTwinPanel";
import EquipmentReferencePanel from "./EquipmentReferencePanel";

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

  return (
    <>
      <RetrofitCommandCenter />
      {assessment?.assessmentSubject === "equipment" ? (
        <>
          <EquipmentReferencePanel extracts={extracts} />
          <EquipmentPerformanceTwinPanel assetClass={assessment.assetClass} extracts={extracts} />
        </>
      ) : null}
    </>
  );
}
