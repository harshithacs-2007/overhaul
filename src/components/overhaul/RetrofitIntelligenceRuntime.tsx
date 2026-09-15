"use client";

import { useEffect, useState } from "react";
import RetrofitIntelligenceSuite from "./RetrofitIntelligenceSuite";

type Scope = "building" | "facility" | "equipment";
type Values = Record<string, number | string | null | undefined>;
type Extraction = {
  evidenceId?: string;
  sourceName?: string;
  sourceKind?: string;
  observations?: Array<{
    field: string;
    value: string;
    numericValue: number | null;
    unit: string | null;
    confidence: number;
    sourceText?: string;
    notes?: string;
  }>;
};
type Assessment = { assessmentSubject?: Scope };
type Climate = { temperature?: number; humidity?: number; min?: number; max?: number; location?: string } | null;

function readJson<T>(key: string, fallback: T): T {
  try { return JSON.parse(sessionStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; }
}
function canonical(field: string) {
  return field.toLowerCase().trim().replace(/[()\-\/]+/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_");
}

export default function RetrofitIntelligenceRuntime() {
  const [scope, setScope] = useState<Scope>("building");
  const [values, setValues] = useState<Values>({});
  const [extracts, setExtracts] = useState<Extraction[]>([]);
  const [climate, setClimate] = useState<Climate>(null);

  useEffect(() => {
    const sync = () => {
      const assessment = readJson<Assessment | null>("overhaul:assessment", null);
      const nextExtracts = readJson<Extraction[]>("overhaul:evidence-extractions", []);
      const supplemental = readJson<Values>("overhaul:supplemental-values", {});
      const nextValues: Values = {};
      for (const extraction of nextExtracts) {
        for (const observation of extraction.observations || []) {
          if (observation.numericValue != null && Number.isFinite(observation.numericValue)) nextValues[canonical(observation.field)] = observation.numericValue;
        }
      }
      for (const [key, value] of Object.entries(supplemental)) {
        if (nextValues[key] == null && typeof value === "number" && Number.isFinite(value)) nextValues[key] = value;
      }
      setScope(assessment?.assessmentSubject || "building");
      setExtracts(nextExtracts);
      setValues(nextValues);
      setClimate(readJson<Climate>("overhaul:climate-context", null));
    };
    sync();
    const events = ["overhaul:supplemental-change", "overhaul:evidence-change", "overhaul:climate-change", "storage"];
    for (const event of events) window.addEventListener(event, sync);
    return () => { for (const event of events) window.removeEventListener(event, sync); };
  }, []);

  return <RetrofitIntelligenceSuite scope={scope} values={values} extracts={extracts} climate={climate} />;
}
