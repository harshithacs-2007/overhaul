import type { TwinModel } from "./twinModel";

type Values = Record<string, number | string | null | undefined>;

function number(values: Values, ...keys: string[]) {
  for (const key of keys) {
    const value = Number(values[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function positiveDelta(target: number | null, current: number | null) {
  return target != null && current != null && target > 0 && current > 0 && target > current;
}

/**
 * Build the proposed visual state from the same reconstructed geometry.
 * No new engineering dimensions are inferred here. Retrofit markers are
 * explicitly visual annotations tied to supplied target parameters.
 */
export function buildRetrofitTwin(model: TwinModel, values: Values): TwinModel {
  const proposed = structuredClone(model);
  const currentEfficiency = number(values, "efficiency", "cop", "hvac_cop");
  const targetEfficiency = number(values, "proposed_efficiency", "proposed_cop");
  const currentR = number(values, "existing_r_value_m2k_w", "current_r_value_m2k_w");
  const targetR = number(values, "proposed_r_value_m2k_w", "target_r_value_m2k_w");
  const currentHours = number(values, "annual_hours", "annual_cooling_hours", "runtime_hours", "cooling_hours");
  const targetHours = number(values, "proposed_runtime_hours");
  const hasEfficiencyUpgrade = positiveDelta(targetEfficiency, currentEfficiency);
  const hasEnvelopeUpgrade = positiveDelta(targetR, currentR);
  const hasRuntimeChange = currentHours != null && targetHours != null && targetHours > 0 && targetHours !== currentHours;

  const retrofitNotes: string[] = [];
  if (hasEfficiencyUpgrade) retrofitNotes.push(`Performance target ${targetEfficiency!.toFixed(2)} vs ${currentEfficiency!.toFixed(2)} baseline.`);
  if (hasEnvelopeUpgrade) retrofitNotes.push(`Envelope target R ${targetR!.toFixed(3)} vs ${currentR!.toFixed(3)} baseline.`);
  if (hasRuntimeChange) retrofitNotes.push(`Runtime target ${targetHours!.toFixed(0)} h/yr vs ${currentHours!.toFixed(0)} h/yr baseline.`);

  if (hasEfficiencyUpgrade) {
    proposed.assets = proposed.assets.map((asset) => ({
      ...asset,
      observedState: `${asset.observedState ? `${asset.observedState} · ` : ""}RETROFIT TARGET · performance upgrade explicitly selected`,
    }));
  }

  if (hasRuntimeChange) {
    proposed.assets = proposed.assets.map((asset) => ({
      ...asset,
      observedState: `${asset.observedState ? `${asset.observedState} · ` : ""}CONTROL / RUNTIME TARGET`,
    }));
  }

  if (hasEnvelopeUpgrade && proposed.geometryStatus === "verified-metric") {
    const markerThickness = Math.max(Math.min(proposed.overall.heightM * 0.015, 0.12), 0.02);
    const markerHeight = Math.max(Math.min(proposed.overall.heightM * 0.03, 0.18), 0.04);
    const w = proposed.overall.widthM;
    const d = proposed.overall.depthM;
    const z = Math.max(markerHeight * 0.5, 0.02);
    proposed.assets = [
      ...proposed.assets,
      { id: "retrofit-envelope-n", label: "RETROFIT · envelope insulation", className: "retrofit-envelope-marker", x: w / 2, y: 0, widthM: w, depthM: markerThickness, heightM: markerHeight, rotationDeg: 0, source: "user", confidence: model.confidence, observedState: "RETROFIT TARGET · visual intervention marker; not a measured material thickness" },
      { id: "retrofit-envelope-s", label: "RETROFIT · envelope insulation", className: "retrofit-envelope-marker", x: w / 2, y: d, widthM: w, depthM: markerThickness, heightM: markerHeight, rotationDeg: 0, source: "user", confidence: model.confidence, observedState: "RETROFIT TARGET · visual intervention marker; not a measured material thickness" },
      { id: "retrofit-envelope-e", label: "RETROFIT · envelope insulation", className: "retrofit-envelope-marker", x: w, y: d / 2, widthM: markerThickness, depthM: d, heightM: markerHeight, rotationDeg: 0, source: "user", confidence: model.confidence, observedState: "RETROFIT TARGET · visual intervention marker; not a measured material thickness" },
      { id: "retrofit-envelope-w", label: "RETROFIT · envelope insulation", className: "retrofit-envelope-marker", x: 0, y: d / 2, widthM: markerThickness, depthM: d, heightM: markerHeight, rotationDeg: 0, source: "user", confidence: model.confidence, observedState: "RETROFIT TARGET · visual intervention marker; not a measured material thickness" },
    ];
    void z;
  } else if (hasEnvelopeUpgrade) {
    proposed.warnings = [...proposed.warnings, "Envelope retrofit is selected but metric geometry is not verified; no proportional envelope marker was drawn."];
  }

  proposed.warnings = [...proposed.warnings, ...retrofitNotes.map((note) => `Retrofit comparison: ${note}`)].slice(-12);
  return proposed;
}

export function describeTwinDelta(model: TwinModel, proposed: TwinModel) {
  return {
    rooms: proposed.rooms.length - model.rooms.length,
    walls: proposed.walls.length - model.walls.length,
    openings: proposed.openings.length - model.openings.length,
    assets: proposed.assets.length - model.assets.length,
    sourceGeometryUnchanged: JSON.stringify(model.rooms) === JSON.stringify(proposed.rooms) && JSON.stringify(model.walls) === JSON.stringify(proposed.walls) && JSON.stringify(model.openings) === JSON.stringify(proposed.openings),
  };
}
