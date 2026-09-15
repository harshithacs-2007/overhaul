export type EngineeringObservation = {
  field: string;
  value: string;
  numericValue: number | null;
  unit: string | null;
  confidence: number;
  sourceText?: string;
  notes?: string;
};

const FIELD_ALIASES: Record<string, string> = {
  rated_capacity_kw: "capacity_kw",
  hvac_capacity_kw: "capacity_kw",
  input_power_kw: "power_kw",
  electrical_power_kw: "power_kw",
  operating_power_kw: "power_kw",
  operating_load_kw: "load_kw",
  cooling_load_kw: "load_kw",
  hvac_load_kw: "load_kw",
  annual_runtime_hours: "annual_hours",
  annual_cooling_hours: "annual_cooling_hours",
  cooling_hours_annual: "annual_cooling_hours",
  tariff_inr_per_kwh: "electricity_rate_inr_per_kwh",
  electricity_rate_inr_kwh: "electricity_rate_inr_per_kwh",
  r_value_m2k_w: "existing_r_value_m2k_w",
  current_r_value_m2k_w: "existing_r_value_m2k_w",
  proposed_r_value: "proposed_r_value_m2k_w",
  target_r_value_m2k_w: "proposed_r_value_m2k_w",
  building_envelope_area_m2: "envelope_area_m2",
  envelope_surface_area_m2: "envelope_area_m2",
  wall_roof_envelope_area_m2: "envelope_area_m2",
};

function canonical(field: string) {
  return field.toLowerCase().trim().replace(/[()\-\/]+/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_");
}

function unitKey(unit: string | null) {
  return (unit || "").toLowerCase().replace(/\s+/g, "").replace(/²/g, "2");
}

function convert(value: number, unit: string | null): { value: number; unit: string } | null {
  const u = unitKey(unit);
  if (u === "kw") return { value, unit: "kW" };
  if (u === "w") return { value: value / 1000, unit: "kW" };
  if (u === "mw") return { value: value * 1000, unit: "kW" };
  if (u === "hp" || u === "bhp") return { value: value * 0.745699872, unit: "kW" };
  if (["h", "hr", "hrs", "hour", "hours"].includes(u)) return { value, unit: "h/yr" };
  if (["min", "mins", "minute", "minutes"].includes(u)) return { value: value / 60, unit: "h/yr" };
  return null;
}

export function normalizeObservationForEngineering(observation: EngineeringObservation): EngineeringObservation {
  const originalField = canonical(observation.field);
  const alias = FIELD_ALIASES[originalField];
  let field = alias || originalField;
  let numericValue = observation.numericValue;
  let unit = observation.unit;
  const originalUnit = unitKey(unit);
  const engineeringField = ["capacity_kw", "power_kw", "load_kw", "annual_hours", "annual_cooling_hours"].includes(field);

  if (numericValue != null && Number.isFinite(numericValue) && engineeringField) {
    const converted = convert(numericValue, unit);
    const powerUnit = ["kw", "w", "mw", "hp", "bhp"].includes(originalUnit);
    const hourUnit = ["h", "hr", "hrs", "hour", "hours", "min", "mins", "minute", "minutes"].includes(originalUnit);

    if (["capacity_kw", "power_kw", "load_kw"].includes(field) && converted && powerUnit) {
      numericValue = converted.value;
      unit = converted.unit;
    } else if (["annual_hours", "annual_cooling_hours"].includes(field) && converted && hourUnit) {
      numericValue = converted.value;
      unit = converted.unit;
    } else {
      field = `${originalField}_unresolved`;
    }
  }

  return {
    ...observation,
    field,
    numericValue,
    unit,
    notes: [observation.notes, field !== originalField ? `Engineering field normalized from ${originalField}.` : "", field.endsWith("_unresolved") ? "Excluded from deterministic calculations until a compatible unit is established." : ""].filter(Boolean).join(" "),
  };
}

export function normalizeExtractionObservations<T extends { observations?: EngineeringObservation[] }>(extraction: T): T {
  return {
    ...extraction,
    observations: (extraction.observations || []).map(normalizeObservationForEngineering),
  };
}
