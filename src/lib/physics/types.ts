/**
 * Physics engine types — SI internally.
 * Q_W = U_Wm2K × A_m2 × ΔT_K
 */

export interface MaterialLayerInput {
  id: string;
  label?: string;
  /** metres */
  thicknessM: number;
  /** W/(m·K) */
  conductivityWmK: number;
}

export interface SurfacePhysicsInput {
  id: string;
  kind: "wall" | "roof" | "window" | "door" | "floor";
  /** m² */
  areaM2: number;
  /** Direct U if known (W/m²K) — preferred over layers when set */
  uValueWm2K?: number;
  layers?: MaterialLayerInput[];
  /** Optional fixed R film sum (m²K/W); default ISO 6946-ish 0.17 */
  surfaceResistanceM2KW?: number;
  orientationDeg?: number;
  shgc?: number;
}

export interface VentilationPhysicsInput {
  mode: "ach" | "airflow_m3s" | "unknown";
  ach?: number;
  airflowM3s?: number;
  kind?: "infiltration" | "mechanical" | "natural" | "unknown";
}

export interface SolarPhysicsInput {
  /** W/m² incident on glazing — from climate when available */
  incidentRadiationWm2?: number;
  windowAreaM2?: number;
  shgc?: number;
}

export interface HvacPhysicsInput {
  ratedCapacityKW?: number;
  efficiencyMetric?: string;
  efficiencyValue?: number;
  systemAgeYears?: number;
  systemType?: string;
}

export interface PhysicsRunInput {
  indoorTempC: number;
  /** Design outdoor — from climate; never invent */
  outdoorTempC: number;
  outdoorTempSource: string;
  surfaces: SurfacePhysicsInput[];
  ventilation: VentilationPhysicsInput;
  solar: SolarPhysicsInput;
  hvac: HvacPhysicsInput;
  mode: "cooling" | "heating";
  /** m³ — required for ACH-based ventilation */
  volumeM3?: number;
}

export type CalcStatus = "calculated" | "partial" | "unavailable";

export interface TraceRecord {
  id: string;
  title: string;
  status: CalcStatus;
  formula: string;
  inputs: Record<string, string | number | null>;
  result: number | null;
  resultUnit: string;
  assumptions: string[];
  missingInputs: string[];
  dataSource?: string;
}

export interface ComponentHeatTransferResult {
  componentId: string;
  kind: SurfacePhysicsInput["kind"];
  status: CalcStatus;
  areaM2: number | null;
  uValueWm2K: number | null;
  deltaT_K: number | null;
  heatTransferW: number | null;
  trace: TraceRecord;
}

export interface LoadEstimateResult {
  status: CalcStatus;
  label: string;
  conductionW: number | null;
  solarW: number | null;
  ventilationW: number | null;
  totalW: number | null;
  totalKW: number | null;
  components: ComponentHeatTransferResult[];
  traces: TraceRecord[];
  missingInputs: string[];
  assumptions: string[];
}

export type HvacFitState =
  | "insufficient"
  | "adequate"
  | "potentially_oversized"
  | "unable_to_determine";

export interface HvacCapacityCheck {
  status: CalcStatus;
  state: HvacFitState;
  installedCapacityKW: number | null;
  requiredCapacityKW: number | null;
  marginKW: number | null;
  /** Documented thresholds used */
  thresholds: {
    oversizedRatio: number;
    note: string;
  };
  ageYears: number | null;
  ageNote: string;
  efficiencyNote: string | null;
  trace: TraceRecord;
}

export interface PhysicsRunResult {
  mode: "cooling" | "heating";
  outdoorTempC: number;
  outdoorTempSource: string;
  indoorTempC: number;
  load: LoadEstimateResult;
  hvac: HvacCapacityCheck;
  ranAt: string;
}
