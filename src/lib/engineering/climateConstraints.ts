export type ClimateConstraint = {
  id: string;
  label: string;
  trigger: string;
  consequence: string;
  evidenceNeeded: string;
};

export function deriveClimateConstraints(input: {
  temperatureC?: number | null;
  humidityPercent?: number | null;
  sevenDayHighC?: number | null;
  rainMm?: number | null;
  designOutdoorC?: number | null;
}): ClimateConstraint[] {
  const constraints: ClimateConstraint[] = [];
  const high = input.sevenDayHighC ?? input.temperatureC ?? null;
  const design = input.designOutdoorC ?? null;
  if (high != null && design != null && high > design + 0.5) constraints.push({ id: "heat-boundary", label: "Heat-boundary stress", trigger: `Regional high ${high.toFixed(1)} °C exceeds supplied design condition ${design.toFixed(1)} °C.`, consequence: "Re-run explicit thermal scenarios before accepting capacity/right-sizing conclusions.", evidenceNeeded: "Verified design outdoor condition and peak-load evidence." });
  if (input.humidityPercent != null && input.humidityPercent >= 75) constraints.push({ id: "humidity", label: "High-humidity condition", trigger: `${input.humidityPercent.toFixed(0)}% RH context is available.`, consequence: "Check latent-load, ventilation, condensation and controls evidence before claiming comfort gains.", evidenceNeeded: "Humidity trend, ventilation rate and indoor humidity/comfort evidence." });
  if (input.rainMm != null && input.rainMm >= 20) constraints.push({ id: "rain", label: "Wet-envelope condition", trigger: `${input.rainMm.toFixed(0)} mm rain is present in the regional forecast context.`, consequence: "Prioritise roof/wall moisture inspection where envelope retrofit is being considered.", evidenceNeeded: "Roof/wall condition photos, moisture inspection or maintenance records." });
  if (!constraints.length) constraints.push({ id: "baseline", label: "No additional climate constraint", trigger: "No explicit threshold was exceeded by the supplied regional context.", consequence: "Regional weather remains contextual and does not alter engineering inputs by itself.", evidenceNeeded: "Keep using observed/design boundary evidence." });
  return constraints;
}
