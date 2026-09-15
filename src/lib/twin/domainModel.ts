export type TwinScope = "building" | "facility" | "equipment";

export type EvidenceConfidence = "measured" | "documented" | "ocr" | "vision" | "inferred" | "unknown";

export interface TwinSignal {
  key: string;
  value: number | string | null;
  unit?: string;
  confidence: number;
  source: EvidenceConfidence;
  sourceText?: string;
  evidenceId?: string;
}

export interface TwinAsset {
  id: string;
  label: string;
  category: "space" | "envelope" | "hvac" | "equipment" | "process" | "utility";
  x: number;
  y: number;
  width: number;
  height: number;
  status: "observed" | "modeled" | "unknown";
  signals: string[];
}

export interface TwinModel {
  scope: TwinScope;
  industry: string;
  title: string;
  confidence: number;
  assets: TwinAsset[];
  signals: TwinSignal[];
  unknowns: string[];
}

export function buildTwinModel(input: {
  scope: TwinScope;
  industry: string;
  title: string;
  evidence: Array<{ id: string; kind: string }>;
  observations: TwinSignal[];
}): TwinModel {
  const obs = input.observations.filter((item) => item.value !== null);
  const isEquipment = input.scope === "equipment";
  const isFacility = input.scope === "facility";
  const assets: TwinAsset[] = [];

  if (!isEquipment) {
    assets.push(
      { id: "space-main", label: isFacility ? "Facility zones" : "Conditioned space", category: "space", x: 16, y: 14, width: 68, height: 58, status: obs.length ? "observed" : "modeled", signals: ["floor_area", "occupancy"] },
      { id: "env-west", label: "Envelope", category: "envelope", x: 8, y: 8, width: 84, height: 72, status: obs.length ? "observed" : "unknown", signals: ["u_value", "window_area", "shading"] },
      { id: "hvac", label: "HVAC / thermal plant", category: "hvac", x: 56, y: 61, width: 20, height: 13, status: "modeled", signals: ["cooling_load_kw", "rated_capacity_kw", "efficiency"] }
    );
  }

  assets.push(
    { id: "asset-core", label: isEquipment ? "Assessed equipment" : "Major equipment", category: "equipment", x: isEquipment ? 35 : 62, y: isEquipment ? 30 : 67, width: isEquipment ? 30 : 20, height: isEquipment ? 28 : 12, status: obs.length ? "observed" : "modeled", signals: ["model", "power_kw", "rated_capacity_kw", "flow_m3h"] }
  );

  if (isFacility) {
    assets.push(
      { id: "process", label: "Process / production", category: "process", x: 18, y: 66, width: 28, height: 12, status: "modeled", signals: ["process_load_kw", "runtime_hours"] },
      { id: "utility", label: "Utilities", category: "utility", x: 48, y: 9, width: 16, height: 9, status: "modeled", signals: ["electricity_kw", "fuel_kw"] }
    );
  }

  const confidence = Math.round(Math.min(0.97, 0.24 + input.evidence.length * 0.09 + obs.length * 0.025) * 100);
  const required = isEquipment ? ["rated_capacity_kw", "power_kw"] : ["floor_area", "hvac_capacity_kw", "outdoor_temp_c"];
  const knownKeys = new Set(obs.map((item) => item.key));
  const unknowns = required.filter((key) => !knownKeys.has(key));

  return {
    scope: input.scope,
    industry: input.industry,
    title: input.title,
    confidence,
    assets,
    signals: obs,
    unknowns,
  };
}
