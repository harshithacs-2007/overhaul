import type { TwinModel, TwinWall } from "./twinModel";

type Values = Record<string, number | string | null | undefined>;

function number(values: Values, ...keys: string[]) {
  for (const key of keys) { const value = Number(values[key]); if (Number.isFinite(value)) return value; }
  return null;
}
function positiveDelta(target: number | null, current: number | null) { return target != null && current != null && target > 0 && current > 0 && target > current; }
function assetIsTargetable(asset: TwinModel["assets"][number]) {
  return /hvac|air conditioner|chiller|compressor|pump|fan|boiler|refrigeration|heat pump|ahu|air handling|vrf|coil|motor|equipment|appliance/i.test(`${asset.className} ${asset.label}`);
}
function wallMarker(wall: TwinWall, index: number, model: TwinModel) {
  const dx = wall.b.x - wall.a.x; const dy = wall.b.y - wall.a.y; const length = Math.hypot(dx, dy);
  const height = Math.max(Math.min(model.overall.heightM * 0.035, 0.16), 0.05);
  const markerThickness = Math.max(Math.min(wall.thicknessM * 1.15, 0.08), 0.02);
  return {
    id: `retrofit-envelope-wall-${wall.id || index}`,
    label: "RETROFIT · wall/roof envelope intervention",
    className: "retrofit-envelope-marker",
    x: (wall.a.x + wall.b.x) / 2,
    y: (wall.a.y + wall.b.y) / 2,
    widthM: length,
    depthM: markerThickness,
    heightM: height,
    rotationDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
    source: "user" as const,
    confidence: model.confidence,
    observedState: "RETROFIT TARGET · intervention marker follows evidenced wall geometry; thickness is not a material measurement",
  };
}

/**
 * Build the proposed visual state from the same reconstructed geometry.
 * Retrofit markers are attached only to components that the source twin
 * actually contains. No new engineering dimensions are inferred.
 */
export function buildRetrofitTwin(model: TwinModel, values: Values): TwinModel {
  const proposed = structuredClone(model);
  const currentEfficiency = number(values, "efficiency", "cop", "hvac_cop");
  const targetEfficiency = number(values, "proposed_efficiency", "proposed_cop");
  const currentR = number(values, "existing_r_value_m2k_w", "current_r_value_m2k_w");
  const targetR = number(values, "proposed_r_value_m2k_w", "target_r_value_m2k_w");
  const currentHours = number(values, "annual_hours", "annual_cooling_hours", "runtime_hours", "cooling_hours");
  const targetHours = number(values, "proposed_runtime_hours");
  const glazingUpgrade = positiveDelta(number(values, "proposed_glazing_u_w_m2k", "glazing_u_new"), number(values, "baseline_glazing_u_w_m2k", "glazing_u_old"));
  const hasEfficiencyUpgrade = positiveDelta(targetEfficiency, currentEfficiency);
  const hasEnvelopeUpgrade = positiveDelta(targetR, currentR);
  const hasRuntimeChange = currentHours != null && targetHours != null && targetHours > 0 && targetHours !== currentHours;

  const retrofitNotes: string[] = [];

  if (hasEfficiencyUpgrade || hasRuntimeChange) {
    proposed.assets = proposed.assets.map((asset) => {
      if (!assetIsTargetable(asset)) return asset;
      const notes: string[] = [];
      if (hasEfficiencyUpgrade) notes.push(`RETROFIT TARGET · performance ${targetEfficiency!.toFixed(2)} vs ${currentEfficiency!.toFixed(2)} baseline`);
      if (hasRuntimeChange) notes.push(`CONTROL / RUNTIME TARGET · ${targetHours!.toFixed(0)} h/yr vs ${currentHours!.toFixed(0)} h/yr baseline`);
      return { ...asset, observedState: `${asset.observedState ? `${asset.observedState} · ` : ""}${notes.join(" · ")}` };
    });
    retrofitNotes.push("HVAC/equipment markers are limited to targetable engineering assets actually present in the reconstructed twin.");
  }

  if (hasEnvelopeUpgrade) {
    if (proposed.geometryStatus === "verified-metric") {
      const evidencedWalls = proposed.walls.filter((wall) => wall.source !== "inferred" && wall.confidence >= 0.5);
      const markers = evidencedWalls.map((wall, index) => wallMarker(wall, index, model));
      if (markers.length) proposed.assets = [...proposed.assets, ...markers];
      else proposed.warnings = [...proposed.warnings, "Envelope retrofit selected, but no evidence-backed wall geometry was available for spatial marking."];
      retrofitNotes.push(`Envelope target R ${targetR!.toFixed(3)} vs ${currentR!.toFixed(3)} baseline.`);
    } else {
      proposed.warnings = [...proposed.warnings, "Envelope retrofit is selected but metric geometry is not verified; no dimensional envelope marker was drawn."];
    }
  }

  if (glazingUpgrade) {
    const windows = proposed.openings.filter((opening) => opening.type === "window");
    if (windows.length) {
      const markerHeight = Math.max(Math.min(proposed.overall.heightM * 0.025, 0.12), 0.04);
      const markers = windows.map((opening, index) => ({
        id: `retrofit-glazing-${opening.id || index}`,
        label: "RETROFIT · glazing upgrade",
        className: "retrofit-glazing-marker",
        x: opening.x,
        y: opening.y,
        widthM: opening.widthM,
        depthM: Math.max(Math.min(Math.max(proposed.overall.widthM, proposed.overall.depthM) * 0.004, 0.04), 0.01),
        heightM: markerHeight,
        rotationDeg: 0,
        source: "user" as const,
        confidence: model.confidence,
        observedState: "RETROFIT TARGET · glazing intervention marker tied to an evidenced window opening",
      }));
      proposed.assets = [...proposed.assets, ...markers];
    } else {
      proposed.warnings = [...proposed.warnings, "Glazing retrofit selected, but no evidenced window openings were available for spatial marking."];
    }
  }

  if (hasRuntimeChange) retrofitNotes.push(`Runtime target ${targetHours!.toFixed(0)} h/yr vs ${currentHours!.toFixed(0)} h/yr baseline.`);
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
