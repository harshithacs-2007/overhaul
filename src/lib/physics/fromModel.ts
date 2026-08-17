/**
 * Map EngineeringReadyModel → PhysicsRunInput.
 * Only uses structured values with known provenance — never invents.
 */

import type { EngineeringReadyModel } from "@/lib/engineering/model";
import type { PhysicsRunInput, SurfacePhysicsInput } from "./types";

export interface ModelToPhysicsResult {
  ok: boolean;
  input?: PhysicsRunInput & { volumeM3?: number };
  blockingMissing: string[];
  warnings: string[];
}

function knownNum(v: { value: number | null; provenance: { kind: string } } | undefined): number | null {
  if (!v || v.value == null) return null;
  if (v.provenance.kind === "UNKNOWN") return null;
  return v.value;
}

export function engineeringModelToPhysicsInput(
  model: EngineeringReadyModel,
  mode: "cooling" | "heating" = "cooling"
): ModelToPhysicsResult {
  const blockingMissing: string[] = [];
  const warnings: string[] = [];

  if (!model.location) {
    blockingMissing.push("location");
  }
  if (!model.climate) {
    blockingMissing.push("climate context");
  }

  const indoor = knownNum(model.operating.comfortTempC);
  if (indoor == null) {
    blockingMissing.push("indoor setpoint (°C)");
  }

  let outdoorTempC: number | null = null;
  let outdoorTempSource = "";
  if (model.climate) {
    const design =
      mode === "cooling"
        ? model.climate.designConditions.coolingDesignTempC
        : model.climate.designConditions.heatingDesignTempC;
    if (design.availability === "available" && design.data?.value != null) {
      outdoorTempC = design.data.value;
      outdoorTempSource =
        design.meta?.dataset ??
        `${mode} design temperature from ${model.climate.provider}`;
    } else {
      blockingMissing.push(
        `${mode} design outdoor temperature (climate unavailable)`
      );
      if (design.note) warnings.push(design.note);
    }
    warnings.push(...model.climate.warnings);
  }

  const surfaces: SurfacePhysicsInput[] = [];
  for (const s of model.envelope.surfaces) {
    if (s.kind === "floor") continue;
    const area = knownNum(s.areaM2);
    const u = knownNum(s.uValueWm2K);
    // Include surface even if incomplete — engine marks unavailable per component
    surfaces.push({
      id: s.id,
      kind: s.kind,
      areaM2: area ?? 0,
      uValueWm2K: u ?? undefined,
      orientationDeg: knownNum(s.orientationDeg) ?? undefined,
    });
    if (area == null) warnings.push(`${s.id}: area unknown`);
    if (u == null) warnings.push(`${s.id}: U-value unknown`);
  }

  const windowAreas = model.envelope.surfaces
    .filter((s) => s.kind === "window")
    .map((s) => knownNum(s.areaM2))
    .filter((a): a is number => a != null);
  const windowAreaSum =
    windowAreas.length > 0 ? windowAreas.reduce((a, b) => a + b, 0) : undefined;

  // SHGC not on model yet — leave missing unless we add field; solar stays unavailable
  const solarRad =
    model.climate?.solarRadiation.availability === "available"
      ? model.climate.solarRadiation.data?.value ?? undefined
      : undefined;

  const hvacSys = model.hvac.systems[0];
  const floorArea = knownNum(model.building.floorAreaM2);
  const height = knownNum(model.geometry.heightM);
  const volumeM3 =
    floorArea != null && height != null ? floorArea * height : null;

  const ach = model.operating.ach ? knownNum(model.operating.ach) : null;
  const ventilation =
    ach != null
      ? {
          mode: "ach" as const,
          ach,
          kind: "unknown" as const,
        }
      : {
          mode: "unknown" as const,
          kind: "unknown" as const,
        };

  const shgc = model.operating.shgc ? knownNum(model.operating.shgc) : null;

  if (blockingMissing.length || outdoorTempC == null || indoor == null) {
    return { ok: false, blockingMissing, warnings };
  }

  const input: PhysicsRunInput & { volumeM3?: number } = {
    indoorTempC: indoor,
    outdoorTempC,
    outdoorTempSource,
    surfaces,
    ventilation,
    solar: {
      incidentRadiationWm2: solarRad,
      windowAreaM2: windowAreaSum,
      shgc: shgc ?? undefined,
    },
    hvac: {
      ratedCapacityKW: hvacSys ? knownNum(hvacSys.ratedCapacityKW) ?? undefined : undefined,
      efficiencyMetric: hvacSys?.efficiencyMetric.value ?? undefined,
      efficiencyValue: hvacSys ? knownNum(hvacSys.efficiencyValue) ?? undefined : undefined,
      systemAgeYears: hvacSys ? knownNum(hvacSys.ageYears) ?? undefined : undefined,
      systemType: hvacSys?.systemType.value ?? undefined,
    },
    mode,
    volumeM3: volumeM3 ?? undefined,
  };

  return { ok: true, input, blockingMissing: [], warnings };
}
