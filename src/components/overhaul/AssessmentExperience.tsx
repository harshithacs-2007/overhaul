"use client";

import { useMemo, useState } from "react";
import AssetTwinViewport from "./AssetTwinViewportV2";
import EngineeringAnchorGate from "./EngineeringAnchorGate";
import { sanitizeTwinModel, type TwinModel } from "@/lib/engineering/twinModel";

type Scope = "building" | "facility" | "equipment";
type Assessment = {
  assessmentSubject?: Scope;
  siteName?: string | null;
  assetClass?: string | null;
  assetAgeYears?: number | null;
  evidence?: Array<{ id: string; kind: string; name: string; type: string; size: number }>;
};
type Values = Record<string, number | string | null>;

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { return JSON.parse(sessionStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; }
}
function canonical(field: string) {
  return field.toLowerCase().trim().replace(/[()\-\/]+/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_");
}

export default function AssessmentExperience() {
  const [assessment] = useState<Assessment | null>(() => read("overhaul:assessment", null));
  const [supplemental] = useState<Values>(() => read("overhaul:supplemental-values", {}));
  const [twin] = useState<TwinModel | null>(() => sanitizeTwinModel(read("overhaul:twin-model", null)));
  const values = useMemo(() => {
    const next: Values = {};
    for (const [key, value] of Object.entries(supplemental)) {
      if ((typeof value === "number" && Number.isFinite(value)) || typeof value === "string") next[canonical(key)] = value;
    }
    return next;
  }, [supplemental]);
  const scope = assessment?.assessmentSubject || "building";
  const title = assessment?.siteName || assessment?.assetClass || (scope === "equipment" ? "Asset model" : "Site model");
  const assetClass = assessment?.assetClass || (scope === "equipment" ? "Equipment" : scope === "facility" ? "Facility" : "Building");
  const evidenceIds = (assessment?.evidence || []).map((item) => item.id);

  return (
    <main className="mx-auto max-w-[1600px] space-y-5 px-4 py-5 sm:px-7 lg:px-10">
      <section className="border border-gold/25 bg-[#080a09] p-6 shadow-[0_26px_110px_rgba(0,0,0,.28)]">
        <p className="font-mono text-[8px] uppercase tracking-[.22em] text-gold">Retrofit command center</p>
        <h1 className="mt-2 font-display text-4xl leading-[.95] sm:text-5xl">Evidence → digital shadow → retrofit.</h1>
        <p className="mt-4 max-w-3xl text-[10px] leading-5 text-steel">The reconstruction is driven by the supplied evidence model. Metric geometry is promoted only when a valid measurement anchor exists.</p>
      </section>

      <EngineeringAnchorGate scope={scope} values={values} assetAgeYears={assessment?.assetAgeYears} />

      {twin ? (
        <AssetTwinViewport
          scope={scope}
          title={title}
          assetClass={assetClass}
          evidenceIds={evidenceIds}
          values={values}
          twin={twin}
        />
      ) : (
        <section className="border border-amber-200/25 bg-amber-200/[.025] p-6">
          <p className="font-mono text-[8px] uppercase text-amber-200">Digital shadow pending</p>
          <h2 className="mt-2 font-display text-3xl">Supply a scan, image, drawing or explicit dimensions.</h2>
          <p className="mt-2 text-[10px] leading-5 text-steel">OVERHAUL will not invent geometry when evidence is missing.</p>
        </section>
      )}
    </main>
  );
}
