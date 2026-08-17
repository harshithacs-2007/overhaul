/**
 * Building readiness for simulation — from real required inputs only.
 */

import type { EngineeringReadyModel } from "@/lib/engineering/model";
import { engineeringModelToPhysicsInput } from "@/lib/physics/fromModel";

export interface MissingInputAction {
  id: string;
  label: string;
  path: string;
  actionHint: string;
}

export interface ReadinessReport {
  ready: boolean;
  missing: MissingInputAction[];
  warnings: string[];
  summary: string;
}

export function assessSimulationReadiness(
  model: EngineeringReadyModel,
  mode: "cooling" | "heating" = "cooling"
): ReadinessReport {
  const mapped = engineeringModelToPhysicsInput(model, mode);
  const missing: MissingInputAction[] = [];

  for (const m of mapped.blockingMissing) {
    missing.push(mapBlocking(m));
  }

  // Conduction needs at least one surface with area+U for a meaningful baseline
  const usableSurfaces = model.envelope.surfaces.filter((s) => {
    if (s.kind === "floor") return false;
    const a = s.areaM2?.value;
    const u = s.uValueWm2K?.value;
    return (
      a != null &&
      a > 0 &&
      s.areaM2.provenance.kind !== "UNKNOWN" &&
      u != null &&
      u > 0 &&
      s.uValueWm2K.provenance.kind !== "UNKNOWN"
    );
  });

  if (usableSurfaces.length === 0) {
    missing.push({
      id: "envelope_surfaces",
      label: "Envelope area + U-value",
      path: "envelope",
      actionHint: "Add wall/roof/window area and U-value",
    });
  }

  const hvacCap = model.hvac.systems[0]?.ratedCapacityKW;
  if (
    !hvacCap ||
    hvacCap.value == null ||
    hvacCap.provenance.kind === "UNKNOWN"
  ) {
    // Not blocking physics, but HVAC verdict incomplete
    mapped.warnings.push("HVAC capacity unknown — capacity check will be incomplete");
  }

  const unique = dedupeMissing(missing);
  const ready = unique.length === 0 && mapped.ok;

  return {
    ready,
    missing: unique,
    warnings: mapped.warnings,
    summary: ready
      ? "READY TO SIMULATE"
      : `${unique.length} INPUT${unique.length === 1 ? "" : "S"} REQUIRED`,
  };
}

function mapBlocking(m: string): MissingInputAction {
  const lower = m.toLowerCase();
  if (lower.includes("location")) {
    return {
      id: "location",
      label: "Location",
      path: "location",
      actionHint: "Add location information",
    };
  }
  if (lower.includes("climate") || lower.includes("outdoor")) {
    return {
      id: "climate",
      label: "Climate / design temperature",
      path: "climate",
      actionHint: "Resolve location + climate",
    };
  }
  if (lower.includes("indoor") || lower.includes("setpoint")) {
    return {
      id: "indoor",
      label: "Indoor setpoint",
      path: "operating.comfortTempC",
      actionHint: "Add indoor temperature setpoint",
    };
  }
  return {
    id: m,
    label: m,
    path: m,
    actionHint: `Add ${m}`,
  };
}

function dedupeMissing(list: MissingInputAction[]): MissingInputAction[] {
  const seen = new Set<string>();
  return list.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}
