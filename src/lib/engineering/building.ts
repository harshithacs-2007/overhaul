/**
 * Verified building / envelope / geometry domain — unknowns valid, never invented.
 */

import type { ProvenancedValue } from "./provenance";
import { unknownValue } from "./provenance";

export type BuildingType = "home" | "office" | "mixed" | "other" | "unknown";

export interface BuildingIdentity {
  type: ProvenancedValue<BuildingType>;
  floorAreaM2: ProvenancedValue<number>;
  floors: ProvenancedValue<number>;
  ageYears: ProvenancedValue<number>;
  orientationDeg: ProvenancedValue<number>;
}

export interface EnvelopeSurface {
  id: string;
  kind: "wall" | "roof" | "floor" | "window" | "door";
  assemblyId: ProvenancedValue<string>;
  materialNotes: ProvenancedValue<string>;
  insulationNotes: ProvenancedValue<string>;
  areaM2: ProvenancedValue<number>;
  uValueWm2K: ProvenancedValue<number>;
  orientationDeg: ProvenancedValue<number>;
  shadingNotes: ProvenancedValue<string>;
  glazingType: ProvenancedValue<string>;
  evidenceIds: string[];
}

export interface EnvelopeModel {
  surfaces: EnvelopeSurface[];
}

export interface GeometryModel {
  lengthM: ProvenancedValue<number>;
  widthM: ProvenancedValue<number>;
  heightM: ProvenancedValue<number>;
  zones: Array<{
    id: string;
    label: ProvenancedValue<string>;
    areaM2: ProvenancedValue<number>;
  }>;
  openings: Array<{
    id: string;
    kind: "window" | "door";
    areaM2: ProvenancedValue<number>;
    evidenceIds: string[];
  }>;
}

export function emptyBuildingIdentity(): BuildingIdentity {
  return {
    type: unknownValue(),
    floorAreaM2: unknownValue(),
    floors: unknownValue(),
    ageYears: unknownValue(),
    orientationDeg: unknownValue(),
  };
}

export function emptyEnvelope(): EnvelopeModel {
  return {
    surfaces: [
      emptySurface("wall_1", "wall"),
      emptySurface("roof_1", "roof"),
      emptySurface("window_1", "window"),
      emptySurface("door_1", "door"),
    ],
  };
}

export function emptySurface(
  id: string,
  kind: EnvelopeSurface["kind"]
): EnvelopeSurface {
  return {
    id,
    kind,
    assemblyId: unknownValue(),
    materialNotes: unknownValue(),
    insulationNotes: unknownValue(),
    areaM2: unknownValue(),
    uValueWm2K: unknownValue(),
    orientationDeg: unknownValue(),
    shadingNotes: unknownValue(),
    glazingType: unknownValue(),
    evidenceIds: [],
  };
}

export function emptyGeometry(): GeometryModel {
  return {
    lengthM: unknownValue(),
    widthM: unknownValue(),
    heightM: unknownValue(),
    zones: [],
    openings: [],
  };
}
