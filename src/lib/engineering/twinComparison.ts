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
 * Builds the proposed visual twin without inventing engineering geometry.
 * Geometry is copied from the verified/relative source model; only explicitly
 * selected retrofit consequences are annotated onto visible assets.
 */
export function buildRetrofitTwin(model: TwinModel, values: Values): TwinModel {
  const proposed = structuredClone(model);
  const currentEfficiency = number(values, "efficiency", "cop", "hvac_cop");
  const targetEfficiency = number(values, "proposed_efficiency", "proposed_cop");
  const currentR = number(values, "existing_r_value_m2k_w", "current_r_value_m2k_w");
  const targetR = number(values, "proposed_r_value_m2k_w", "proposed_r_value_m2k_w");
  const currentHours = number(values, "annual_hours", "annual_cooling_hours", "runtime_hours", "cooling_hours");
  const targetHours = number(values, "proposed_runtime_hours");
  const hasEfficiencyUpgrade = positiveDelta(targetEfficiency, currentEfficiency);
  const hasEnvelopeUpgrade = positiveDelta(targetR, currentR);
  const hasRuntimeChange = currentHours != null && targetHours != null && targetHours > 0 && targetHours !== currentHours;

  const retrofitNotes: string[] = [];
  if (hasEfficiencyUpgrade) retrofitNotes.push(`Performance target: ${targetEfficiency!.toFixed(2)} vs ${currentEfficiency!.toFixed(2)} baseline.`);
  if (hasEnvelopeUpgrade) retrofitNotes.push(`Envelope target: R ${targetR!.toFixed(3)} vs ${currentR!.toFixed(3)} baseline.`);
  if (hasRuntimeChange) retrofitNotes.push(`Runtime target: ${targetHours!.toFixed(0)} h/yr vs ${currentHours!.toFixed(0)} h/yr baseline.`);

  if (hasEfficiencyUpgrade) {
    proposed.assets = proposed.assets.map((asset) => ({
      ...asset,
      observedState: `${asset.observedState ? `${asset.observedState} · ` : ""}RETROFIT TARGET · performance upgrade explicitly selected`,
    }));
    if (!proposed.assets.length) {
      proposed.assets.push({
        id: "retrofit-performance-target",
        label: "HVAC / equipment performance target",
        className: "retrofit-performance-target",
        x: proposed.overall.widthM * 0.5,
        y: proposed.overall.depthM * 0.5,
        widthM: Math.max(proposed.overall.widthM * 0.08, 0.1),
        depthM: Math.max(proposed.overall.depthM * 0.08, 0.1),
        heightM: Math.max(proposed.overall.heightM * 0.12, 0.1),
        rotationDeg: 0,
        source: "user",
        confidence: model.confidence,
        observedState: "RETROFIT TARGET · no existing equipment geometry was evidenced",
      });
    }
  }

  if (hasRuntimeChange) {
    proposed.assets = proposed.assets.map((asset) => ({
      ...asset,
      observedState: `${asset.observedState ? `${asset.observedState} · ` : ""}CONTROL / RUNTIME TARGET`,
    }));
  }

  if (hasEnvelopeUpgrade) {
    proposed.warnings = [
      ...proposed.warnings,
      "Proposed view highlights the explicit envelope R-value intervention. No new wall thickness or area is invented by this comparison model.",
    ];
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
