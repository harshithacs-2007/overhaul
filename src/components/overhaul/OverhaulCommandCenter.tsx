"use client";

import { useEffect, useMemo, useState } from "react";
import RetrofitCommandCenter from "./RetrofitCommandCenter";
import EquipmentPerformanceTwinPanel from "./EquipmentPerformanceTwinPanel";
import TwinBuildSequence from "./TwinBuildSequence";

type Scope = "building" | "facility" | "equipment";
type Extraction = { evidenceId?: string; evidenceType?: string; observations?: Array<{ field: string; value: string; numericValue: number | null; unit: string | null; confidence: number; sourceText: string }> };
type Assessment = { assessmentSubject?: Scope; assetClass?: string | null; evidence?: Array<unknown> };

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

  const signalCount = useMemo(() => extracts.reduce((sum, item) => sum + (item.observations?.length ?? 0), 0), [extracts]);
  const confidence = useMemo(() => {
    const values = extracts.flatMap((item) => item.observations ?? []).map((item) => item.confidence).filter((value) => Number.isFinite(value));
    return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) : 0;
  }, [extracts]);

  const scope = assessment?.assessmentSubject ?? "building";

  return (
    <>
      <TwinBuildSequence
        scope={scope}
        evidenceCount={assessment?.evidence?.length ?? 0}
        signalCount={signalCount}
        confidence={confidence}
      />
      <RetrofitCommandCenter />
      {scope === "equipment" ? (
        <EquipmentPerformanceTwinPanel assetClass={assessment?.assetClass} extracts={extracts} />
      ) : null}
    </>
  );
}
