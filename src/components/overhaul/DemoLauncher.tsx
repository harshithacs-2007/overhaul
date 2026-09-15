"use client";

import { useRouter } from "next/navigation";

function launch(kind: "building" | "equipment") {
  const evidenceId = `demo-${kind}-evidence`;
  const assessment = {
    assessmentSubject: kind,
    assessmentGoal: "retrofit",
    industry: kind === "equipment" ? "industrial" : "commercial",
    siteName: kind === "equipment" ? "Demo compressor train" : "Demo office building",
    assetClass: kind === "equipment" ? "Compressor" : null,
    createdAt: new Date().toISOString(),
    status: "evidence-analyzed",
    evidence: [{ id: evidenceId, kind: "document", name: "Synthetic engineering demo", type: "application/json", size: 0 }],
  };
  const observations = kind === "equipment"
    ? [{ evidenceId, sourceKind: "document", sourceName: "Synthetic engineering demo", observations: [
        { field: "load_kw", value: "75", numericValue: 75, unit: "kW", confidence: 1, sourceText: "DEMO ONLY — assumed operating load for presentation." },
        { field: "capacity_kw", value: "100", numericValue: 100, unit: "kW", confidence: 1, sourceText: "DEMO ONLY — assumed rated capacity for presentation." },
        { field: "efficiency", value: "0.72", numericValue: 0.72, unit: "kW/kW", confidence: 1, sourceText: "DEMO ONLY — assumed baseline efficiency for presentation." },
        { field: "annual_hours", value: "6000", numericValue: 6000, unit: "h/yr", confidence: 1, sourceText: "DEMO ONLY — assumed runtime for presentation." },
        { field: "electricity_rate_inr_per_kwh", value: "9.5", numericValue: 9.5, unit: "INR/kWh", confidence: 1, sourceText: "DEMO ONLY — assumed tariff for presentation." },
        { field: "proposed_efficiency", value: "0.84", numericValue: 0.84, unit: "kW/kW", confidence: 1, sourceText: "DEMO ONLY — assumed upgrade reference for presentation." },
        { field: "baseline_runtime_hours", value: "6000", numericValue: 6000, unit: "h/yr", confidence: 1, sourceText: "DEMO ONLY — assumed baseline runtime." },
        { field: "proposed_runtime_hours", value: "5400", numericValue: 5400, unit: "h/yr", confidence: 1, sourceText: "DEMO ONLY — assumed optimized runtime." },
      ] }]
    : [{ evidenceId, sourceKind: "document", sourceName: "Synthetic engineering demo", observations: [
        { field: "floor_area_m2", value: "1800", numericValue: 1800, unit: "m²", confidence: 1, sourceText: "DEMO ONLY — assumed floor area for presentation." },
        { field: "envelope_ua_w_per_k", value: "420", numericValue: 420, unit: "W/K", confidence: 1, sourceText: "DEMO ONLY — assumed envelope UA for presentation." },
        { field: "outdoor_temp_c", value: "38", numericValue: 38, unit: "°C", confidence: 1, sourceText: "DEMO ONLY — assumed outdoor boundary condition." },
        { field: "indoor_temp_c", value: "24", numericValue: 24, unit: "°C", confidence: 1, sourceText: "DEMO ONLY — assumed indoor condition." },
        { field: "capacity_kw", value: "260", numericValue: 260, unit: "kW", confidence: 1, sourceText: "DEMO ONLY — assumed HVAC capacity." },
        { field: "cop", value: "3.2", numericValue: 3.2, unit: "COP", confidence: 1, sourceText: "DEMO ONLY — assumed HVAC COP." },
        { field: "annual_cooling_hours", value: "2800", numericValue: 2800, unit: "h/yr", confidence: 1, sourceText: "DEMO ONLY — assumed annual cooling hours." },
        { field: "electricity_rate_inr_per_kwh", value: "9.5", numericValue: 9.5, unit: "INR/kWh", confidence: 1, sourceText: "DEMO ONLY — assumed tariff." },
        { field: "existing_r_value_m2k_w", value: "1.5", numericValue: 1.5, unit: "m²K/W", confidence: 1, sourceText: "DEMO ONLY — assumed envelope resistance." },
        { field: "proposed_r_value_m2k_w", value: "3.0", numericValue: 3, unit: "m²K/W", confidence: 1, sourceText: "DEMO ONLY — assumed retrofit target." },
        { field: "geometry_width_m", value: "45", numericValue: 45, unit: "m", confidence: 1, sourceText: "DEMO ONLY — explicit metric demonstration geometry." },
        { field: "geometry_depth_m", value: "40", numericValue: 40, unit: "m", confidence: 1, sourceText: "DEMO ONLY — explicit metric demonstration geometry." },
        { field: "geometry_height_m", value: "8", numericValue: 8, unit: "m", confidence: 1, sourceText: "DEMO ONLY — explicit metric demonstration geometry." },
      ] }];
  sessionStorage.setItem("overhaul:assessment", JSON.stringify(assessment));
  sessionStorage.setItem("overhaul:evidence-extractions", JSON.stringify(observations));
  sessionStorage.setItem("overhaul:supplemental-values", "{}");
}

export default function DemoLauncher() {
  const router = useRouter();
  const start = (kind: "building" | "equipment") => { launch(kind); router.push("/assessment"); };
  return (
    <div className="fixed bottom-4 right-4 z-50 border border-teal/30 bg-[#070b0b]/95 p-3 shadow-2xl backdrop-blur">
      <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-teal">Presentation mode · synthetic demo</p>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => start("building")} className="border border-teal/35 px-3 py-2 font-mono text-[8px] uppercase text-teal hover:bg-teal/5">Building demo</button>
        <button type="button" onClick={() => start("equipment")} className="border border-steel/25 px-3 py-2 font-mono text-[8px] uppercase text-paper hover:border-teal">Machine demo</button>
      </div>
    </div>
  );
}
