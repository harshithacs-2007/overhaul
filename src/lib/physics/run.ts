/**
 * Aggregate early-stage load estimate — transparent components.
 */

import { computeSurfaceHeatTransfer } from "./envelopeLoad";
import { computeSolarGainW } from "./solarGain";
import { computeVentilationLoadW } from "./ventilation";
import { compareHvacCapacity } from "./hvacCapacity";
import type { LoadEstimateResult, PhysicsRunInput, PhysicsRunResult } from "./types";

export function runPhysics(input: PhysicsRunInput): PhysicsRunResult {
  const deltaT = input.outdoorTempC - input.indoorTempC;
  const components = input.surfaces.map((s) =>
    computeSurfaceHeatTransfer(s, input.outdoorTempC, input.indoorTempC)
  );

  const conductionParts = components.filter((c) => c.heatTransferW != null);
  const conductionW =
    conductionParts.length > 0
      ? conductionParts.reduce((s, c) => s + (c.heatTransferW ?? 0), 0)
      : null;

  const solar = computeSolarGainW(input.solar);
  // Cooling: add solar gain magnitude when outdoor warmer; heating solar reduces load
  let solarW: number | null = solar.solarW;
  if (solarW != null && input.mode === "heating") {
    solarW = -Math.abs(solarW);
  }

  const volumeM3 = input.volumeM3 ?? null;
  const vent = computeVentilationLoadW({
    ventilation: input.ventilation,
    volumeM3,
    deltaT_K: deltaT,
  });

  const missing: string[] = [];
  const assumptions: string[] = [
    "Early-stage engineering estimate — not a certified design load",
    `Mode: ${input.mode}`,
  ];

  for (const c of components) {
    if (c.status !== "calculated") missing.push(...c.trace.missingInputs);
  }
  if (solar.status !== "calculated") missing.push(...solar.trace.missingInputs);
  if (vent.status !== "calculated") missing.push(...vent.trace.missingInputs);

  const parts: number[] = [];
  if (conductionW != null) parts.push(conductionW);
  if (solarW != null) parts.push(solarW);
  if (vent.ventilationW != null) parts.push(vent.ventilationW);

  let status: LoadEstimateResult["status"] = "unavailable";
  let totalW: number | null = null;
  if (parts.length === 0) {
    status = "unavailable";
  } else if (
    components.every((c) => c.status === "calculated") &&
    solar.status === "calculated" &&
    vent.status === "calculated"
  ) {
    status = "calculated";
    totalW = parts.reduce((a, b) => a + b, 0);
  } else {
    status = "partial";
    totalW = parts.reduce((a, b) => a + b, 0);
  }

  // For HVAC compare use absolute cooling/heating demand from conduction+vent+solar as applicable
  const requiredKW = totalW != null ? Math.abs(totalW) / 1000 : null;

  const load: LoadEstimateResult = {
    status,
    label: "Early-stage thermal load estimate",
    conductionW,
    solarW,
    ventilationW: vent.ventilationW,
    totalW,
    totalKW: requiredKW,
    components,
    traces: [
      ...components.map((c) => c.trace),
      solar.trace,
      vent.trace,
    ],
    missingInputs: [...new Set(missing)],
    assumptions,
  };

  const hvac = compareHvacCapacity(requiredKW, input.hvac);

  return {
    mode: input.mode,
    outdoorTempC: input.outdoorTempC,
    outdoorTempSource: input.outdoorTempSource,
    indoorTempC: input.indoorTempC,
    load,
    hvac,
    ranAt: new Date().toISOString(),
  };
}
