/** Validation — reject impossible values; unknowns OK */

import type { EngineeringReadyModel } from "./model";
import type { HvacSystem } from "./hvac";
import type { BuildingIdentity } from "./building";
import type { ResolvedLocation } from "./climate";

export interface ValidationIssue {
  path: string;
  severity: "error" | "warning";
  message: string;
}

export function validateLocation(loc: ResolvedLocation | null): ValidationIssue[] {
  if (!loc) return [{ path: "location", severity: "warning", message: "Location unknown" }];
  const issues: ValidationIssue[] = [];
  const { latitude, longitude } = loc.coordinates;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    issues.push({
      path: "location.coordinates",
      severity: "error",
      message: "Coordinates out of range",
    });
  }
  if (loc.precision === "city" || loc.precision === "place") {
    issues.push({
      path: "location.precision",
      severity: "warning",
      message:
        "Resolved place is not an exact building parcel — do not treat as precise site coordinates",
    });
  }
  return issues;
}

export function validateBuilding(b: BuildingIdentity): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const area = b.floorAreaM2.value;
  if (area != null) {
    if (area <= 0 || area > 1_000_000) {
      issues.push({
        path: "building.floorAreaM2",
        severity: "error",
        message: "Floor area out of plausible range",
      });
    }
  }
  const floors = b.floors.value;
  if (floors != null && (!Number.isInteger(floors) || floors < 1 || floors > 200)) {
    issues.push({
      path: "building.floors",
      severity: "error",
      message: "Floor count invalid",
    });
  }
  const age = b.ageYears.value;
  if (age != null && (age < 0 || age > 300)) {
    issues.push({
      path: "building.ageYears",
      severity: "error",
      message: "Building age invalid",
    });
  }
  const ori = b.orientationDeg.value;
  if (ori != null && (ori < 0 || ori >= 360)) {
    issues.push({
      path: "building.orientationDeg",
      severity: "error",
      message: "Orientation must be 0–359°",
    });
  }
  return issues;
}

export function validateHvacSystem(s: HvacSystem): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const cap = s.ratedCapacityKW.value;
  if (cap != null && (cap <= 0 || cap > 50_000)) {
    issues.push({
      path: `hvac.${s.id}.ratedCapacityKW`,
      severity: "error",
      message: "Rated capacity out of plausible range",
    });
  }
  const age = s.ageYears.value;
  if (age != null && (age < 0 || age > 80)) {
    issues.push({
      path: `hvac.${s.id}.ageYears`,
      severity: "error",
      message: "HVAC age invalid",
    });
  }
  return issues;
}

export function validateEngineeringModel(
  model: EngineeringReadyModel
): ValidationIssue[] {
  return [
    ...validateLocation(model.location),
    ...validateBuilding(model.building),
    ...model.hvac.systems.flatMap(validateHvacSystem),
  ];
}
