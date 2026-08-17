/**
 * HVAC domain model — representation only. No sizing/performance calculations.
 */

import type { ProvenancedValue } from "./provenance";
import { unknownValue } from "./provenance";

export type HvacSystemType =
  | "split_ac"
  | "heat_pump"
  | "packaged_rtu"
  | "vrf"
  | "central_chiller"
  | "boiler"
  | "furnace"
  | "other"
  | "unknown";

export interface HvacSystem {
  id: string;
  label: ProvenancedValue<string>;
  systemType: ProvenancedValue<HvacSystemType>;
  providesHeating: ProvenancedValue<boolean>;
  providesCooling: ProvenancedValue<boolean>;
  ratedCapacityKW: ProvenancedValue<number>;
  efficiencyMetric: ProvenancedValue<string>;
  efficiencyValue: ProvenancedValue<number>;
  ageYears: ProvenancedValue<number>;
  zoning: ProvenancedValue<"single" | "multi" | "unknown">;
  controls: ProvenancedValue<string>;
  ventilation: ProvenancedValue<"natural" | "mechanical" | "mixed" | "unknown">;
  operatingScheduleNotes: ProvenancedValue<string>;
  maintenanceCondition: ProvenancedValue<"good" | "fair" | "poor" | "unknown">;
  knownInefficiencies: ProvenancedValue<string>;
  comfortProblems: ProvenancedValue<string>;
  zoneIds: string[];
  evidenceIds: string[];
}

export interface HvacModel {
  systems: HvacSystem[];
}

export function emptyHvacSystem(id = "hvac_1"): HvacSystem {
  return {
    id,
    label: unknownValue(),
    systemType: unknownValue(),
    providesHeating: unknownValue(),
    providesCooling: unknownValue(),
    ratedCapacityKW: unknownValue(),
    efficiencyMetric: unknownValue(),
    efficiencyValue: unknownValue(),
    ageYears: unknownValue(),
    zoning: unknownValue(),
    controls: unknownValue(),
    ventilation: unknownValue(),
    operatingScheduleNotes: unknownValue(),
    maintenanceCondition: unknownValue(),
    knownInefficiencies: unknownValue(),
    comfortProblems: unknownValue(),
    zoneIds: [],
    evidenceIds: [],
  };
}

export function emptyHvacModel(): HvacModel {
  return { systems: [emptyHvacSystem()] };
}
